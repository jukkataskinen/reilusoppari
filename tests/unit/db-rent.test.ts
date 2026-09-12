import { afterAll, describe, expect, it } from "vitest";
import { getServiceClient, hasSupabaseCredentials } from "@/lib/db/supabase";
import { createProperty } from "@/lib/db/properties";
import { createRentPeriods, createTenancy } from "@/lib/db/tenancies";
import { commentOnConfirmation, confirmRent, listRentPeriods } from "@/lib/db/rent";
import { listPartyDetails } from "@/lib/tenancy/party-details";
import { generateEncryptionKey } from "@/lib/identity/crypto";
import { hasPaidAt } from "../migration-probe";

/**
 * Vuokran kuittaus oikeaa Supabasea vasten (CLAUDE.md 5.5).
 *
 * Painopiste on siinä, kuka saa tehdä mitä: vuokranantaja kuittaa,
 * vuokralainen kommentoi, ja kumpikaan ei pääse toisen merkintään. Jos
 * roolit sekoittuisivat, historia ei kertoisi kumman näkemys se on.
 */

process.env.PERSON_DATA_KEY ??= generateEncryptionKey();

/*
  Kuittaus kirjoittaa `paid_at`-sarakkeen (migraatio 0008). Ilman sitä testit
  kaatuisivat viestiin "Kuittaus ei onnistunut", joka ei kerro puuttuvasta
  migraatiosta mitään.
*/
const RUN = hasSupabaseCredentials() && (await hasPaidAt());

if (hasSupabaseCredentials() && !RUN) {
  console.warn(
    "[testit] Migraatio 0008 (rs_rent_confirmations.paid_at) puuttuu kannasta — kuittaustestit ohitetaan.",
  );
}
const PREFIX = `testi-vuokra-${Date.now()}`;
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
    endDate: "2027-02-28",
    rentAmount: 850,
    rentDueDay: 5,
    depositAmount: 1700,
    tenants: [{ name: "Maija Meikäläinen", email: `${PREFIX}-t${seuraava}@example.invalid` }],
  });
  created.tenancies.push(tenancy.id);
  await createRentPeriods(tenancy.id, tenancy);

  const tenantUser = await createUser("tenant");
  const tenantParty = (await listPartyDetails(landlord, tenancy.id)).find(
    (party) => party.role === "tenant",
  )!;
  await getServiceClient()
    .from("rs_tenancy_parties")
    .update({ user_id: tenantUser })
    .eq("id", tenantParty.partyId);

  const periods = await listRentPeriods(landlord, tenancy.id);
  return { landlord, tenantUser, tenancyId: tenancy.id, periods };
}

afterAll(async () => {
  if (!RUN) return;
  const db = getServiceClient();
  for (const id of created.tenancies) await db.from("rs_tenancies").delete().eq("id", id);
  for (const id of created.properties) await db.from("rs_properties").delete().eq("id", id);
  for (const id of created.users) await db.from("rs_users").delete().eq("id", id);
});

describe.skipIf(!RUN)("vuokran kuittaus", () => {
  it("vuokranantaja kuittaa ja molemmat näkevät merkinnän", async () => {
    const { landlord, tenantUser, tenancyId, periods } = await setup();

    expect(await confirmRent(landlord, tenancyId, periods[0].id, "paid", null)).toEqual({
      ok: true,
    });

    for (const userId of [landlord, tenantUser]) {
      const nakyma = await listRentPeriods(userId, tenancyId);
      expect(nakyma[0].confirmation?.status).toBe("paid");
    }
  }, 30_000);

  it("vuokralainen ei voi kuitata", async () => {
    // Hän ei näe vuokranantajan tiliä. Hänen kanavansa on kommentti.
    const { tenantUser, tenancyId, periods } = await setup();

    const tulos = await confirmRent(tenantUser, tenancyId, periods[0].id, "paid", null);
    expect(tulos.ok).toBe(false);
    if (!tulos.ok) expect(tulos.message).toContain("Vain vuokranantaja");
  }, 30_000);

  it("vuokranantaja ei voi kommentoida omaa kuittaustaan", async () => {
    // Kommentti on vastine, ei toinen kuittaus.
    const { landlord, tenancyId, periods } = await setup();
    await confirmRent(landlord, tenancyId, periods[0].id, "not_yet", null);

    const tulos = await commentOnConfirmation(landlord, tenancyId, periods[0].id, "Selitys");
    expect(tulos.ok).toBe(false);
  }, 30_000);

  it("vuokralainen kommentoi kuitattua kautta", async () => {
    const { landlord, tenantUser, tenancyId, periods } = await setup();
    await confirmRent(landlord, tenancyId, periods[0].id, "not_yet", null);

    expect(
      await commentOnConfirmation(tenantUser, tenancyId, periods[0].id, "Maksoin 4. päivä."),
    ).toEqual({ ok: true });

    const nakyma = await listRentPeriods(landlord, tenancyId);
    expect(nakyma[0].tenantComment).toBe("Maksoin 4. päivä.");
  }, 30_000);

  it("kuittaamatonta kautta ei voi kommentoida", async () => {
    // Ilman kuittausta ei ole mitään, mihin vastata.
    const { tenantUser, tenancyId, periods } = await setup();

    const tulos = await commentOnConfirmation(tenantUser, tenancyId, periods[0].id, "Hei");
    expect(tulos.ok).toBe(false);
  }, 30_000);

  it("osittainen maksu vaatii summan ja tallentaa sen", async () => {
    const { landlord, tenancyId, periods } = await setup();

    expect((await confirmRent(landlord, tenancyId, periods[0].id, "partial", null)).ok).toBe(
      false,
    );
    expect(await confirmRent(landlord, tenancyId, periods[0].id, "partial", 400)).toEqual({
      ok: true,
    });

    const nakyma = await listRentPeriods(landlord, tenancyId);
    expect(nakyma[0].confirmation?.amountPaid).toBe(400);
  }, 30_000);

  it("merkinnän muuttaminen ei siirrä 30 päivän ikkunaa", async () => {
    /*
      Ikkuna lasketaan ensimmäisestä kuittauksesta. Muuten merkintää voisi
      pitää auki loputtomiin muuttamalla sitä kerran kuussa.
    */
    const { landlord, tenancyId, periods } = await setup();

    await confirmRent(landlord, tenancyId, periods[0].id, "not_yet", null);
    const ensin = (await listRentPeriods(landlord, tenancyId))[0].confirmation!.confirmedAt;

    await confirmRent(landlord, tenancyId, periods[0].id, "paid", null);
    const jalkeen = (await listRentPeriods(landlord, tenancyId))[0].confirmation!;

    expect(jalkeen.status).toBe("paid");
    expect(jalkeen.confirmedAt).toBe(ensin);
  }, 30_000);

  it("muutos kirjataan lokiin", async () => {
    // Merkintä, joka on muuttunut kolmesti, kertoo jotain sellaista, mitä
    // lopputila yksin ei kerro.
    const { landlord, tenancyId, periods } = await setup();

    await confirmRent(landlord, tenancyId, periods[0].id, "not_yet", null);
    await confirmRent(landlord, tenancyId, periods[0].id, "paid", null);

    const { data } = await getServiceClient()
      .from("rs_audit_log")
      .select("action")
      .eq("tenancy_id", tenancyId)
      .order("created_at", { ascending: true });

    const actions = (data ?? []).map((row) => (row as { action: string }).action);
    expect(actions).toContain("rent.confirmation.created");
    expect(actions).toContain("rent.confirmation.changed");
  }, 30_000);

  it("ulkopuolinen ei näe vuokrahistoriaa", async () => {
    const { tenancyId } = await setup();
    const outsider = await createUser("outsider");

    await expect(listRentPeriods(outsider, tenancyId)).rejects.toThrow();
  }, 30_000);
});
