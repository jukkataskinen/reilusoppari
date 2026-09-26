import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { getServiceClient, hasSupabaseCredentials } from "@/lib/db/supabase";
import { createProperty } from "@/lib/db/properties";
import {
  acceptInvite,
  createTenancy,
  findTenancyByInvite,
  getTenancy,
} from "@/lib/db/tenancies";
import {
  getInspectionOverview,
  getOrCreateInspection,
  listInspectionPhotos,
  lockInspection,
  markTenantReady,
  recordInspectionPhoto,
} from "@/lib/db/inspections";
import { NotAuthorizedError } from "@/lib/db/access";
import { stripImageMetadata } from "@/lib/photos/strip-metadata";
import { savePartyDetails, listPartyDetails } from "@/lib/tenancy/party-details";
import { startTenancyCheckout } from "@/lib/billing/checkout";
import { sendForSigning } from "@/lib/tenancy/signing";
import { handleRoundCompleted } from "@/lib/tenancy/round-completed";
import { generateEncryptionKey } from "@/lib/identity/crypto";
import { resetEsinettiClientForTests } from "@/lib/esinetti";
import type { WebhookEvent } from "@/lib/esinetti";
import { hasInspectionRooms } from "../migration-probe";

/**
 * Alkukaari yhtenä ketjuna eSinetin mockia vasten (CLAUDE.md 7, vaihe 1:n DoD):
 * asunto → vuokrasuhde → kutsu → liittyminen → molemmat kuvaavat → valmis →
 * lukitus → maksu (ilmainen ensimmäinen) → allekirjoituskierros → valmis
 * kierros → vuokrasuhde käynnissä. Lopuksi ulkopuolinen ei näe mitään.
 *
 * ===========================================================================
 * MIKSI TÄMÄ ON OLEMASSA, KUN OSAT ON JO TESTATTU
 *
 * `signing.test.ts` testaa kierroksen ehdot, mutta se lukitsee katselmuksen
 * ja merkitsee maksun suoraan kantaan. Se on oikein siellä, mutta silloin
 * mikään testi ei kulje kaarta niin kuin käyttäjä: kutsulinkin kautta
 * liittynyt vuokralainen, oikea lukitussääntö ja oikea maksupolku. Vika
 * vaiheiden välisessä saumassa — esimerkiksi liittyminen, joka ei kirjaa
 * `joined_at`:ia, jolloin lukitus ei koskaan avaudu — ei näkyisi missään.
 *
 * MIKSI VITEST EIKÄ PLAYWRIGHT
 *
 * Selaintesti vaatisi kirjautumisen Auth0:aan, eikä sovelluksessa ole (eikä
 * pidä olla) testikirjautumista, jonka voisi vahingossa jättää päälle
 * tuotannossa. Tämä testi kutsuu samoja funktioita, joita reitit ja
 * palvelintoiminnot kutsuvat, kirjautumisen jälkeisestä kohdasta alkaen.
 * Kuvan kohdalla se tekee saman kuin kuvareitti: metatiedot pois, tiedosto
 * Storageen, rivi `rs_photos`:iin.
 *
 * Ajetaan vain, kun kanta on käytettävissä (kuten muutkin kantatestit).
 * ===========================================================================
 */

process.env.PERSON_DATA_KEY ??= generateEncryptionKey();

const RUN =
  hasSupabaseCredentials() &&
  Boolean(process.env.INVITE_TOKEN_SECRET) &&
  (await hasInspectionRooms());

const PREFIX = `testi-kaari-${Date.now()}`;
const TENANT_EMAIL = `${PREFIX}-tenant@example.invalid`;

const created = {
  users: [] as string[],
  properties: [] as string[],
  tenancies: [] as string[],
  files: [] as string[],
};

async function createUser(label: string, email = `${PREFIX}-${label}@example.invalid`) {
  const { data, error } = await getServiceClient()
    .from("rs_users")
    .insert({ auth0_sub: `${PREFIX}-${label}`, email })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  created.users.push(data.id);
  return data.id as string;
}

/** Piirretty testikuva. Ei oikea valokuva eikä kenenkään koti. */
function testPhoto(label: string): Uint8Array {
  const canvas = createCanvas(320, 240);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e8eef5";
  ctx.fillRect(0, 0, 320, 240);
  ctx.fillStyle = "#1b2a41";
  ctx.font = "20px sans-serif";
  ctx.fillText(label, 20, 120);
  return new Uint8Array(canvas.toBuffer("image/jpeg", 80));
}

/** Sama käsittely kuin katselmuksen kuvareitillä. */
async function photograph(userId: string, tenancyId: string, room: string, label: string) {
  const inspection = await getOrCreateInspection(userId, tenancyId);
  const cleaned = stripImageMetadata(testPhoto(label));
  const storagePath = `${tenancyId}/${inspection.id}/${randomUUID()}.jpg`;

  const { error } = await getServiceClient()
    .storage.from("photos")
    .upload(storagePath, cleaned.bytes, { contentType: cleaned.format, upsert: false });
  if (error) throw new Error(error.message);
  created.files.push(storagePath);

  await recordInspectionPhoto({
    tenancyId,
    inspectionId: inspection.id,
    uploaderUserId: userId,
    room,
    note: null,
    storagePath,
    thumbnailPath: null,
    sha256: createHash("sha256").update(cleaned.bytes).digest("hex"),
    bytes: cleaned.bytes.byteLength,
    width: cleaned.width,
    height: cleaned.height,
  });
}

const state = {
  landlord: "",
  tenant: "",
  outsider: "",
  tenancyId: "",
  token: "",
  roundId: "",
};

beforeAll(() => {
  // Ilman avainta mock valikoituu, ja juuri sitä tässä ajetaan.
  delete process.env.ESINETTI_API_KEY;
  resetEsinettiClientForTests();
});

afterAll(async () => {
  if (!RUN) return;
  const db = getServiceClient();
  if (created.files.length > 0) await db.storage.from("photos").remove(created.files);
  for (const id of created.tenancies) await db.from("rs_tenancies").delete().eq("id", id);
  for (const id of created.properties) await db.from("rs_properties").delete().eq("id", id);
  for (const id of created.users) await db.from("rs_users").delete().eq("id", id);
});

/*
  Vaiheet ovat peräkkäisiä ja riippuvat toisistaan. Vitest ajaa saman
  describe-lohkon testit järjestyksessä, kun `concurrent` ei ole päällä.
*/
describe.skipIf(!RUN)("alkukaari mockia vasten", () => {
  it("vuokranantaja luo asunnon ja vuokrasuhteen, kutsu syntyy", async () => {
    state.landlord = await createUser("landlord");
    state.outsider = await createUser("outsider");

    const property = await createProperty(state.landlord, {
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

    const { tenancy, invites } = await createTenancy(state.landlord, {
      propertyId: property.id,
      startDate: "2026-10-01",
      endDate: null,
      rentAmount: 850,
      rentDueDay: 5,
      depositAmount: 1700,
      tenants: [{ name: "Maija Meikäläinen", email: TENANT_EMAIL }],
    });
    created.tenancies.push(tenancy.id);
    state.tenancyId = tenancy.id;

    expect(invites).toHaveLength(1);
    state.token = invites[0].token;
  }, 30_000);

  it("kutsulinkki avautuu ilman kirjautumista ja näyttää vain pääkohdat", async () => {
    const preview = await findTenancyByInvite(state.token);
    expect(preview).not.toBeNull();
    expect(preview!.inviteEmail).toBe(TENANT_EMAIL);
  }, 30_000);

  it("väärällä tilillä kutsu ei kulu, oikealla vuokralainen liittyy", async () => {
    expect(await acceptInvite(state.token, state.outsider, `${PREFIX}-outsider@example.invalid`))
      .toEqual({ ok: false, reason: "wrong_account" });

    state.tenant = await createUser("tenant", TENANT_EMAIL);
    expect(await acceptInvite(state.token, state.tenant, TENANT_EMAIL)).toEqual({
      ok: true,
      tenancyId: state.tenancyId,
    });

    // Vuokralainen näkee vuokrasuhteen liittymisen jälkeen.
    expect(await getTenancy(state.tenant, state.tenancyId)).not.toBeNull();
  }, 30_000);

  it("molemmat kuvaavat, ja toisen kuvat näkyvät heti", async () => {
    await photograph(state.landlord, state.tenancyId, "Keittiö", "keittiö");
    await photograph(state.tenant, state.tenancyId, "Kylpyhuone", "kylpyhuone");
    // Tila, jota oletuslistalla ei ole: syntyy siitä, että joku kuvaa sen.
    await photograph(state.tenant, state.tenancyId, "Parveke", "parveke");

    const inspection = await getOrCreateInspection(state.landlord, state.tenancyId);
    const seenByLandlord = await listInspectionPhotos(state.landlord, state.tenancyId, inspection.id);
    const seenByTenant = await listInspectionPhotos(state.tenant, state.tenancyId, inspection.id);
    expect(seenByLandlord).toHaveLength(3);
    expect(seenByTenant).toHaveLength(3);
  }, 60_000);

  it("lukitus on estetty, kunnes vuokralainen on valmis", async () => {
    // Vuokralainen avaa katselmuksen; 24 h ei ole kulunut.
    await getInspectionOverview(state.tenant, state.tenancyId);

    const early = await lockInspection(state.landlord, state.tenancyId);
    expect(early.allowed).toBe(false);

    await markTenantReady(state.tenant, state.tenancyId);
    expect(await lockInspection(state.landlord, state.tenancyId)).toEqual({ allowed: true });

    const inspection = await getOrCreateInspection(state.landlord, state.tenancyId);
    expect(inspection.status).toBe("locked");
  }, 60_000);

  it("osapuolten tiedot ja ilmainen ensimmäinen vuokrasuhde", async () => {
    for (const party of await listPartyDetails(state.landlord, state.tenancyId)) {
      await savePartyDetails(state.landlord, state.tenancyId, party.partyId, {
        name: party.role === "landlord" ? "Matti Virtanen" : "Maija Meikäläinen",
        partyType: "henkilo",
        // Väestörekisterikeskuksen julkaisemat esimerkkitunnukset, ei oikeita.
        personalId: party.role === "landlord" ? "131052-308T" : "010594Y123W",
        businessId: null,
        signatoryName: null,
        phone: null,
        email: party.role === "landlord" ? `${PREFIX}-landlord@example.invalid` : TENANT_EMAIL,
        bankAccount: party.role === "landlord" ? "FI21 1234 5600 0007 85" : null,
        clearPersonalId: false,
      });
    }

    const checkout = await startTenancyCheckout({
      userId: state.landlord,
      tenancyId: state.tenancyId,
      consentGiven: true,
      appUrl: "http://127.0.0.1:3100",
    });
    expect(checkout).toMatchObject({ ok: true, paid: true });
  }, 60_000);

  it("allekirjoituskierros lähtee molemmilla asiakirjoilla", async () => {
    const sent = await sendForSigning(state.landlord, state.tenancyId);
    expect(sent.message ?? "ei virhettä").toBe("ei virhettä");
    expect(sent.round?.documents.map((doc) => doc.name)).toEqual([
      "Vuokrasopimus.pdf",
      "Alkukatselmus.pdf",
    ]);
    state.roundId = sent.round!.id;
    expect((await getTenancy(state.landlord, state.tenancyId))?.status).toBe("signing");
  }, 90_000);

  it("valmis kierros vie vuokrasuhteen käyntiin", async () => {
    const now = new Date().toISOString();
    const event: WebhookEvent = {
      id: `evt_${state.roundId}`,
      event: "round.completed",
      createdAt: now,
      roundId: state.roundId,
      externalRef: `tenancy:${state.tenancyId}:alku`,
      status: "completed",
      signers: [
        {
          id: "s1",
          name: "Maija Meikäläinen",
          email: TENANT_EMAIL,
          roleLabel: "Vuokralainen",
          status: "signed",
          openedAt: null,
          identifiedAt: null,
          signedAt: now,
          declinedAt: null,
        },
        {
          id: "s2",
          name: "Matti Virtanen",
          email: `${PREFIX}-landlord@example.invalid`,
          roleLabel: "Vuokranantaja",
          status: "signed",
          openedAt: null,
          identifiedAt: null,
          signedAt: now,
          declinedAt: null,
        },
      ],
      documents: [],
    };

    expect(await handleRoundCompleted(event, state.tenancyId)).toEqual({
      handled: true,
      alreadyDone: false,
    });
    expect((await getTenancy(state.tenant, state.tenancyId))?.status).toBe("active");

    const { data: periods } = await getServiceClient()
      .from("rs_rent_periods")
      .select("id")
      .eq("tenancy_id", state.tenancyId);
    expect((periods ?? []).length).toBeGreaterThan(0);
  }, 60_000);

  it("ulkopuolinen ei näe vuokrasuhteesta mitään", async () => {
    expect(await getTenancy(state.outsider, state.tenancyId)).toBeNull();
    await expect(getOrCreateInspection(state.outsider, state.tenancyId)).rejects.toBeInstanceOf(
      NotAuthorizedError,
    );
    await expect(listPartyDetails(state.outsider, state.tenancyId)).rejects.toBeInstanceOf(
      NotAuthorizedError,
    );
  }, 30_000);
});
