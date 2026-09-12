import { afterAll, describe, expect, it } from "vitest";
import { getServiceClient, hasSupabaseCredentials } from "@/lib/db/supabase";
import { createProperty } from "@/lib/db/properties";
import { createTenancy } from "@/lib/db/tenancies";
import { createExpense, listExpenses } from "@/lib/db/expenses";
import { createMaintenanceEntry, listMaintenanceEntries } from "@/lib/db/maintenance";
import { listPartyDetails } from "@/lib/tenancy/party-details";
import { generateEncryptionKey } from "@/lib/identity/crypto";
import { kmRate, travelCost } from "@/lib/expenses/categories";

/**
 * Kulut ja kuitit oikeaa Supabasea vasten (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * TÄRKEIN TESTI ON SE, ETTEI VUOKRALAINEN NÄE KULUJA
 *
 * Kuitissa voi olla vuokranantajan kotiosoite, kortin loppunumerot tai muun
 * asunnon tietoja. Rajaus tehdään asunnon omistajuuden kautta, ei
 * osapuoliaseman — ja juuri se ero on helppo rikkoa vahingossa, koska
 * kaikkialla muualla riittää osapuoliasema.
 * ===========================================================================
 */

process.env.PERSON_DATA_KEY ??= generateEncryptionKey();

const RUN = hasSupabaseCredentials();
const PREFIX = `testi-kulut-${Date.now()}`;
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

const KULU = {
  date: "2026-09-20",
  amount: 129.9,
  category: "vuosikorjaus" as const,
  description: "Hanan vaihto",
  km: null,
  vatIncluded: true,
};

describe.skipIf(!RUN)("kulut", () => {
  it("vuokranantaja kirjaa kulun ja näkee sen", async () => {
    const { landlord, tenancyId } = await setup();

    expect((await createExpense(landlord, tenancyId, KULU)).ok).toBe(true);

    const kulut = await listExpenses(landlord, tenancyId);
    expect(kulut).toHaveLength(1);
    expect(kulut[0].amount).toBe(129.9);
    expect(kulut[0].description).toBe("Hanan vaihto");
  });

  it("vuokralainen ei näe kuluja eikä voi kirjata niitä", async () => {
    /*
      Tämä on koko tiedoston tärkein väite. Vuokralainen on vuokrasuhteen
      osapuoli, joten osapuolitarkistus päästäisi hänet läpi — rajaus on
      tehtävä asunnon omistajuuden kautta.
    */
    const { landlord, tenantUser, tenancyId } = await setup();
    await createExpense(landlord, tenancyId, KULU);

    await expect(listExpenses(tenantUser, tenancyId)).rejects.toThrow();
    await expect(createExpense(tenantUser, tenancyId, KULU)).rejects.toThrow();
  });

  it("ulkopuolinen ei näe kuluja", async () => {
    const { tenancyId } = await setup();
    const outsider = await createUser("outsider");

    await expect(listExpenses(outsider, tenancyId)).rejects.toThrow();
  });

  it("matkakulun summa lasketaan kilometreistä", async () => {
    // Käyttäjän ei tarvitse tietää taksaa eikä laskea mitään.
    const { landlord, tenancyId } = await setup();

    expect(
      (
        await createExpense(landlord, tenancyId, {
          ...KULU,
          category: "matkat",
          amount: null,
          km: 24,
          description: "Ajo asunnolle",
        })
      ).ok,
    ).toBe(true);

    const kulut = await listExpenses(landlord, tenancyId);
    expect(kulut[0].amount).toBe(travelCost(24, 2026));
    expect(kulut[0].km).toBe(24);
  });

  it("matkakulu käyttää sen vuoden taksaa, jolle kulu kirjataan", async () => {
    // Laskelma tehdään usein seuraavana keväänä, eikä silloin saa käyttää
    // uutta taksaa vanhan vuoden ajoihin.
    const { landlord, tenancyId } = await setup();

    await createExpense(landlord, tenancyId, {
      ...KULU,
      date: "2025-11-10",
      category: "matkat",
      amount: null,
      km: 100,
    });

    const kulut = await listExpenses(landlord, tenancyId);
    expect(kulut[0].amount).toBe(Math.round(100 * kmRate(2025) * 100) / 100);
    expect(kmRate(2025)).not.toBe(kmRate(2026));
  });

  it("summaton kulu hylätään selvällä viestillä", async () => {
    const { landlord, tenancyId } = await setup();

    const tulos = await createExpense(landlord, tenancyId, { ...KULU, amount: null });
    expect(tulos.ok).toBe(false);
    if (!tulos.ok) expect(tulos.message).toContain("summa");

    const matka = await createExpense(landlord, tenancyId, {
      ...KULU,
      category: "matkat",
      amount: null,
      km: null,
    });
    expect(matka.ok).toBe(false);
    if (!matka.ok) expect(matka.message).toContain("kilometrit");
  });

  it("kulu liittyy huoltokirjan merkintään, jos se syntyi korjauksesta", async () => {
    const { landlord, tenancyId } = await setup();
    const entry = await createMaintenanceEntry(landlord, tenancyId, "defect", "Hana", "");
    if (!entry.ok) throw new Error("merkintää ei syntynyt");

    const kulu = await createExpense(landlord, tenancyId, {
      ...KULU,
      maintenanceEntryId: entry.id,
    });
    expect(kulu.ok).toBe(true);

    const { data } = await getServiceClient()
      .from("rs_maintenance_entries")
      .select("expense_id")
      .eq("id", entry.id)
      .single();

    expect((data as { expense_id: string | null }).expense_id).toBe(
      kulu.ok ? kulu.id : null,
    );
  });

  it("kulu ei näy huoltokirjan merkinnässä vuokralaiselle", async () => {
    // Merkintä näkyy molemmille, kulu ei. Linkki on olemassa kannassa, mutta
    // huoltokirjan näkymä ei lue sitä.
    const { landlord, tenantUser, tenancyId } = await setup();
    const entry = await createMaintenanceEntry(landlord, tenancyId, "defect", "Hana", "");
    if (!entry.ok) throw new Error("merkintää ei syntynyt");

    await createExpense(landlord, tenancyId, { ...KULU, maintenanceEntryId: entry.id });

    const merkinnat = await listMaintenanceEntries(tenantUser, tenancyId);
    const teksti = JSON.stringify(merkinnat);

    expect(teksti).not.toContain("Hanan vaihto");
    expect(teksti).not.toContain("129.9");
  });
});
