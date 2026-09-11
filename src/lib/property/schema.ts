/**
 * Asunnon lomakkeen validointi (CLAUDE.md kohta 11: "kaikki lomakesyötteet zodilla").
 *
 * Sama skeema ajetaan sekä palvelintoiminnossa että kentän vierellä
 * näytettävissä virheissä, jotta selaimessa ja palvelimella ei voi olla eri
 * käsitystä siitä, mikä kelpaa.
 *
 * Virheviestit ovat suomeksi ja kertovat mitä tehdä, eivät mikä meni pieleen:
 * "Postinumero on viisi numeroa" auttaa, "Virheellinen arvo" ei.
 */

import { z } from "zod";

export const PROPERTY_TYPES = ["kerrostalo", "rivitalo", "omakotitalo", "muu"] as const;
export const TENURES = ["osake", "kiinteisto", "muu"] as const;

/** Tyhjä valinnainen kenttä tulee lomakkeelta tyhjänä merkkijonona, ei undefinedina. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

export const propertySchema = z.object({
  /** Vapaaehtoinen lempinimi, esim. "Testikadun kaksio". Osoite on silti tunniste. */
  name: optionalText(100),

  street: z.string().trim().min(1, "Katuosoite puuttuu").max(200),

  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Postinumero on viisi numeroa"),

  city: z.string().trim().min(1, "Postitoimipaikka puuttuu").max(100),

  propertyType: z.enum(PROPERTY_TYPES, { message: "Valitse asunnon tyyppi" }),

  /**
   * Huoneluku suomalaisittain: keittiötä ei lasketa (2h+k on kaksi huonetta).
   * Tästä generoidaan oletus-checkpointit, joten arvo vaikuttaa katselmukseen.
   */
  rooms: z.coerce
    .number()
    .int("Huoneluku on kokonaisluku")
    .min(1, "Vähintään yksi huone")
    .max(20, "Enintään 20 huonetta")
    .nullable()
    .optional(),

  areaM2: z.coerce
    .number()
    .positive("Pinta-ala on suurempi kuin nolla")
    .max(2000, "Tarkista pinta-ala")
    .nullable()
    .optional(),

  housingCompany: optionalText(200),

  tenure: z.enum(TENURES).nullable().optional(),
});

export type PropertyInput = z.infer<typeof propertySchema>;

/**
 * Lomakedata zodille.
 *
 * Tyhjät luvut tulevat tyhjinä merkkijonoina; `z.coerce.number()` muuntaisi
 * tyhjän merkkijonon nollaksi, mikä olisi väärä vastaus kysymykseen "montako
 * huonetta". Siksi tyhjä muutetaan tässä nulliksi ennen validointia.
 */
export function propertyFormToInput(form: FormData): Record<string, unknown> {
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : "";
  };
  const blankToNull = (key: string) => {
    const value = text(key).trim();
    return value === "" ? null : value;
  };
  /**
   * Suomeksi desimaalierotin on pilkku, ja `54,5` on se mitä käyttäjä kirjoittaa.
   * Ilman tätä `Number("54,5")` olisi NaN ja lomake hylkäisi oikean arvon.
   */
  const decimalOrNull = (key: string) => {
    const value = blankToNull(key);
    return value === null ? null : value.replace(",", ".");
  };

  return {
    name: text("name"),
    street: text("street"),
    postalCode: text("postalCode"),
    city: text("city"),
    propertyType: text("propertyType"),
    // Huoneluku luetaan samalla tavalla kuin pinta-ala: jos käyttäjä
    // kirjoittaa "2,5", hänelle kuuluu kertoa että luvun on oltava
    // kokonaisluku — ei zodin englanninkielistä NaN-viestiä.
    rooms: decimalOrNull("rooms"),
    areaM2: decimalOrNull("areaM2"),
    housingCompany: text("housingCompany"),
    tenure: blankToNull("tenure"),
  };
}

/** Kenttäkohtaiset virheet lomakkeelle: `{ postalCode: "Postinumero on viisi numeroa" }`. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !result[field]) {
      result[field] = issue.message;
    }
  }
  return result;
}

/** Osoite yhtenä rivinä listaan ja otsikoihin. */
export function formatAddress(property: {
  street: string;
  postalCode: string;
  city: string;
}): string {
  return property.street + ", " + property.postalCode + " " + property.city;
}
