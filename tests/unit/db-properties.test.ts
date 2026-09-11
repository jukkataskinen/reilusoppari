import { afterAll, describe, expect, it } from "vitest";
import { getServiceClient, hasSupabaseCredentials } from "@/lib/db/supabase";
import {
  archiveProperty,
  createProperty,
  getProperty,
  listCheckpoints,
  listProperties,
} from "@/lib/db/properties";

/**
 * Asuntojen integraatiotestit oikeaa Supabasea vasten.
 *
 * Tärkein väite on IDOR: toisen käyttäjän asunto ei löydy edes oikealla
 * id:llä. Sovellus ajaa kyselyt `service_role`-avaimella, joka ohittaa RLS:n,
 * joten tämä on koodin varassa — ja juuri siksi se on testattava oikeaa
 * kantaa vasten eikä mockilla.
 *
 * Ohitetaan siististi, jos tunnuksia ei ole.
 */
const RUN = hasSupabaseCredentials();
const PREFIX = `testi-prop-${Date.now()}`;

const created = { users: [] as string[], properties: [] as string[] };

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

const INPUT = {
  name: null,
  street: "Testikatu 1 A 4",
  postalCode: "00100",
  city: "Helsinki",
  propertyType: "kerrostalo" as const,
  rooms: 2,
  areaM2: 54.5,
  housingCompany: null,
  tenure: "osake" as const,
};

afterAll(async () => {
  if (!RUN) return;
  const supabase = getServiceClient();
  for (const id of created.properties) await supabase.from("rs_properties").delete().eq("id", id);
  for (const id of created.users) await supabase.from("rs_users").delete().eq("id", id);
});

describe.skipIf(!RUN)("asunnot (integraatio, live Supabase)", () => {
  it("luonti tallentaa kentät ja generoi oletuskohdat", async () => {
    const owner = await createUser("owner");
    const property = await createProperty(owner, INPUT);
    created.properties.push(property.id);

    expect(property.street).toBe(INPUT.street);
    // numeric palautuu kannasta merkkijonona; muunnoksen pitää tapahtua
    // datakerroksessa eikä näkymissä.
    expect(property.areaM2).toBe(54.5);
    expect(typeof property.areaM2).toBe("number");

    const checkpoints = await listCheckpoints(owner, property.id);
    expect(checkpoints.length).toBeGreaterThan(20);
    // Oletuskohdat eivät ole kenenkään lisäämiä: ero näkyy pöytäkirjassa,
    // jossa kerrotaan kumpi osapuoli minkäkin kohdan lisäsi.
    expect(checkpoints.every((c) => c.addedByUserId === null)).toBe(true);
    // 2h+k: keittiö on oma listansa eikä yksi huoneista.
    expect(checkpoints.some((c) => c.room === "Keittiö")).toBe(true);
    // 2 huonetta → olohuone ja makuuhuone omina listoinaan.
    expect(checkpoints.some((c) => c.room === "Olohuone")).toBe(true);
    expect(checkpoints.some((c) => c.room === "Makuuhuone")).toBe(true);

    // Järjestys säilyy: sama järjestys toistetaan loppukatselmuksessa.
    const positions = checkpoints.map((c) => c.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("toisen käyttäjän asunto ei löydy id:lläkään", async () => {
    const owner = await createUser("o2");
    const outsider = await createUser("x2");
    const property = await createProperty(owner, INPUT);
    created.properties.push(property.id);

    expect(await getProperty(owner, property.id)).not.toBeNull();
    // IDOR: sama vastaus kuin olemattomalle id:lle, joten id:n olemassaolo
    // ei paljastu.
    expect(await getProperty(outsider, property.id)).toBeNull();
    expect(await getProperty(outsider, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("ulkopuolinen ei näe myöskään kohtalistaa", async () => {
    const owner = await createUser("o3");
    const outsider = await createUser("x3");
    const property = await createProperty(owner, INPUT);
    created.properties.push(property.id);

    expect((await listCheckpoints(owner, property.id)).length).toBeGreaterThan(0);
    // Kohtalista kertoisi asunnon huoneet ja varusteet — se on yhtä lailla
    // rajattava kuin asunto itse.
    expect(await listCheckpoints(outsider, property.id)).toEqual([]);
  });

  it("listaus näyttää vain omat asunnot", async () => {
    const owner = await createUser("o4");
    const other = await createUser("x4");
    const mine = await createProperty(owner, INPUT);
    const theirs = await createProperty(other, { ...INPUT, street: "Toinenkatu 2" });
    created.properties.push(mine.id, theirs.id);

    const list = await listProperties(owner);
    expect(list.map((p) => p.id)).toContain(mine.id);
    expect(list.map((p) => p.id)).not.toContain(theirs.id);
  });

  it("arkistointi piilottaa asunnon mutta ei poista sitä", async () => {
    const owner = await createUser("o5");
    const property = await createProperty(owner, INPUT);
    created.properties.push(property.id);

    expect(await archiveProperty(owner, property.id)).toBe(true);
    expect((await listProperties(owner)).map((p) => p.id)).not.toContain(property.id);

    // Rivi on yhä olemassa: vuokrasuhteet ja todistukset viittaavat siihen.
    const { data } = await getServiceClient()
      .from("rs_properties")
      .select("id, archived_at")
      .eq("id", property.id)
      .single();
    expect(data?.archived_at).not.toBeNull();
  });

  it("ulkopuolinen ei voi arkistoida toisen asuntoa", async () => {
    const owner = await createUser("o6");
    const outsider = await createUser("x6");
    const property = await createProperty(owner, INPUT);
    created.properties.push(property.id);

    expect(await archiveProperty(outsider, property.id)).toBe(false);
    expect((await listProperties(owner)).map((p) => p.id)).toContain(property.id);
  });
});
