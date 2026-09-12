import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getServiceClient, hasSupabaseCredentials } from "@/lib/db/supabase";
import { createProperty } from "@/lib/db/properties";
import { createTenancy, getTenancy } from "@/lib/db/tenancies";
import { getOrCreateInspection } from "@/lib/db/inspections";
import { savePartyDetails, listPartyDetails } from "@/lib/tenancy/party-details";
import { sendForSigning, signingReadiness } from "@/lib/tenancy/signing";
import { handleRoundCompleted } from "@/lib/tenancy/round-completed";
import { generateEncryptionKey } from "@/lib/identity/crypto";
import { getEsinettiClient, resetEsinettiClientForTests } from "@/lib/esinetti";
import type { WebhookEvent } from "@/lib/esinetti";
import { hasInspectionRooms } from "../migration-probe";

/**
 * Allekirjoituskierros eSinetin mockia vasten (CLAUDE.md 5.4).
 *
 * ===========================================================================
 * MITÄ TÄSSÄ TESTATAAN
 *
 * Ei sitä, että eSinetti toimii — se on eSinetin oma asia. Vaan se, että
 * Reilusoppari ei lähetä kierrosta liian aikaisin ja että valmiin kierroksen
 * käsittely on idempotentti.
 *
 * Jälkimmäinen on tärkein: eSinetti toistaa tapahtuman, jos vastauksemme ei
 * mennyt perille. Ilman idempotenssia toisto tuottaisi kaksinkertaiset
 * vuokrakaudet — eli vuokralaiselle kaksi laskua kuukaudessa.
 * ===========================================================================
 */

process.env.PERSON_DATA_KEY ??= generateEncryptionKey();

/*
  Katselmus tarvitsee migraation 0005 (`rs_photos.room`). Ilman sitä testit
  kaatuisivat viestiin "kuvien haku epäonnistui", joka ei kerro puuttuvasta
  migraatiosta mitään. Ohitus on näkyvä ja nimeää migraation.
*/
const RUN = hasSupabaseCredentials() && (await hasInspectionRooms());

if (hasSupabaseCredentials() && !RUN) {
  console.warn(
    "[testit] Migraatio 0005 (rs_photos.room) puuttuu kannasta — allekirjoitustestit ohitetaan.",
  );
}
const PREFIX = `testi-allek-${Date.now()}`;

const created = { users: [] as string[], properties: [] as string[], tenancies: [] as string[] };
let seuraava = 0;

async function createUser(label: string): Promise<string> {
  const sub = `${PREFIX}-${label}-${(seuraava += 1)}`;
  const { data, error } = await getServiceClient()
    .from("rs_users")
    .insert({ auth0_sub: sub, email: `${sub}@example.invalid` })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  created.users.push(data.id);
  return data.id;
}

async function setup() {
  const landlord = await createUser("landlord");
  const property = await createProperty(landlord, {
    name: null,
    street: "Testikatu 1",
    postalCode: "00100",
    city: "Helsinki",
    propertyType: "kerrostalo",
    rooms: 2,
    areaM2: 54,
    housingCompany: null,
    tenure: "osake",
  });
  created.properties.push(property.id);

  const { tenancy } = await createTenancy(landlord, {
    propertyId: property.id,
    startDate: "2026-09-01",
    endDate: null,
    rentAmount: 850,
    rentDueDay: 5,
    depositAmount: 1700,
    tenants: [{ name: "Maija Meikäläinen", email: `${PREFIX}-t${seuraava}@example.invalid` }],
  });
  created.tenancies.push(tenancy.id);

  return { landlord, tenancyId: tenancy.id };
}

/** Täyttää osapuolten tiedot niin, ettei mikään puutu. */
async function fillParties(landlord: string, tenancyId: string) {
  const parties = await listPartyDetails(landlord, tenancyId);

  for (const party of parties) {
    await savePartyDetails(landlord, tenancyId, party.partyId, {
      name: party.role === "landlord" ? "Matti Virtanen" : "Maija Meikäläinen",
      partyType: "henkilo",
      personalId: party.role === "landlord" ? "131052-308T" : "010594Y123W",
      businessId: null,
      signatoryName: null,
      phone: null,
      email: `${PREFIX}-${party.role}@example.invalid`,
      bankAccount: party.role === "landlord" ? "FI21 1234 5600 0007 85" : null,
      clearPersonalId: false,
    });
  }
}

/**
 * Lukitsee katselmuksen suoraan kantaan.
 *
 * Lukitussääntö on testattu erikseen puhtaana funktiona
 * (`inspection-lock.test.ts`). Tässä tarvitaan vain lopputila, ja kuvien
 * lataaminen Storageen tekisi testistä hitaan ilman että se kertoisi
 * allekirjoituksesta mitään.
 */
async function lockInspectionDirectly(userId: string, tenancyId: string) {
  // Katselmusrivi syntyy vasta ensimmäisellä haulla. Ilman tätä UPDATE ei
  // osunut mihinkään, ja tila jäi auki — testi väitti lukinneensa mutta ei
  // ollut lukinnut.
  await getOrCreateInspection(userId, tenancyId);

  await getServiceClient()
    .from("rs_inspections")
    .update({ status: "locked", locked_at: new Date().toISOString() })
    .eq("tenancy_id", tenancyId)
    .eq("kind", "initial");
}

/**
 * Merkitsee vuokrasuhteen maksetuksi suoraan kantaan.
 *
 * Hinnoittelusäännöt on testattu erikseen puhtaina funktioina
 * (`billing-pricing.test.ts`). Tässä tarvitaan vain lopputila: maksu on
 * allekirjoituksen viimeinen portti, eikä sen läpi pääse ilman merkintää.
 */
async function markPaidDirectly(tenancyId: string) {
  await getServiceClient()
    .from("rs_tenancies")
    .update({ paid_via: "free", paid_at: new Date().toISOString() })
    .eq("id", tenancyId);
}

function completedEvent(roundId: string, tenancyId: string): WebhookEvent {
  return {
    id: `evt_${roundId}`,
    event: "round.completed",
    createdAt: new Date().toISOString(),
    roundId,
    externalRef: `tenancy:${tenancyId}:alku`,
    status: "completed",
    signers: [
      {
        id: "s1",
        name: "Matti Virtanen",
        email: `${PREFIX}-landlord@example.invalid`,
        roleLabel: "Vuokranantaja",
        status: "signed",
        openedAt: null,
        identifiedAt: null,
        signedAt: new Date().toISOString(),
        declinedAt: null,
      },
    ],
    documents: [],
  };
}

beforeEach(() => {
  // Ilman avainta mock valikoituu, ja juuri sitä tässä ajetaan.
  delete process.env.ESINETTI_API_KEY;
  resetEsinettiClientForTests();
});

afterAll(async () => {
  if (!RUN) return;
  const db = getServiceClient();
  for (const id of created.tenancies) await db.from("rs_tenancies").delete().eq("id", id);
  for (const id of created.properties) await db.from("rs_properties").delete().eq("id", id);
  for (const id of created.users) await db.from("rs_users").delete().eq("id", id);
});

describe.skipIf(!RUN)("allekirjoituskierroksen ehdot", () => {
  it("estyy ennen katselmuksen lukitusta", async () => {
    /*
      Sopimus ja pöytäkirja allekirjoitetaan yhdessä. Jos kierroksen voisi
      lähettää ennen lukitusta, pöytäkirjaa ei olisi olemassa — ja
      allekirjoitus koskisi vain sopimusta.
    */
    const { landlord, tenancyId } = await setup();
    await fillParties(landlord, tenancyId);

    const valmius = await signingReadiness(landlord, tenancyId);
    expect(valmius.ready).toBe(false);
    if (!valmius.ready) expect(valmius.reason).toBe("inspection_not_locked");
  }, 30_000);

  it("estyy jos osapuolten tiedot ovat kesken", async () => {
    // Allekirjoituksen jälkeen sopimusta ei voi korjata.
    const { landlord, tenancyId } = await setup();
    await lockInspectionDirectly(landlord, tenancyId);

    const valmius = await signingReadiness(landlord, tenancyId);
    expect(valmius.ready).toBe(false);
    if (valmius.ready) return;
    expect(valmius.reason).toBe("party_details_missing");
    expect(valmius.missing?.length).toBeGreaterThan(0);
  }, 30_000);

  it("estyy vuokralaiselta", async () => {
    const { landlord, tenancyId } = await setup();
    const tenantUser = await createUser("tenant-user");

    const tenantParty = (await listPartyDetails(landlord, tenancyId)).find(
      (party) => party.role === "tenant",
    )!;
    await getServiceClient()
      .from("rs_tenancy_parties")
      .update({ user_id: tenantUser })
      .eq("id", tenantParty.partyId);

    const valmius = await signingReadiness(tenantUser, tenancyId);
    expect(valmius.ready).toBe(false);
    if (!valmius.ready) expect(valmius.reason).toBe("not_landlord");
  }, 30_000);

  it("estyy ennen maksua, vaikka kaikki muu olisi kunnossa", async () => {
    /*
      Maksu on viimeinen portti: kierroksen lähetys vie vuokralaiselle kutsun
      ja maksaa tunnistautumisen. Se on myös se hetki, jossa kuluttajan
      peruutusoikeus raukeaa (`billing/withdrawal.ts`).
    */
    const { landlord, tenancyId } = await setup();
    await fillParties(landlord, tenancyId);
    await lockInspectionDirectly(landlord, tenancyId);

    const valmius = await signingReadiness(landlord, tenancyId);
    expect(valmius.ready).toBe(false);
    if (!valmius.ready) expect(valmius.reason).toBe("not_paid");
  }, 30_000);

  it("onnistuu kun kaikki on kunnossa", async () => {
    const { landlord, tenancyId } = await setup();
    await fillParties(landlord, tenancyId);
    await lockInspectionDirectly(landlord, tenancyId);
    await markPaidDirectly(tenancyId);

    expect(await signingReadiness(landlord, tenancyId)).toEqual({ ready: true });
  }, 30_000);
});

describe.skipIf(!RUN)("kierroksen lähetys", () => {
  it("luo kierroksen, jolla on molemmat asiakirjat", async () => {
    const { landlord, tenancyId } = await setup();
    await fillParties(landlord, tenancyId);
    await lockInspectionDirectly(landlord, tenancyId);
    await markPaidDirectly(tenancyId);

    const result = await sendForSigning(landlord, tenancyId);
    // Viesti mukaan väitteeseen: pelkkä `ok: false` ei kerro miksi.
    expect(result.message ?? "ei virhettä").toBe("ei virhettä");
    expect(result.ok).toBe(true);
    expect(result.round?.documents.map((doc) => doc.name)).toEqual([
      "Vuokrasopimus.pdf",
      "Alkukatselmus.pdf",
    ]);

    // Vuokrasuhde siirtyy allekirjoitustilaan.
    expect((await getTenancy(landlord, tenancyId))?.status).toBe("signing");
  }, 60_000);

  it("ei lähetä samaa kierrosta kahdesti", async () => {
    const { landlord, tenancyId } = await setup();
    await fillParties(landlord, tenancyId);
    await lockInspectionDirectly(landlord, tenancyId);
    await markPaidDirectly(tenancyId);

    expect((await sendForSigning(landlord, tenancyId)).ok).toBe(true);

    const toinen = await signingReadiness(landlord, tenancyId);
    expect(toinen.ready).toBe(false);
    if (!toinen.ready) expect(toinen.reason).toBe("already_sent");
  }, 60_000);
});

describe.skipIf(!RUN)("valmiin kierroksen käsittely", () => {
  it("vie vuokrasuhteen käyntiin ja generoi vuokrakaudet", async () => {
    const { landlord, tenancyId } = await setup();
    await fillParties(landlord, tenancyId);
    await lockInspectionDirectly(landlord, tenancyId);
    await markPaidDirectly(tenancyId);

    const sent = await sendForSigning(landlord, tenancyId);
    const roundId = sent.round!.id;

    // Mock merkitsee kierroksen valmiiksi, kun kaikki ovat allekirjoittaneet;
    // tässä riittää tapahtuma, jonka eSinetti lähettäisi.
    await handleRoundCompleted(completedEvent(roundId, tenancyId), tenancyId);

    expect((await getTenancy(landlord, tenancyId))?.status).toBe("active");

    const { data: periods } = await getServiceClient()
      .from("rs_rent_periods")
      .select("id")
      .eq("tenancy_id", tenancyId);

    expect((periods ?? []).length).toBeGreaterThan(0);
  }, 60_000);

  it("toistettu tapahtuma ei tuota kaksinkertaisia vuokrakausia", async () => {
    /*
      eSinetti toistaa tapahtuman, jos vastauksemme ei mennyt perille.
      Ilman idempotenssia vuokralainen saisi kaksi laskua kuukaudessa.
    */
    const { landlord, tenancyId } = await setup();
    await fillParties(landlord, tenancyId);
    await lockInspectionDirectly(landlord, tenancyId);
    await markPaidDirectly(tenancyId);

    const sent = await sendForSigning(landlord, tenancyId);
    const event = completedEvent(sent.round!.id, tenancyId);

    const first = await handleRoundCompleted(event, tenancyId);
    const second = await handleRoundCompleted(event, tenancyId);

    expect(first).toEqual({ handled: true, alreadyDone: false });
    expect(second).toEqual({ handled: true, alreadyDone: true });

    const { data: periods } = await getServiceClient()
      .from("rs_rent_periods")
      .select("id")
      .eq("tenancy_id", tenancyId);

    const { data: onceMore } = await getServiceClient()
      .from("rs_rent_periods")
      .select("period_month")
      .eq("tenancy_id", tenancyId);

    const months = new Set((onceMore ?? []).map((row) => (row as { period_month: string }).period_month));
    expect(months.size).toBe((periods ?? []).length);
  }, 60_000);

  it("merkitsee allekirjoittajan henkilöllisyyden todennetuksi", async () => {
    // Vahva tunnistautuminen tapahtui eSinetissä. Tieto siitä on se, minkä
    // varaan vuokratodistuksen arvo myöhemmin rakentuu.
    const { landlord, tenancyId } = await setup();
    await fillParties(landlord, tenancyId);
    await lockInspectionDirectly(landlord, tenancyId);
    await markPaidDirectly(tenancyId);

    const sent = await sendForSigning(landlord, tenancyId);
    await handleRoundCompleted(completedEvent(sent.round!.id, tenancyId), tenancyId);

    const { data } = await getServiceClient()
      .from("rs_users")
      .select("identity_verified_at, name")
      .eq("id", landlord)
      .single();

    const row = data as { identity_verified_at: string | null; name: string | null };
    expect(row.identity_verified_at).not.toBeNull();
    expect(row.name).toBe("Matti Virtanen");
  }, 60_000);

  it("sivuuttaa tuntemattoman vuokrasuhteen", async () => {
    const outcome = await handleRoundCompleted(
      completedEvent("round_x", "00000000-0000-0000-0000-000000000000"),
      "00000000-0000-0000-0000-000000000000",
    );
    expect(outcome.handled).toBe(false);
  }, 30_000);
});

describe.skipIf(!RUN)("mock on käytössä ilman avainta", () => {
  it("kierros syntyy ilman oikeaa eSinettiä", async () => {
    const round = await getEsinettiClient().createRound({
      title: "Testi",
      documents: [{ name: "a.pdf", pdfBytes: new Uint8Array([1, 2, 3]) }],
      signers: [{ name: "Matti", email: "matti@example.invalid" }],
    });
    expect(round.id).toBeTruthy();
  });
});
