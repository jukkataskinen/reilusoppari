import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getServiceClient, hasSupabaseCredentials } from "@/lib/db/supabase";
import { createProperty } from "@/lib/db/properties";
import { createTenancy } from "@/lib/db/tenancies";
import { createPropertyExpense } from "@/lib/db/expenses";
import { createMaintenanceEntry } from "@/lib/db/maintenance";
import { listPartyDetails } from "@/lib/tenancy/party-details";
import { generateEncryptionKey } from "@/lib/identity/crypto";
import { collectUserData } from "@/lib/export/collect";
import { createZip } from "@/lib/export/zip";

/**
 * Omien tietojen vienti oikeaa Supabasea vasten (CLAUDE.md kohta 6).
 *
 * ===========================================================================
 * KOKO KETJU KERRALLA
 *
 * Vienti koskettaa kahtatoista moduulia: vuokrasuhteet, osapuolet, vuokrat,
 * huoltokirja, katselmukset, kulut ja Storage. Yhdenkin niistä muuttuminen
 * voi rikkoa viennin ilman että mikään muu testi huomaa — ja virhe näkyisi
 * vasta silloin, kun käyttäjä pyytää omat tietonsa.
 *
 * TÄRKEIN VÄITE ON RAJAUS
 *
 * Vienti ei ole oikotie osapuolirajauksen ohi. Ulkopuolisen paketissa ei saa
 * olla riviäkään toisen vuokrasuhteesta.
 * ===========================================================================
 */

process.env.PERSON_DATA_KEY ??= generateEncryptionKey();

const RUN = hasSupabaseCredentials();
const PREFIX = `testi-vienti-${Date.now()}`;
const created = { users: [] as string[], properties: [] as string[], tenancies: [] as string[] };
const HAKEMISTO = mkdtempSync(join(tmpdir(), "rs-vienti-"));
let seuraava = 0;

async function createUser(label: string): Promise<string> {
  const sub = `${PREFIX}-${label}-${(seuraava += 1)}`;
  const { data, error } = await getServiceClient()
    .from("rs_users")
    .insert({ auth0_sub: sub, email: `${sub}@example.invalid`, name: "Testi Käyttäjä" })
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
    street: "Mäkitie 12 A 4",
    postalCode: "40100",
    city: "Jyväskylä",
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

  return { landlord, tenantUser, tenancyId: tenancy.id, propertyId: property.id };
}

afterAll(async () => {
  rmSync(HAKEMISTO, { recursive: true, force: true });
  if (!RUN) return;

  const db = getServiceClient();
  for (const id of created.tenancies) await db.from("rs_tenancies").delete().eq("id", id);
  for (const id of created.properties) await db.from("rs_properties").delete().eq("id", id);
  for (const id of created.users) await db.from("rs_users").delete().eq("id", id);
});

/** Avaa paketin Pythonilla: riippumaton lukija, tarkistaa myös CRC:t. */
function avaa(bytes: Uint8Array): { nimet: string[]; sisallot: Record<string, string> } {
  const polku = join(HAKEMISTO, `p-${Math.random().toString(36).slice(2)}.zip`);
  writeFileSync(polku, bytes);

  const skripti = [
    "import json, sys, zipfile",
    "z = zipfile.ZipFile(sys.argv[1])",
    "assert z.testzip() is None",
    "nimet = z.namelist()",
    "sisallot = {n: z.read(n).decode('utf-8', 'replace') for n in nimet if n.endswith(('.json', '.txt'))}",
    "print(json.dumps({'nimet': nimet, 'sisallot': sisallot}))",
  ].join("\n");

  return JSON.parse(execFileSync("python", ["-c", skripti, polku], { encoding: "utf8" }));
}

describe.skipIf(!RUN)("omien tietojen vienti", () => {
  it("kokoaa vuokranantajan paketin, joka avautuu", async () => {
    const { landlord, tenancyId, propertyId } = await setup();

    await createMaintenanceEntry(
      landlord,
      tenancyId,
      "defect",
      "Hana vuotaa",
      "Keittiön hana tippuu.",
    );

    await createPropertyExpense(landlord, propertyId, {
      date: "2026-09-10",
      amount: 129.9,
      category: "vuosikorjaus",
      description: "Hanan vaihto",
      km: null,
      vatIncluded: true,
    });

    const paketti = createZip(await collectUserData(landlord), new Date("2026-09-12T10:00:00Z"));
    const { nimet, sisallot } = avaa(paketti);

    // Lukuohje on juuressa: paketti ei saa olla pelkkiä JSON-tiedostoja.
    expect(nimet).toContain("LUEMINUT.txt");
    expect(nimet).toContain("omat-tiedot.json");

    expect(nimet.some((n) => n.startsWith("vuokrasuhteet/"))).toBe(true);
    expect(nimet.some((n) => n.endsWith("/vuokrat.json"))).toBe(true);
    expect(nimet.some((n) => n.endsWith("/huoltokirja.json"))).toBe(true);

    // Asunnon kulut ovat mukana vain omistajalle.
    expect(nimet.some((n) => n.endsWith("/kulut.json"))).toBe(true);

    const huoltokirja = nimet.find((n) => n.endsWith("/huoltokirja.json"))!;
    expect(sisallot[huoltokirja]).toContain("Hana vuotaa");

    const kulut = nimet.find((n) => n.endsWith("/kulut.json"))!;
    expect(sisallot[kulut]).toContain("Hanan vaihto");
  }, 60_000);

  it("vuokralaisen paketissa ei ole kuluja", async () => {
    /*
      Kulut ovat vuokranantajan kirjanpitoa. Vuokralainen on vuokrasuhteen
      osapuoli, joten osapuolitarkistus päästäisi hänet läpi — rajaus tehdään
      asunnon omistajuuden kautta, ja viennin on noudatettava samaa.
    */
    const { landlord, tenantUser, propertyId } = await setup();

    await createPropertyExpense(landlord, propertyId, {
      date: "2026-09-10",
      amount: 500,
      category: "vuosikorjaus",
      description: "Salainen kulu",
      km: null,
      vatIncluded: true,
    });

    const { nimet, sisallot } = avaa(
      createZip(await collectUserData(tenantUser), new Date("2026-09-12T10:00:00Z")),
    );

    expect(nimet.some((n) => n.endsWith("/kulut.json"))).toBe(false);
    expect(nimet.some((n) => n.startsWith("asunnot/"))).toBe(false);

    for (const sisalto of Object.values(sisallot)) {
      expect(sisalto).not.toContain("Salainen kulu");
    }
  }, 60_000);

  it("vuokralainen saa oman vuokrasuhteensa tiedot", async () => {
    // Rajaus ei saa mennä liian tiukalle: vuokrasuhde on myös hänen.
    const { tenantUser } = await setup();

    const { nimet } = avaa(
      createZip(await collectUserData(tenantUser), new Date("2026-09-12T10:00:00Z")),
    );

    expect(nimet.some((n) => n.endsWith("/vuokrasuhde.json"))).toBe(true);
  }, 60_000);

  it("ulkopuolisen paketissa ei ole riviäkään toisen vuokrasuhteesta", async () => {
    const { tenancyId } = await setup();
    const ulkopuolinen = await createUser("ulkopuolinen");

    const { nimet, sisallot } = avaa(
      createZip(await collectUserData(ulkopuolinen), new Date("2026-09-12T10:00:00Z")),
    );

    // Vain lukuohje ja omat perustiedot.
    expect(nimet.sort()).toEqual(["LUEMINUT.txt", "omat-tiedot.json"]);

    for (const sisalto of Object.values(sisallot)) {
      expect(sisalto).not.toContain(tenancyId);
    }
  }, 60_000);

  it("ei luo mitään: vienti on lukeva toiminto", async () => {
    /*
      Ensimmäinen versio kävi katselmukset läpi `getOrCreateInspection`illa
      ja loi samalla tyhjän loppukatselmuksen jokaiselle vuokrasuhteelle,
      jolla sitä ei ollut. Käyttäjä olisi nähnyt näkymässä alkaneen
      loppukatselmuksen, jota kukaan ei ollut aloittanut — ja syy olisi ollut
      siinä, että hän latasi omat tietonsa.
    */
    const { landlord, tenancyId } = await setup();

    const ennen = await getServiceClient()
      .from("rs_inspections")
      .select("id")
      .eq("tenancy_id", tenancyId);

    await collectUserData(landlord);

    const jalkeen = await getServiceClient()
      .from("rs_inspections")
      .select("id")
      .eq("tenancy_id", tenancyId);

    expect((jalkeen.data ?? []).length).toBe((ennen.data ?? []).length);
  }, 60_000);

  it("henkilötunnusta ei anneta kokonaisena", async () => {
    /*
      Paketti päätyy lataushakemistoon salaamattomana. Kokonainen tunnus
      siellä olisi uusi riski ilman uutta hyötyä — käyttäjä tietää oman
      tunnuksensa, ja kokonaisena se on sopimuksessa.
    */
    const { landlord, tenancyId } = await setup();

    const osapuoli = (await listPartyDetails(landlord, tenancyId)).find(
      (party) => party.role === "landlord",
    )!;

    await getServiceClient()
      .from("rs_tenancy_parties")
      .update({ party_name: "Matti Virtanen" })
      .eq("id", osapuoli.partyId);

    const { sisallot } = avaa(
      createZip(await collectUserData(landlord), new Date("2026-09-12T10:00:00Z")),
    );

    for (const sisalto of Object.values(sisallot)) {
      // Peittämätön suomalainen henkilötunnus: 6 numeroa, välimerkki, 3 numeroa.
      expect(sisalto).not.toMatch(/\b\d{6}[-+AaBbCcDdEeFfYyXxWwVvUu]\d{3}[0-9A-Za-z]\b/);
    }
  }, 60_000);
});
