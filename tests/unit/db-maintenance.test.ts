import { afterAll, describe, expect, it } from "vitest";
import { getServiceClient, hasSupabaseCredentials } from "@/lib/db/supabase";
import { createProperty } from "@/lib/db/properties";
import { createTenancy } from "@/lib/db/tenancies";
import {
  addMaintenanceComment,
  cancelMaintenanceEntry,
  createMaintenanceEntry,
  listMaintenanceEntries,
  resolveMaintenanceEntry,
} from "@/lib/db/maintenance";
import { listPartyDetails } from "@/lib/tenancy/party-details";
import { generateEncryptionKey } from "@/lib/identity/crypto";

/**
 * Huoltokirja oikeaa Supabasea vasten (CLAUDE.md 5.6).
 *
 * Painopiste on siinä, ettei kumpikaan osapuoli voi pyyhkiä toisen
 * havaintoa. Huoltokirja on se, johon loppukatselmuksessa nojataan.
 */

process.env.PERSON_DATA_KEY ??= generateEncryptionKey();

const RUN = hasSupabaseCredentials();
const PREFIX = `testi-huolto-${Date.now()}`;
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

  const tenantUser = await createUser("tenant");
  const tenantParty = (await listPartyDetails(landlord, tenancy.id)).find(
    (party) => party.role === "tenant",
  )!;
  await getServiceClient()
    .from("rs_tenancy_parties")
    .update({ user_id: tenantUser })
    .eq("id", tenantParty.partyId);

  return { landlord, tenantUser, tenancyId: tenancy.id };
}

afterAll(async () => {
  if (!RUN) return;
  const db = getServiceClient();
  for (const id of created.tenancies) await db.from("rs_tenancies").delete().eq("id", id);
  for (const id of created.properties) await db.from("rs_properties").delete().eq("id", id);
  for (const id of created.users) await db.from("rs_users").delete().eq("id", id);
});

describe.skipIf(!RUN)("huoltokirja", () => {
  it("kumpi tahansa voi kirjata vian ja molemmat näkevät sen", async () => {
    const { landlord, tenantUser, tenancyId } = await setup();

    const luotu = await createMaintenanceEntry(
      tenantUser,
      tenancyId,
      "defect",
      "Keittiön hana vuotaa",
      "Tippuu tasaisesti.",
    );
    expect(luotu.ok).toBe(true);

    for (const userId of [landlord, tenantUser]) {
      const merkinnat = await listMaintenanceEntries(userId, tenancyId);
      expect(merkinnat[0].title).toBe("Keittiön hana vuotaa");
      expect(merkinnat[0].authorRole).toBe("tenant");
    }
  }, 30_000);

  it("otsikko on pakollinen, kuvaus ei", async () => {
    // "Hana vuotaa" riittää merkinnäksi. Pakollinen kuvauskenttä tuottaisi
    // tekstejä kuten "vuotaa".
    const { tenantUser, tenancyId } = await setup();

    expect((await createMaintenanceEntry(tenantUser, tenancyId, "defect", "  ", "")).ok).toBe(
      false,
    );
    expect((await createMaintenanceEntry(tenantUser, tenancyId, "defect", "Hana", "")).ok).toBe(
      true,
    );
  }, 30_000);

  it("molemmat voivat kommentoida", async () => {
    const { landlord, tenantUser, tenancyId } = await setup();
    const entry = await createMaintenanceEntry(tenantUser, tenancyId, "defect", "Hana", "");
    if (!entry.ok) throw new Error("merkintää ei syntynyt");

    await addMaintenanceComment(landlord, tenancyId, entry.id, "Huoltomies käy torstaina.");
    await addMaintenanceComment(tenantUser, tenancyId, entry.id, "Kiitos.");

    const merkinnat = await listMaintenanceEntries(tenantUser, tenancyId);
    expect(merkinnat[0].comments.map((c) => c.body)).toEqual([
      "Huoltomies käy torstaina.",
      "Kiitos.",
    ]);
  }, 30_000);

  it("vain vuokranantaja merkitsee korjatuksi", async () => {
    // Hän vastaa korjauksesta ja tietää milloin se on tehty.
    const { landlord, tenantUser, tenancyId } = await setup();
    const entry = await createMaintenanceEntry(tenantUser, tenancyId, "defect", "Hana", "");
    if (!entry.ok) throw new Error("merkintää ei syntynyt");

    expect((await resolveMaintenanceEntry(tenantUser, tenancyId, entry.id)).ok).toBe(false);
    expect((await resolveMaintenanceEntry(landlord, tenancyId, entry.id)).ok).toBe(true);

    const merkinnat = await listMaintenanceEntries(tenantUser, tenancyId);
    expect(merkinnat[0].resolvedAt).not.toBeNull();
  }, 30_000);

  it("korjatuksi merkitseminen ei sulje keskustelua", async () => {
    // Vuokralainen voi olla eri mieltä, ja juuri se erimielisyys halutaan
    // nähdä loppukatselmuksessa.
    const { landlord, tenantUser, tenancyId } = await setup();
    const entry = await createMaintenanceEntry(tenantUser, tenancyId, "defect", "Hana", "");
    if (!entry.ok) throw new Error("merkintää ei syntynyt");

    await resolveMaintenanceEntry(landlord, tenancyId, entry.id);
    expect((await addMaintenanceComment(tenantUser, tenancyId, entry.id, "Vuotaa yhä.")).ok).toBe(
      true,
    );
  }, 30_000);

  it("vain kirjoittaja voi perua merkintänsä", async () => {
    // Toisen merkinnän peruminen olisi sen hiljentämistä.
    const { landlord, tenantUser, tenancyId } = await setup();
    const entry = await createMaintenanceEntry(tenantUser, tenancyId, "defect", "Hana", "");
    if (!entry.ok) throw new Error("merkintää ei syntynyt");

    expect((await cancelMaintenanceEntry(landlord, tenancyId, entry.id, "väärä")).ok).toBe(false);
    expect(
      (await cancelMaintenanceEntry(tenantUser, tenancyId, entry.id, "väärä vuokrasuhde")).ok,
    ).toBe(true);
  }, 30_000);

  it("peruttu merkintä jää huoltokirjaan ja syy näkyy", async () => {
    const { landlord, tenantUser, tenancyId } = await setup();
    const entry = await createMaintenanceEntry(tenantUser, tenancyId, "defect", "Hana", "");
    if (!entry.ok) throw new Error("merkintää ei syntynyt");

    await cancelMaintenanceEntry(tenantUser, tenancyId, entry.id, "kirjasin vahingossa");

    const merkinnat = await listMaintenanceEntries(landlord, tenancyId);
    expect(merkinnat).toHaveLength(1);
    expect(merkinnat[0].cancelledAt).not.toBeNull();
    expect(merkinnat[0].comments[0].body).toContain("kirjasin vahingossa");
  }, 30_000);

  it("perumista ei voi tehdä kahdesti", async () => {
    const { tenantUser, tenancyId } = await setup();
    const entry = await createMaintenanceEntry(tenantUser, tenancyId, "defect", "Hana", "");
    if (!entry.ok) throw new Error("merkintää ei syntynyt");

    await cancelMaintenanceEntry(tenantUser, tenancyId, entry.id, "syy");
    expect((await cancelMaintenanceEntry(tenantUser, tenancyId, entry.id, "toinen syy")).ok).toBe(
      false,
    );
  }, 30_000);

  it("peruttua merkintää ei voi merkitä korjatuksi", async () => {
    const { landlord, tenantUser, tenancyId } = await setup();
    const entry = await createMaintenanceEntry(tenantUser, tenancyId, "defect", "Hana", "");
    if (!entry.ok) throw new Error("merkintää ei syntynyt");

    await cancelMaintenanceEntry(tenantUser, tenancyId, entry.id, "syy");
    await resolveMaintenanceEntry(landlord, tenancyId, entry.id);

    const merkinnat = await listMaintenanceEntries(landlord, tenancyId);
    expect(merkinnat[0].resolvedAt).toBeNull();
  }, 30_000);

  it("ulkopuolinen ei näe huoltokirjaa eikä voi kirjata", async () => {
    const { tenancyId } = await setup();
    const outsider = await createUser("outsider");

    await expect(listMaintenanceEntries(outsider, tenancyId)).rejects.toThrow();
    await expect(
      createMaintenanceEntry(outsider, tenancyId, "defect", "Hana", ""),
    ).rejects.toThrow();
  }, 30_000);
});
