import { afterAll, describe, expect, it } from "vitest";
import {
  DEFAULT_CONTRACT_TERMS,
  contractFormToInput,
  contractTermsSchema,
} from "@/lib/tenancy/contract-schema";
import { getContract, getContractTerms, saveContractTerms } from "@/lib/db/contracts";
import { createProperty } from "@/lib/db/properties";
import { acceptInvite, createTenancy } from "@/lib/db/tenancies";
import { getServiceClient, hasSupabaseCredentials } from "@/lib/db/supabase";
import { buildRentalAgreementData } from "@/lib/tenancy/contract-document";

/**
 * Sopimuksen ehdot.
 *
 * Kaksi asiaa, joita testit vahtivat: oletukset eivät saa yllättää
 * vuokralaista, ja vain vuokranantaja saa muuttaa ehtoja.
 */

describe("oletusehdot", () => {
  it("eivät yllätä vuokralaista", () => {
    // Vesi kuuluu vuokraan oletuksena: jos vuokranantaja ei huomaa muuttaa
    // sitä, seurauksena ei ole yllätyslaskua vuokralaiselle.
    expect(DEFAULT_CONTRACT_TERMS.waterIncluded).toBe(true);
    // Tupakointi ja lemmikit kielletty on tavallisin lähtökohta.
    expect(DEFAULT_CONTRACT_TERMS.smokingAllowed).toBe(false);
    expect(DEFAULT_CONTRACT_TERMS.petsAllowed).toBe(false);
  });

  it("kelpaavat skeemalle sellaisinaan", () => {
    expect(contractTermsSchema.safeParse(DEFAULT_CONTRACT_TERMS).success).toBe(true);
  });
});

describe("lomakkeen luku", () => {
  function form(values: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
  }

  it("puuttuva valintaruutu tarkoittaa epätotta", () => {
    // Selain ei lähetä valitsematonta valintaruutua lainkaan. Jos se
    // tulkittaisiin todeksi, jokainen tallennus kääntäisi asetukset päälle.
    const parsed = contractTermsSchema.safeParse(
      contractFormToInput(form({ landlordName: "Matti", tenantName0: "Maija" })),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.smokingAllowed).toBe(false);
      expect(parsed.data.waterIncluded).toBe(false);
    }
  });

  it("lukee valintaruudut ja nimet", () => {
    const parsed = contractTermsSchema.safeParse(
      contractFormToInput(
        form({
          landlordName: "Matti Virtanen",
          tenantName0: "Maija Meikäläinen",
          tenantName1: "Matti Meikäläinen",
          noticePeriodMonths: "3",
          keysCount: "3",
          smokingAllowed: "on",
          waterIncluded: "on",
          otherTerms: "Autopaikka 4.",
        }),
      ),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.landlordName).toBe("Matti Virtanen");
    expect(parsed.data.tenantNames).toEqual(["Maija Meikäläinen", "Matti Meikäläinen"]);
    expect(parsed.data.noticePeriodMonths).toBe(3);
    expect(parsed.data.keysCount).toBe(3);
    expect(parsed.data.smokingAllowed).toBe(true);
    expect(parsed.data.petsAllowed).toBe(false);
    expect(parsed.data.waterIncluded).toBe(true);
    expect(parsed.data.otherTerms).toBe("Autopaikka 4.");
  });

  it("tyhjä vapaa kenttä on null eikä tyhjä merkkijono", () => {
    const parsed = contractTermsSchema.safeParse(
      contractFormToInput(form({ landlordName: "Matti", otherTerms: "   " })),
    );
    expect(parsed.success && parsed.data.otherTerms).toBeNull();
    expect(parsed.success && parsed.data.rentIncreaseTerm).toBeNull();
  });

  it("hylkää liian pitkän vapaan tekstin", () => {
    const parsed = contractTermsSchema.safeParse(
      contractFormToInput(form({ landlordName: "Matti", otherTerms: "x".repeat(2001) })),
    );
    expect(parsed.success).toBe(false);
  });
});

const RUN = hasSupabaseCredentials();
const PREFIX = `testi-sop-${Date.now()}`;
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

/** Juokseva numero: jokainen `setup()` tarvitsee omat käyttäjänsä. */
let setupCount = 0;

async function setup() {
  const n = (setupCount += 1);
  const landlord = await createUser(`l${n}`);
  const tenant = await createUser(`t${n}`);
  const property = await createProperty(landlord, {
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

  const { tenancy, invites } = await createTenancy(landlord, {
    propertyId: property.id,
    tenants: [{ name: "Maija Meikäläinen", email: `${PREFIX}-t${n}@example.invalid` }],
    startDate: "2026-09-01",
    endDate: null,
    rentAmount: 850,
    rentDueDay: 5,
    depositAmount: 1700,
  });
  created.tenancies.push(tenancy.id);
  await acceptInvite(invites[0].token, tenant, `${PREFIX}-t${n}@example.invalid`);

  return { landlord, tenant, tenancy };
}

afterAll(async () => {
  if (!RUN) return;
  const supabase = getServiceClient();
  for (const id of created.tenancies) await supabase.from("rs_tenancies").delete().eq("id", id);
  for (const id of created.properties) await supabase.from("rs_properties").delete().eq("id", id);
  for (const id of created.users) await supabase.from("rs_users").delete().eq("id", id);
});

describe.skipIf(!RUN)("sopimus (integraatio, live Supabase)", () => {
  it("luodaan vuokrasuhteen mukana ja säilyttää vuokralaisen nimen", async () => {
    const { landlord, tenancy } = await setup();

    const contract = await getContract(landlord, tenancy.id);
    expect(contract).not.toBeNull();
    // Nimi annettiin vuokrasuhteen luonnissa; ilman tätä se katoaisi, koska
    // osapuolitaulu tallentaa vain sähköpostin.
    expect(contract!.terms.tenantNames).toEqual(["Maija Meikäläinen"]);
  });

  it("vain vuokranantaja voi tallentaa ehdot", async () => {
    const { landlord, tenant, tenancy } = await setup();

    const saved = await saveContractTerms(landlord, tenancy.id, {
      ...DEFAULT_CONTRACT_TERMS,
      landlordName: "Matti Virtanen",
      tenantNames: ["Maija Meikäläinen"],
      petsAllowed: true,
    });
    expect(saved?.terms.petsAllowed).toBe(true);

    // Vuokralainen näkee mutta ei muuta: muuten sopimus voisi muuttua sen
    // jälkeen, kun vuokranantaja on sen lukenut.
    expect(
      await saveContractTerms(tenant, tenancy.id, {
        ...DEFAULT_CONTRACT_TERMS,
        landlordName: "Väärä",
        tenantNames: [],
      }),
    ).toBeNull();

    expect((await getContractTerms(tenant, tenancy.id)).landlordName).toBe("Matti Virtanen");
  });

  it("ulkopuolinen ei näe sopimusta", async () => {
    const { tenancy } = await setup();
    const outsider = await createUser("x");

    expect(await getContract(outsider, tenancy.id)).toBeNull();
  });

  it("asiakirjan tiedot kootaan molemmille osapuolille", async () => {
    const { landlord, tenant, tenancy } = await setup();
    await saveContractTerms(landlord, tenancy.id, {
      ...DEFAULT_CONTRACT_TERMS,
      landlordName: "Matti Virtanen",
      tenantNames: ["Maija Meikäläinen"],
    });

    for (const userId of [landlord, tenant]) {
      const data = await buildRentalAgreementData(userId, tenancy.id);
      expect(data).not.toBeNull();
      expect(data!.property.street).toBe("Testikatu 1");
      expect(data!.landlordName).toBe("Matti Virtanen");
      expect(data!.rentAmount).toBe(850);
      // Päiväys on vuokrasuhteen alkupäivä eikä kuluva päivä, jotta
      // esikatselun tiiviste on vakaa.
      expect(data!.signedDate).toBe("2026-09-01");
    }
  });

  it("ulkopuoliselle asiakirjaa ei koota", async () => {
    const { tenancy } = await setup();
    const outsider = await createUser("x2");
    expect(await buildRentalAgreementData(outsider, tenancy.id)).toBeNull();
  });
});
