import { afterAll, describe, expect, it } from "vitest";
import { getServiceClient, hasSupabaseCredentials } from "@/lib/db/supabase";
import { createProperty } from "@/lib/db/properties";
import { createTenancy } from "@/lib/db/tenancies";
import { addContractComment, listContractComments } from "@/lib/db/contracts";
import { listPartyDetails } from "@/lib/tenancy/party-details";
import { generateEncryptionKey } from "@/lib/identity/crypto";
import { hasContractComments } from "../migration-probe";

/**
 * Sopimusluonnoksen kommentit (CLAUDE.md 5.2).
 *
 * Painopiste on pääsyssä: keskustelu näkyy molemmille osapuolille
 * kokonaisuudessaan eikä lainkaan ulkopuoliselle.
 */

process.env.PERSON_DATA_KEY ??= generateEncryptionKey();

const RUN = hasSupabaseCredentials() && (await hasContractComments());

if (hasSupabaseCredentials() && !RUN) {
  console.warn(
    "[testit] Migraatio 0006 (rs_contract_comments) puuttuu kannasta — kommenttitestit ohitetaan.",
  );
}

const PREFIX = `testi-komm-${Date.now()}`;
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

describe.skipIf(!RUN)("sopimuksen kommentit", () => {
  it("molemmat saavat kommentoida ja molemmat näkevät kaiken", async () => {
    // Yksisuuntainen kanava olisi outo: vuokranantajan on voitava vastata.
    const { landlord, tenantUser, tenancyId } = await setup();

    await addContractComment(tenantUser, tenancyId, "Voisiko lemmikit sallia?");
    await addContractComment(landlord, tenancyId, "Sopii. Muutin ehdon.");

    for (const userId of [landlord, tenantUser]) {
      const comments = await listContractComments(userId, tenancyId);
      expect(comments.map((c) => c.body)).toEqual([
        "Voisiko lemmikit sallia?",
        "Sopii. Muutin ehdon.",
      ]);
    }
  }, 30_000);

  it("kertoo kumpi osapuoli kirjoitti", async () => {
    const { landlord, tenantUser, tenancyId } = await setup();
    await addContractComment(tenantUser, tenancyId, "Kysymys");

    const nakyma = await listContractComments(landlord, tenancyId);
    expect(nakyma[0].authorRole).toBe("tenant");
    expect(nakyma[0].isSelf).toBe(false);

    const omaNakyma = await listContractComments(tenantUser, tenancyId);
    expect(omaNakyma[0].isSelf).toBe(true);
  }, 30_000);

  it("tyhjä kommentti ei tallennu", async () => {
    const { tenantUser, tenancyId } = await setup();

    expect(await addContractComment(tenantUser, tenancyId, "   ")).toEqual({ ok: false });
    expect(await listContractComments(tenantUser, tenancyId)).toHaveLength(0);
  }, 30_000);

  it("pitkä kommentti katkaistaan eikä hylätä", async () => {
    // Hylkäys hukkaisi kirjoitetun tekstin. Raja on sama kuin muissa
    // kommenttikentissä.
    const { tenantUser, tenancyId } = await setup();
    await addContractComment(tenantUser, tenancyId, "x".repeat(400));

    const comments = await listContractComments(tenantUser, tenancyId);
    expect(comments[0].body.length).toBe(300);
  }, 30_000);

  it("ulkopuolinen ei näe keskustelua", async () => {
    const { tenancyId } = await setup();
    const outsider = await createUser("outsider");

    await expect(listContractComments(outsider, tenancyId)).rejects.toThrow();
    await expect(addContractComment(outsider, tenancyId, "hei")).rejects.toThrow();
  }, 30_000);
});
