/**
 * Sopimuksen ehdot (CLAUDE.md 5.1, `vuokrasopimus_asuinhuoneisto`).
 *
 * ===========================================================================
 * TÄSSÄ ON VAIN SE, MIKÄ EI OLE JO VUOKRASUHTEESSA
 *
 * Osoite, osapuolet, alkupäivä, vuokra, eräpäivä ja vakuus tulevat
 * vuokrasuhteesta (`tenancy/schema.ts`) eivätkä ole täällä. Jos ne olisivat
 * kahdessa paikassa, ne voisivat erota toisistaan — ja asiakirja näyttäisi
 * eri luvut kuin sovellus.
 * ===========================================================================
 */

import { z } from "zod";

export const contractTermsSchema = z.object({
  /**
   * Osapuolten nimet.
   *
   * ==========================================================================
   * MIKSI NIMET OVAT SOPIMUKSESSA EIVÄTKÄ KÄYTTÄJÄTIEDOISSA
   *
   * `rs_users.name` täyttyy vasta eSinetin tunnistuksesta allekirjoituksen
   * yhteydessä (CLAUDE.md kohta 2) — mutta sopimus on kirjoitettava ja
   * esikatseltava ennen sitä. Nimet ovat siis sopimuksen dataa, jonka
   * vuokranantaja kirjoittaa itse.
   *
   * Allekirjoituksen jälkeen tunnistuksesta saatu nimi on se, joka pätee.
   * Tässä oleva on luonnos, eikä sitä esitetä todennettuna missään.
   * ==========================================================================
   */
  landlordName: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value === "" ? null : value))
    .nullable(),
  tenantNames: z.array(z.string().trim().max(200)).max(2),

  /**
   * Irtisanomisaika kuukausina.
   *
   * Laki asettaa vähimmäisajat (AHVL 481/1995): vuokralaiselle yksi kuukausi,
   * vuokranantajalle kolme ja yli vuoden kestäneessä vuokrasuhteessa kuusi.
   * Lomake ei estä pienempää arvoa, koska sopimuksessa voidaan sopia
   * vuokralaiselle edullisemmin — mutta asiakirja kertoo lain vähimmäisajat
   * joka tapauksessa (`RentalAgreement.tsx`).
   */
  noticePeriodMonths: z.coerce
    .number()
    .int("Irtisanomisaika on kokonaisluku")
    .min(0, "Irtisanomisaika ei voi olla negatiivinen")
    .max(12, "Tarkista irtisanomisaika"),

  /** Vapaa teksti, esim. "elinkustannusindeksin mukaan kerran vuodessa". */
  rentIncreaseTerm: z
    .string()
    .trim()
    .max(300, "Enintään 300 merkkiä")
    .transform((value) => (value === "" ? null : value))
    .nullable(),

  keysCount: z.coerce
    .number()
    .int("Avainten määrä on kokonaisluku")
    .min(0)
    .max(50, "Tarkista avainten määrä")
    .nullable(),

  smokingAllowed: z.boolean(),
  petsAllowed: z.boolean(),
  waterIncluded: z.boolean(),
  electricityIncluded: z.boolean(),

  otherTerms: z
    .string()
    .trim()
    .max(2000, "Enintään 2000 merkkiä")
    .transform((value) => (value === "" ? null : value))
    .nullable(),
});

export type ContractTerms = z.infer<typeof contractTermsSchema>;

/** Pohjan avain ja versio. Versio nousee, kun sopimustekstit muuttuvat. */
export const CONTRACT_TEMPLATE_KEY = "vuokrasopimus_asuinhuoneisto";
export const CONTRACT_TEMPLATE_VERSION = 1;

/**
 * Oletusehdot uudelle sopimukselle.
 *
 * Oletukset on valittu niin, että ne ovat **vuokralaiselle turvallisimmat**:
 * tupakointi ja lemmikit kielletty on tavallisin lähtökohta, mutta vesi ja
 * sähkö vuokraan sisältymättöminä tarkoittaisi yllätyslaskuja, jos
 * vuokranantaja ei huomaa muuttaa. Siksi ne ovat päinvastoin: oletus on se,
 * mikä ei yllätä.
 */
export const DEFAULT_CONTRACT_TERMS: ContractTerms = {
  landlordName: null,
  tenantNames: [],
  noticePeriodMonths: 1,
  rentIncreaseTerm: null,
  keysCount: null,
  smokingAllowed: false,
  petsAllowed: false,
  waterIncluded: true,
  electricityIncluded: false,
  otherTerms: null,
};

/** Lomakedata zodille. Valintaruudut puuttuvat kokonaan kun ne eivät ole päällä. */
export function contractFormToInput(form: FormData): Record<string, unknown> {
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const checkbox = (key: string) => form.get(key) === "on";
  const blankToNull = (key: string) => (text(key) === "" ? null : text(key));

  const tenantNames: string[] = [];
  for (let index = 0; index < 2; index += 1) {
    const name = text(`tenantName${index}`);
    if (name) tenantNames.push(name);
  }

  return {
    landlordName: text("landlordName"),
    tenantNames,
    noticePeriodMonths: text("noticePeriodMonths") || "0",
    rentIncreaseTerm: text("rentIncreaseTerm"),
    keysCount: blankToNull("keysCount"),
    smokingAllowed: checkbox("smokingAllowed"),
    petsAllowed: checkbox("petsAllowed"),
    waterIncluded: checkbox("waterIncluded"),
    electricityIncluded: checkbox("electricityIncluded"),
    otherTerms: text("otherTerms"),
  };
}
