import { afterAll, describe, expect, it } from "vitest";
import { getServiceClient, hasSupabaseCredentials } from "@/lib/db/supabase";
import { createProperty } from "@/lib/db/properties";
import { createTenancy } from "@/lib/db/tenancies";
import {
  getOwnPartyDefaults,
  listPartyDetails,
  partyDetailsForDocument,
  savePartyDetails,
  saveOwnPartyDefaults,
  type PartyDetailsInput,
} from "@/lib/tenancy/party-details";
import { generateEncryptionKey } from "@/lib/identity/crypto";

/**
 * Osapuolten tunnistetiedot oikeaa Supabasea vasten.
 *
 * ===========================================================================
 * MITÄ TÄSSÄ OIKEASTAAN TESTATAAN
 *
 * Ei sitä, että tallennus toimii — vaan sitä, että henkilötunnus **ei ole
 * kannassa selkokielisenä** ja **ei tule ulos peittämättömänä** muuta kuin
 * asiakirjaa varten. Ne ovat ne kaksi asiaa, joiden varassa koko ratkaisu
 * lepää (DECISIONS.md 2026-09-11).
 * ===========================================================================
 */

process.env.PERSON_DATA_KEY ??= generateEncryptionKey();

const RUN = hasSupabaseCredentials();
const PREFIX = `testi-osap-${Date.now()}`;

const created = { users: [] as string[], properties: [] as string[], tenancies: [] as string[] };

/** Keksitty mutta tarkistusmerkiltään oikea. Ei kuulu kenellekään. */
const HETU = "131052-308T";

const TYHJA: PartyDetailsInput = {
  name: null,
  partyType: "henkilo",
  personalId: null,
  businessId: null,
  signatoryName: null,
  phone: null,
  email: null,
  bankAccount: null,
  clearPersonalId: false,
};

// Juokseva numero: `auth0_sub` on uniikki, ja sama nimilappu kahdesti
// kaataisi testin syystä, jolla ei ole tekemistä testattavan asian kanssa.
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

afterAll(async () => {
  if (!RUN) return;
  const db = getServiceClient();
  for (const id of created.tenancies) await db.from("rs_tenancies").delete().eq("id", id);
  for (const id of created.properties) await db.from("rs_properties").delete().eq("id", id);
  for (const id of created.users) await db.from("rs_users").delete().eq("id", id);
});

describe.skipIf(!RUN)("osapuolten tunnistetiedot kannassa", () => {
  it("henkilötunnus ei ole kannassa selkokielisenä", async () => {
    const { landlord, tenancyId } = await setup();
    const parties = await listPartyDetails(landlord, tenancyId);
    const tenant = parties.find((party) => party.role === "tenant")!;

    await savePartyDetails(landlord, tenancyId, tenant.partyId, {
      ...TYHJA,
      name: "Maija Meikäläinen",
      personalId: HETU,
    });

    // Luetaan rivi ohi sovelluskerroksen: juuri tämä on se, mitä
    // tietokantavedoksesta näkisi.
    const { data } = await getServiceClient()
      .from("rs_tenancy_parties")
      .select("party_id_encrypted")
      .eq("id", tenant.partyId)
      .single();

    const tallennettu = (data as { party_id_encrypted: string }).party_id_encrypted;
    expect(tallennettu).not.toContain("131052");
    expect(tallennettu.startsWith("v1:")).toBe(true);
  });

  it("listaus peittää, asiakirja ei", async () => {
    const { landlord, tenancyId } = await setup();
    const tenant = (await listPartyDetails(landlord, tenancyId)).find(
      (party) => party.role === "tenant",
    )!;

    await savePartyDetails(landlord, tenancyId, tenant.partyId, {
      ...TYHJA,
      name: "Maija Meikäläinen",
      personalId: HETU,
    });

    const nakyma = (await listPartyDetails(landlord, tenancyId)).find(
      (party) => party.role === "tenant",
    )!;
    expect(nakyma.identifierMasked).toBe("131052-***T");

    const asiakirja = (await partyDetailsForDocument(tenancyId)).find(
      (party) => party.role === "tenant",
    )!;
    expect(asiakirja.identifier).toBe(HETU);
  });

  it("tyhjä kenttä säilyttää tunnuksen, rasti poistaa sen", async () => {
    const { landlord, tenancyId } = await setup();
    const tenant = (await listPartyDetails(landlord, tenancyId)).find(
      (party) => party.role === "tenant",
    )!;

    await savePartyDetails(landlord, tenancyId, tenant.partyId, {
      ...TYHJA,
      personalId: HETU,
    });

    // Puhelinnumeron muutos ei saa pyyhkiä tunnusta mennessään.
    await savePartyDetails(landlord, tenancyId, tenant.partyId, {
      ...TYHJA,
      phone: "050 765 4321",
    });
    expect(
      (await listPartyDetails(landlord, tenancyId)).find((p) => p.role === "tenant")!
        .identifierMasked,
    ).toBe("131052-***T");

    await savePartyDetails(landlord, tenancyId, tenant.partyId, {
      ...TYHJA,
      clearPersonalId: true,
    });
    expect(
      (await listPartyDetails(landlord, tenancyId)).find((p) => p.role === "tenant")!
        .identifierMasked,
    ).toBeNull();
  });

  it("vuokralainen ei muokkaa vuokranantajan tietoja", async () => {
    const { landlord, tenancyId } = await setup();
    const tenantUser = await createUser("tenant-user");

    // Liitetään vuokralainen osapuoleksi suoraan: kutsun lunastus on
    // testattu muualla, ja tässä kysymys on pelkästä muokkausoikeudesta.
    const tenantParty = (await listPartyDetails(landlord, tenancyId)).find(
      (party) => party.role === "tenant",
    )!;
    await getServiceClient()
      .from("rs_tenancy_parties")
      .update({ user_id: tenantUser })
      .eq("id", tenantParty.partyId);

    const landlordParty = (await listPartyDetails(landlord, tenancyId)).find(
      (party) => party.role === "landlord",
    )!;

    expect(
      await savePartyDetails(tenantUser, tenancyId, landlordParty.partyId, {
        ...TYHJA,
        name: "Väärä",
      }),
    ).toEqual({ ok: false, reason: "not_allowed" });

    // Omaansa saa muokata.
    expect(
      await savePartyDetails(tenantUser, tenancyId, tenantParty.partyId, {
        ...TYHJA,
        name: "Maija Meikäläinen",
      }),
    ).toEqual({ ok: true });
  });

  it("ulkopuolinen ei näe osapuolia", async () => {
    const { tenancyId } = await setup();
    const outsider = await createUser("outsider");

    await expect(listPartyDetails(outsider, tenancyId)).rejects.toThrow();
  });

  it("perustiedot kopioituvat uuteen vuokrasuhteeseen", async () => {
    const landlord = await createUser("defaults");

    await saveOwnPartyDefaults(landlord, {
      ...TYHJA,
      name: "Matti Virtanen",
      personalId: HETU,
      phone: "040 123 4567",
      bankAccount: "FI21 1234 5600 0007 85",
    });

    expect((await getOwnPartyDefaults(landlord)).identifierMasked).toBe("131052-***T");
    expect((await getOwnPartyDefaults(landlord)).bankAccount).toBe("FI21 1234 5600 0007 85");

    const property = await createProperty(landlord, {
      name: null,
      street: "Testikatu 2",
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
      tenants: [{ name: "Maija Meikäläinen", email: `${PREFIX}-t2@example.invalid` }],
    });
    created.tenancies.push(tenancy.id);

    const landlordParty = (await listPartyDetails(landlord, tenancy.id)).find(
      (party) => party.role === "landlord",
    )!;

    expect(landlordParty.name).toBe("Matti Virtanen");
    expect(landlordParty.identifierMasked).toBe("131052-***T");
    expect(landlordParty.bankAccount).toBe("FI21 1234 5600 0007 85");
    expect(landlordParty.phone).toBe("040 123 4567");
  });
});
