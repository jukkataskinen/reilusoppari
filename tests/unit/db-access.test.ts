import { afterAll, describe, expect, it } from "vitest";
import { getAnonClient, getServiceClient, hasSupabaseCredentials } from "@/lib/db/supabase";
import { isTenancyParty, ownsProperty, requireTenancyParty } from "@/lib/db/access";

/**
 * Integraatiotestit oikeaa Supabasea vasten (esinetti 0.1 kohta 1:
 * "Toimiiko IDOR-testi: toisen tenantin id → 404?").
 *
 * Ohitetaan siististi, jos tunnuksia ei ole – näin testisarja on vihreä myös
 * koneella, jolla `.env.local` puuttuu.
 *
 * Testit luovat oman datansa ja siivoavat sen lopuksi. Tunnisteissa on
 * etuliite `testi-`, jotta väärin menneen ajon jäljet löytää kannasta.
 */
const RUN = hasSupabaseCredentials();
const PREFIX = `testi-${Date.now()}`;

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

async function createProperty(ownerId: string): Promise<string> {
  const { data, error } = await getServiceClient()
    .from("rs_properties")
    .insert({
      owner_user_id: ownerId,
      street: "Testikatu 1",
      postal_code: "00100",
      city: "Helsinki",
      property_type: "kerrostalo",
      rooms: 2,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  created.properties.push(data.id);
  return data.id;
}

async function createTenancy(propertyId: string, landlordId: string, tenantId: string) {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("rs_tenancies")
    .insert({ property_id: propertyId, landlord_user_id: landlordId, status: "draft" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  created.tenancies.push(data.id);

  const { error: partyError } = await supabase.from("rs_tenancy_parties").insert([
    { tenancy_id: data.id, user_id: landlordId, role: "landlord", position: 0 },
    { tenancy_id: data.id, user_id: tenantId, role: "tenant", position: 0 },
  ]);
  if (partyError) throw new Error(partyError.message);

  return data.id as string;
}

afterAll(async () => {
  if (!RUN) return;
  const supabase = getServiceClient();
  // Poistojärjestys viitteiden mukaan: vuokrasuhde ennen asuntoa, asunto
  // ennen käyttäjää. Cascade hoitaa party-rivit.
  for (const id of created.tenancies) await supabase.from("rs_tenancies").delete().eq("id", id);
  for (const id of created.properties) await supabase.from("rs_properties").delete().eq("id", id);
  for (const id of created.users) await supabase.from("rs_users").delete().eq("id", id);
});

describe.skipIf(!RUN)("osapuolirajaus (integraatio, live Supabase)", () => {
  it("molemmat osapuolet tunnistetaan, ulkopuolinen ei", async () => {
    const landlord = await createUser("landlord");
    const tenant = await createUser("tenant");
    const outsider = await createUser("outsider");
    const property = await createProperty(landlord);
    const tenancy = await createTenancy(property, landlord, tenant);

    expect(await isTenancyParty(landlord, tenancy)).toBe(true);
    expect(await isTenancyParty(tenant, tenancy)).toBe(true);
    // IDOR: ulkopuolinen ei paase kasiksi vaikka tuntisi id:n.
    expect(await isTenancyParty(outsider, tenancy)).toBe(false);
  });

  it("ulkopuoliselle sama virhe kuin olemattomalle vuokrasuhteelle", async () => {
    const landlord = await createUser("l2");
    const tenant = await createUser("t2");
    const outsider = await createUser("o2");
    const property = await createProperty(landlord);
    const tenancy = await createTenancy(property, landlord, tenant);

    const real = await requireTenancyParty(outsider, tenancy).catch((e: Error) => e.message);
    const fake = await requireTenancyParty(outsider, "00000000-0000-4000-8000-000000000000").catch(
      (e: Error) => e.message,
    );

    // Viesti ei saa paljastaa onko id olemassa.
    expect(real).toBe(fake);
  });

  it("asunnon omistaja tunnistetaan, vuokralainen ei omista sitä", async () => {
    const landlord = await createUser("l3");
    const tenant = await createUser("t3");
    const property = await createProperty(landlord);
    await createTenancy(property, landlord, tenant);

    expect(await ownsProperty(landlord, property)).toBe(true);
    // Vuokralainen on vuokrasuhteen osapuoli mutta EI omista asuntoa:
    // kulut ja verolaskelma jaavat han ulottumattomiin (CLAUDE.md 5.7).
    expect(await ownsProperty(tenant, property)).toBe(false);
  });

  it("anon-avaimella ei näe mitään, vaikka rivi on olemassa", async () => {
    const landlord = await createUser("l4");
    const property = await createProperty(landlord);

    const { data, error } = await getAnonClient()
      .from("rs_properties")
      .select("id")
      .eq("id", property);

    // RLS ei palauta virhetta vaan tyhjan tuloksen - juuri niin kuin pitaa.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
