/**
 * Sopimuksen ehdot (CLAUDE.md 5.1, `vuokrasopimus_asuinhuoneisto`).
 *
 * ===========================================================================
 * SISÄLTÖ MALLISOPIMUKSESTA, KIELI OMA
 *
 * Kattavuus on otettu Jukan käyttämästä oikeasta vuokrasopimuksesta
 * (2026-09-11): muuttopäivä, muutostyöt, loppusiivous, kotivakuutus,
 * jälleenvuokraus, viivästyskorko, vakuuden eräpäivä ja realisointi.
 *
 * Sanamuodot EIVÄT ole sieltä. Mallisopimus on kirjoitettu juuri sillä
 * virkamieskielellä, jota tässä palvelussa vältetään (DECISIONS.md
 * 2026-09-11). Sama asia sanotaan tässä niin, että vuokralainen ymmärtää sen
 * ensilukemalla — ilman että sisältö kevenee.
 * ===========================================================================
 *
 * Osoite, osapuolet, alkupäivä, vuokra, eräpäivä ja vakuuden määrä tulevat
 * vuokrasuhteesta (`tenancy/schema.ts`) eivätkä ole täällä. Jos ne olisivat
 * kahdessa paikassa, ne voisivat erota toisistaan.
 */

import { z } from "zod";

const optionalNumber = (max: number) =>
  z.coerce.number().min(0).max(max).nullable().optional().default(null);

export const contractTermsSchema = z.object({
  /**
   * Osapuolten nimet.
   *
   * `rs_users.name` täyttyy vasta eSinetin tunnistuksesta allekirjoituksen
   * yhteydessä (CLAUDE.md kohta 2) — mutta sopimus on kirjoitettava ja
   * esikatseltava ennen sitä. Nimet ovat siis sopimuksen dataa, jonka
   * vuokranantaja kirjoittaa itse. Allekirjoituksen jälkeen tunnistuksesta
   * saatu nimi on se, joka pätee.
   */
  landlordName: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value === "" ? null : value))
    .nullable(),
  tenantNames: z.array(z.string().trim().max(200)).max(2),

  /** Kalustettu vai ei. Vaikuttaa siihen, mitä asunnosta luovutetaan. */
  furnished: z.boolean().default(false),

  /**
   * Irtisanomisaika kuukausina.
   *
   * Laki asettaa vähimmäisajat (AHVL 481/1995): vuokralaiselle yksi kuukausi,
   * vuokranantajalle kolme ja yli vuoden kestäneessä vuokrasuhteessa kuusi.
   * Asiakirja kertoo ne joka tapauksessa.
   */
  noticePeriodMonths: z.coerce
    .number()
    .int("Irtisanomisaika on kokonaisluku")
    .min(0, "Irtisanomisaika ei voi olla negatiivinen")
    .max(12, "Tarkista irtisanomisaika"),

  /**
   * Määräaika, jonka kuluessa sopimusta ei voi irtisanoa.
   *
   * ==========================================================================
   * TOISTAISEKSI VOIMASSA, MUTTA EI HETI IRTISANOTTAVISSA
   *
   * Yleinen järjestely: sopimus on toistaiseksi voimassa, mutta ensimmäinen
   * mahdollinen irtisanomispäivä on esimerkiksi 12 kuukauden kuluttua
   * alkamisesta. Vuokranantaja saa varmuuden siitä, ettei asunto tyhjene
   * kolmessa kuukaudessa, ja vuokralainen tietää sitoutuvansa vuodeksi.
   *
   * Tämä on eri asia kuin määräaikainen sopimus: määräaikainen PÄÄTTYY
   * sovittuna päivänä, tämä jatkuu sen jälkeen normaalisti.
   *
   * `null` = ei rajoitusta.
   * ==========================================================================
   */
  minimumTermMonths: z.coerce
    .number()
    .int("Kuukausimäärä on kokonaisluku")
    .min(1)
    .max(60, "Enintään 60 kuukautta")
    .nullable()
    .optional()
    .default(null),

  /** Vapaa teksti, esim. "elinkustannusindeksin mukaan kerran vuodessa". */
  rentIncreaseTerm: z
    .string()
    .trim()
    .max(300, "Enintään 300 merkkiä")
    .transform((value) => (value === "" ? null : value))
    .nullable(),

  /** Mihin päivään mennessä vakuus on maksettava. `null` = ei erikseen sovittu. */
  depositDueDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Päivämäärä muodossa VVVV-KK-PP")
    .nullable()
    .optional()
    .default(null),

  keysCount: z.coerce
    .number()
    .int("Avainten määrä on kokonaisluku")
    .min(0)
    .max(50, "Tarkista avainten määrä")
    .nullable(),

  smokingAllowed: z.boolean(),
  petsAllowed: z.boolean(),

  waterIncluded: z.boolean(),
  /** Erillinen vesimaksu, jos vesi ei sisälly vuokraan. */
  waterChargeEur: optionalNumber(1000),
  /** Onko vesimaksu henkilöä kohden vai asuntoa kohden? */
  waterChargePerPerson: z.boolean().default(false),

  electricityIncluded: z.boolean(),
  broadbandIncluded: z.boolean().default(false),

  /** Vaaditaanko vuokralaiselta kotivakuutus vastuuvakuutuksella? */
  insuranceRequired: z.boolean().default(true),

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
/** 2 = mallisopimuksen kattavuus, oma kieli (2026-09-11). */
export const CONTRACT_TEMPLATE_VERSION = 2;

/**
 * Oletusehdot uudelle sopimukselle.
 *
 * Oletukset on valittu niin, että ne ovat **vuokralaiselle turvallisimmat**:
 * jos vuokranantaja ei huomaa muuttaa niitä, seurauksena ei ole
 * yllätyslaskua. Siksi vesi sisältyy vuokraan oletuksena, vaikka
 * tavallisempaa olisi päinvastoin.
 */
export const DEFAULT_CONTRACT_TERMS: ContractTerms = {
  landlordName: null,
  tenantNames: [],
  furnished: false,
  noticePeriodMonths: 1,
  minimumTermMonths: null,
  rentIncreaseTerm: null,
  depositDueDate: null,
  keysCount: null,
  smokingAllowed: false,
  petsAllowed: false,
  waterIncluded: true,
  waterChargeEur: null,
  waterChargePerPerson: false,
  electricityIncluded: false,
  broadbandIncluded: false,
  insuranceRequired: true,
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
  const decimal = (key: string) => {
    const value = blankToNull(key);
    return value === null ? null : value.replace(",", ".");
  };

  const tenantNames: string[] = [];
  for (let index = 0; index < 2; index += 1) {
    const name = text(`tenantName${index}`);
    if (name) tenantNames.push(name);
  }

  return {
    landlordName: text("landlordName"),
    tenantNames,
    furnished: checkbox("furnished"),
    noticePeriodMonths: text("noticePeriodMonths") || "0",
    // Kuukausimäärä luetaan vain jos rajoitus on rastitettu. Muuten kenttään
    // jäänyt luku jäisi voimaan vaikka rasti poistettiin.
    minimumTermMonths: checkbox("hasMinimumTerm") ? blankToNull("minimumTermMonths") : null,
    rentIncreaseTerm: text("rentIncreaseTerm"),
    depositDueDate: blankToNull("depositDueDate"),
    keysCount: blankToNull("keysCount"),
    smokingAllowed: checkbox("smokingAllowed"),
    petsAllowed: checkbox("petsAllowed"),
    waterIncluded: checkbox("waterIncluded"),
    waterChargeEur: checkbox("waterIncluded") ? null : decimal("waterChargeEur"),
    waterChargePerPerson: checkbox("waterChargePerPerson"),
    electricityIncluded: checkbox("electricityIncluded"),
    broadbandIncluded: checkbox("broadbandIncluded"),
    insuranceRequired: checkbox("insuranceRequired"),
    otherTerms: text("otherTerms"),
  };
}
