import { afterAll, describe, expect, it } from "vitest";
import { getServiceClient, hasSupabaseCredentials } from "@/lib/db/supabase";
import { createProperty } from "@/lib/db/properties";
import {
  acceptInvite,
  createRentPeriods,
  createTenancy,
  findTenancyByInvite,
  getTenancy,
  listParties,
  listTenancies,
  reissueInvite,
} from "@/lib/db/tenancies";
import type { TenancyInput } from "@/lib/tenancy/schema";

/**
 * Vuokrasuhteiden integraatiotestit oikeaa Supabasea vasten.
 *
 * Painopiste on kutsulinkissä: se on ainoa tunnistamaton polku
 * vuokrasuhteeseen, joten sen väärinkäyttö on tämän moduulin pahin vika.
 */
const RUN = hasSupabaseCredentials();
const PREFIX = `testi-ten-${Date.now()}`;

const created = { users: [] as string[], properties: [] as string[], tenancies: [] as string[] };

async function createUser(label: string): Promise<string> {
  const { data, error } = await getServiceClient()
    .from("rs_users")
    .insert({ auth0_sub: `${PREFIX}-${label}`, email: `${PREFIX}-${label}@example.invalid` })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  created.users.push(data.id);
  return data.id;
}

/** Kutsu on osoitettu tälle osoitteelle, joten liittyminen tapahtuu sillä. */
const TENANT_EMAIL = `${PREFIX}-tenant@example.invalid`;

async function createTestProperty(ownerId: string): Promise<string> {
  const property = await createProperty(ownerId, {
    name: null,
    street: "Testikatu 1",
    postalCode: "00100",
    city: "Helsinki",
    propertyType: "kerrostalo",
    rooms: 2,
    areaM2: 54,
    housingCompany: null,
    tenure: null,
  });
  created.properties.push(property.id);
  return property.id;
}

function input(propertyId: string, overrides: Partial<TenancyInput> = {}): TenancyInput {
  return {
    propertyId,
    tenants: [{ name: "Maija Meikäläinen", email: `${PREFIX}-tenant@example.invalid` }],
    startDate: "2026-09-01",
    endDate: null,
    rentAmount: 850,
    rentDueDay: 5,
    depositAmount: 1700,
    ...overrides,
  } as TenancyInput;
}

afterAll(async () => {
  if (!RUN) return;
  const supabase = getServiceClient();
  for (const id of created.tenancies) await supabase.from("rs_tenancies").delete().eq("id", id);
  for (const id of created.properties) await supabase.from("rs_properties").delete().eq("id", id);
  for (const id of created.users) await supabase.from("rs_users").delete().eq("id", id);
});

describe.skipIf(!RUN)("vuokrasuhteet (integraatio, live Supabase)", () => {
  it("luonti tekee vuokrasuhteen, osapuolet ja kutsun", async () => {
    const landlord = await createUser("l1");
    const propertyId = await createTestProperty(landlord);

    const { tenancy, invites } = await createTenancy(landlord, input(propertyId));
    created.tenancies.push(tenancy.id);

    expect(tenancy.status).toBe("draft");
    expect(tenancy.rentAmount).toBe(850);
    expect(typeof tenancy.rentAmount).toBe("number");

    expect(invites).toHaveLength(1);
    expect(invites[0].token).toHaveLength(64);

    const parties = await listParties(landlord, tenancy.id);
    expect(parties.map((p) => p.role).sort()).toEqual(["landlord", "tenant"]);

    // Vuokranantaja on osapuoli heti; vuokralainen vasta kun liittyy.
    const landlordParty = parties.find((p) => p.role === "landlord")!;
    const tenantParty = parties.find((p) => p.role === "tenant")!;
    expect(landlordParty.userId).toBe(landlord);
    expect(landlordParty.joinedAt).not.toBeNull();
    expect(tenantParty.userId).toBeNull();
    expect(tenantParty.joinedAt).toBeNull();
  });

  it("vuokrasuhdetta ei voi luoda toisen asuntoon", async () => {
    const owner = await createUser("l2");
    const outsider = await createUser("x2");
    const propertyId = await createTestProperty(owner);

    await expect(createTenancy(outsider, input(propertyId))).rejects.toThrow(/ei löytynyt/);
  });

  it("ulkopuolinen ei näe vuokrasuhdetta eikä osapuolia", async () => {
    const landlord = await createUser("l3");
    const outsider = await createUser("x3");
    const propertyId = await createTestProperty(landlord);
    const { tenancy } = await createTenancy(landlord, input(propertyId));
    created.tenancies.push(tenancy.id);

    expect(await getTenancy(landlord, tenancy.id)).not.toBeNull();
    // IDOR: sama vastaus kuin olemattomalle id:lle.
    expect(await getTenancy(outsider, tenancy.id)).toBeNull();
    expect(await listParties(outsider, tenancy.id)).toEqual([]);
  });

  it("kutsu avautuu tunnisteella ja näyttää vain sen, mitä kuuluu", async () => {
    const landlord = await createUser("l4");
    const propertyId = await createTestProperty(landlord);
    const { tenancy, invites } = await createTenancy(landlord, input(propertyId));
    created.tenancies.push(tenancy.id);

    const preview = await findTenancyByInvite(invites[0].token);
    expect(preview).not.toBeNull();
    expect(preview!.tenancyId).toBe(tenancy.id);
    expect(preview!.propertyAddress).toContain("Testikatu 1");
    expect(preview!.rentAmount).toBe(850);

    // Vuokranantajan sähköpostiosoitetta EI anneta kutsun avaajalle: hän ei
    // ole vielä tunnistautunut. Kutsutun oma osoite sen sijaan näytetään,
    // koska hänen on kirjauduttava juuri sillä.
    const kaikki = JSON.stringify(preview);
    expect(kaikki).not.toContain(`${PREFIX}-l4@example.invalid`);
    expect(preview!.inviteEmail).toBe(`${PREFIX}-tenant@example.invalid`);
  });

  it("väärä, muodoltaan kelvoton ja tuntematon tunniste antavat saman vastauksen", async () => {
    expect(await findTenancyByInvite("")).toBeNull();
    expect(await findTenancyByInvite("roska")).toBeNull();
    expect(await findTenancyByInvite("a".repeat(64))).toBeNull();
  });

  it("liittyminen kiinnittää käyttäjän ja on idempotentti", async () => {
    const landlord = await createUser("l5");
    const tenant = await createUser("t5");
    const propertyId = await createTestProperty(landlord);
    const { tenancy, invites } = await createTenancy(landlord, input(propertyId));
    created.tenancies.push(tenancy.id);

    expect(await acceptInvite(invites[0].token, tenant, TENANT_EMAIL)).toEqual({
      ok: true,
      tenancyId: tenancy.id,
    });

    // Vuokralainen näkee vuokrasuhteen vasta liityttyään.
    expect(await getTenancy(tenant, tenancy.id)).not.toBeNull();

    // Sama linkki uudelleen ei ole virhe.
    expect(await acceptInvite(invites[0].token, tenant, TENANT_EMAIL)).toEqual({
      ok: true,
      tenancyId: tenancy.id,
    });
  });

  it("toinen käyttäjä ei voi kaapata jo käytettyä kutsua", async () => {
    const landlord = await createUser("l6");
    const tenant = await createUser("t6");
    const kaappaaja = await createUser("x6");
    const propertyId = await createTestProperty(landlord);
    const { tenancy, invites } = await createTenancy(landlord, input(propertyId));
    created.tenancies.push(tenancy.id);

    await acceptInvite(invites[0].token, tenant, TENANT_EMAIL);

    // Kaappaajalla on eri osoite, joten kutsu ei kelpaa hänelle.
    expect(await acceptInvite(invites[0].token, kaappaaja, TENANT_EMAIL)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await getTenancy(kaappaaja, tenancy.id)).toBeNull();
  });

  it("väärällä sähköpostilla kutsua ei voi lunastaa eikä se kulu", async () => {
    const landlord = await createUser("l6b");
    const vaara = await createUser("x6b");
    const oikea = await createUser("t6b");
    const propertyId = await createTestProperty(landlord);
    const { tenancy, invites } = await createTenancy(landlord, input(propertyId));
    created.tenancies.push(tenancy.id);

    expect(
      await acceptInvite(invites[0].token, vaara, `${PREFIX}-x6b@example.invalid`),
    ).toEqual({ ok: false, reason: "wrong_account" });
    expect(await getTenancy(vaara, tenancy.id)).toBeNull();

    // Kutsu jää voimaan oikeaa henkilöä varten.
    expect(await acceptInvite(invites[0].token, oikea, TENANT_EMAIL)).toEqual({
      ok: true,
      tenancyId: tenancy.id,
    });
  });

  it("kaksi vuokralaista saa kumpikin oman kutsunsa", async () => {
    const landlord = await createUser("l7");
    const propertyId = await createTestProperty(landlord);
    const { tenancy, invites } = await createTenancy(
      landlord,
      input(propertyId, {
        tenants: [
          { name: "Maija", email: `${PREFIX}-a@example.invalid` },
          { name: "Matti", email: `${PREFIX}-b@example.invalid` },
        ],
      }),
    );
    created.tenancies.push(tenancy.id);

    expect(invites).toHaveLength(2);
    expect(invites[0].token).not.toBe(invites[1].token);

    // Toisen kutsu ei avaa toisen paikkaa.
    const a = await findTenancyByInvite(invites[0].token);
    const b = await findTenancyByInvite(invites[1].token);
    expect(a!.partyId).not.toBe(b!.partyId);
  });

  it("listaus näyttää omat vuokrasuhteet molemmissa rooleissa", async () => {
    const landlord = await createUser("l8");
    const tenant = await createUser("t8");
    const outsider = await createUser("x8");
    const propertyId = await createTestProperty(landlord);
    const { tenancy, invites } = await createTenancy(landlord, input(propertyId));
    created.tenancies.push(tenancy.id);
    await acceptInvite(invites[0].token, tenant, TENANT_EMAIL);

    expect((await listTenancies(landlord)).map((t) => t.id)).toContain(tenancy.id);
    expect((await listTenancies(tenant)).map((t) => t.id)).toContain(tenancy.id);
    expect((await listTenancies(outsider)).map((t) => t.id)).not.toContain(tenancy.id);
  });

  it("vuokrakaudet luodaan vasta erikseen ja luonti on idempotentti", async () => {
    const landlord = await createUser("l9");
    const propertyId = await createTestProperty(landlord);
    const { tenancy } = await createTenancy(
      landlord,
      input(propertyId, { endDate: "2027-02-28" }),
    );
    created.tenancies.push(tenancy.id);

    const supabase = getServiceClient();
    const before = await supabase
      .from("rs_rent_periods")
      .select("id")
      .eq("tenancy_id", tenancy.id);
    // Kausia ei luoda vuokrasuhteen mukana: sopimus voi vielä muuttua.
    expect(before.data).toEqual([]);

    expect(await createRentPeriods(tenancy.id, tenancy)).toBe(6);
    await createRentPeriods(tenancy.id, tenancy);

    const after = await supabase.from("rs_rent_periods").select("id").eq("tenancy_id", tenancy.id);
    expect(after.data).toHaveLength(6);
  });
});

describe.skipIf(!RUN)("kutsun uudelleenlähetys", () => {
  it("mitätöi vanhan linkin ja antaa uuden", async () => {
    const landlord = await createUser("r1");
    const propertyId = await createTestProperty(landlord);
    const { tenancy, invites } = await createTenancy(landlord, input(propertyId));
    created.tenancies.push(tenancy.id);

    const parties = await listParties(landlord, tenancy.id);
    const tenantParty = parties.find((p) => p.role === "tenant")!;

    const uusi = await reissueInvite(landlord, tenancy.id, tenantParty.id);
    expect(uusi).not.toBeNull();
    expect(uusi!.token).not.toBe(invites[0].token);

    // Vanha linkki lakkaa toimimasta.
    expect(await findTenancyByInvite(invites[0].token)).toBeNull();
    expect(await findTenancyByInvite(uusi!.token)).not.toBeNull();
  });

  it("vain vuokranantaja voi lähettää uudelleen", async () => {
    const landlord = await createUser("r2");
    const outsider = await createUser("x-r2");
    const propertyId = await createTestProperty(landlord);
    const { tenancy } = await createTenancy(landlord, input(propertyId));
    created.tenancies.push(tenancy.id);

    const parties = await listParties(landlord, tenancy.id);
    const tenantParty = parties.find((p) => p.role === "tenant")!;

    expect(await reissueInvite(outsider, tenancy.id, tenantParty.id)).toBeNull();
  });

  it("jo liittyneelle ei luoda uutta kutsua", async () => {
    // Uusi kutsu poistaisi häneltä pääsyn.
    const landlord = await createUser("r3");
    const tenant = await createUser("t-r3");
    const propertyId = await createTestProperty(landlord);
    const { tenancy, invites } = await createTenancy(landlord, input(propertyId));
    created.tenancies.push(tenancy.id);

    await acceptInvite(invites[0].token, tenant, TENANT_EMAIL);
    const parties = await listParties(landlord, tenancy.id);
    const tenantParty = parties.find((p) => p.role === "tenant")!;

    expect(await reissueInvite(landlord, tenancy.id, tenantParty.id)).toBeNull();
    expect(await getTenancy(tenant, tenancy.id)).not.toBeNull();
  });
});
