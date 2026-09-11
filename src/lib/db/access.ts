/**
 * Osapuolirajaus yhdessä paikassa (CLAUDE.md kohta 4, esinetti 0.1 kohta 1).
 *
 * Sovellus ajaa kyselyt `service_role`-avaimella, joka ohittaa RLS:n. Rajaus on
 * siis koodin vastuulla, ja se on tehtävä **joka kerta**. Tämä moduuli on se
 * yksi paikka: älä kirjoita omaa `.eq("user_id", …)`-tarkistusta kyselyjen
 * sekaan, koska silloin yksi unohdus riittää vuotoon.
 *
 * Perussääntö: rivin näkee vain vuokrasuhteen osapuoli tai asunnon omistaja.
 * Sama sääntö on myös SQL-funktiona `rs_is_party` migraatiossa 0001 – se on
 * puolustussyvyyttä tämän rinnalla, ei sen korvaaja.
 */

import { getServiceClient } from "./supabase";

/** Heitetään kun kutsujalla ei ole oikeutta. Reitti mappaa tämän 404:ksi. */
export class NotAuthorizedError extends Error {
  constructor(message = "Ei oikeutta.") {
    super(message);
    this.name = "NotAuthorizedError";
  }
}

/**
 * Onko käyttäjä tämän vuokrasuhteen osapuoli?
 *
 * Tarkistaa `rs_tenancy_parties`-rivin, ei `rs_tenancies.landlord_user_id`:tä:
 * vuokranantajalle luodaan aina myös party-rivi, joten yksi kysely riittää ja
 * sääntö on sama molemmille osapuolille.
 */
export async function isTenancyParty(userId: string, tenancyId: string): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from("rs_tenancy_parties")
    .select("id")
    .eq("tenancy_id", tenancyId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Osapuolitarkistus epäonnistui: ${error.message}`);
  return data !== null;
}

/** Omistaako käyttäjä asunnon? Salkkunäkymät eivät kulje vuokrasuhteen kautta. */
export async function ownsProperty(userId: string, propertyId: string): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from("rs_properties")
    .select("id")
    .eq("id", propertyId)
    .eq("owner_user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Omistajatarkistus epäonnistui: ${error.message}`);
  return data !== null;
}

/**
 * Vaatii osapuoliaseman tai heittää.
 *
 * Virheviesti on tarkoituksella sama riippumatta siitä, onko vuokrasuhdetta
 * olemassa vai eikö kutsujalla ole siihen oikeutta. Muuten virhe kertoisi
 * ulkopuoliselle, mitkä id:t ovat olemassa (esinetti 0.1 kohta 6).
 */
export async function requireTenancyParty(userId: string, tenancyId: string): Promise<void> {
  if (!(await isTenancyParty(userId, tenancyId))) {
    throw new NotAuthorizedError("Vuokrasuhdetta ei löytynyt.");
  }
}

export async function requirePropertyOwner(userId: string, propertyId: string): Promise<void> {
  if (!(await ownsProperty(userId, propertyId))) {
    throw new NotAuthorizedError("Asuntoa ei löytynyt.");
  }
}

/**
 * Kulut ja verolaskelma ovat VAIN asunnon omistajan.
 *
 * Tämä on tarkoituksella oma funktionsa eikä `requirePropertyOwner`in alias:
 * nimi kertoo lukijalle, että vuokralaisen pääsy on tässä suljettu
 * tarkoituksella eikä siksi, että joku unohti lisätä hänet.
 */
export const requireExpenseAccess = requirePropertyOwner;
