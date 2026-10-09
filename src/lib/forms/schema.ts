/**
 * Lomakkeiden palvelinpuolen validoinnin yhteiset osat.
 *
 * Periaate kaikissa lomakkeissa: virhe kerrotaan sen kentän vieressä, jota
 * se koskee, ja niin että käyttäjä tietää mitä tehdä. "Vuokra puuttuu"
 * auttaa, "Vuokran on oltava suurempi kuin nolla" tyhjän kentän kohdalla ei.
 */

import { z } from "zod";

/**
 * Zodin oletusviestit suomeksi ja arkikielellä.
 *
 * Jos skeemassa ei ole omaa viestiä (esim. `.min(0)`), zod käyttäisi
 * englanninkielistä tekstiä. Oma viesti skeemassa menee aina tämän edelle.
 */
z.config({
  customError: (issue) => {
    switch (issue.code) {
      case "invalid_type":
        if (issue.expected === "number" || issue.expected === "int") {
          return "Kirjoita luku numeroina.";
        }
        return "Tarkista tämä tieto.";
      case "too_small":
        if (issue.origin === "string") {
          return Number(issue.minimum) <= 1
            ? "Tämä tieto puuttuu."
            : `Vähintään ${issue.minimum} merkkiä.`;
        }
        if (issue.origin === "number") return `Pienin sallittu arvo on ${issue.minimum}.`;
        return "Tarkista tämä tieto.";
      case "too_big":
        if (issue.origin === "string") return `Enintään ${issue.maximum} merkkiä.`;
        if (issue.origin === "number") return `Suurin sallittu arvo on ${issue.maximum}.`;
        return "Tarkista tämä tieto.";
      case "invalid_format":
        return issue.format === "email" ? "Tarkista sähköpostiosoite." : "Tarkista muoto.";
      case "invalid_value":
        return "Valitse jokin vaihtoehdoista.";
      default:
        return "Tarkista tämä tieto.";
    }
  },
});

const isBlank = (value: unknown) =>
  value === null || value === undefined || (typeof value === "string" && value.trim() === "");

/** "1 250,50" → 1250.5. Suomeksi desimaalierotin on pilkku ja tuhannet erotetaan välilyönnillä. */
function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  return Number(String(value).trim().replace(/\s/g, "").replace(",", "."));
}

/**
 * Pakollinen luku.
 *
 * `z.coerce.number()` muuttaa tyhjän kentän nollaksi, jolloin tyhjä
 * vuokrakenttä sai viestin "Vuokran on oltava suurempi kuin nolla". Tämä
 * erottaa puuttuvan arvon (oma viesti) väärin kirjoitetusta.
 */
export function requiredNumber(missing: string, schema: z.ZodNumber = z.number()) {
  return z
    .unknown()
    .transform((value, ctx) => {
      if (isBlank(value)) {
        ctx.addIssue({ code: "custom", message: missing });
        return z.NEVER;
      }
      const number = toNumber(value);
      if (!Number.isFinite(number)) {
        ctx.addIssue({ code: "custom", message: "Kirjoita luku numeroina." });
        return z.NEVER;
      }
      return number;
    })
    .pipe(schema);
}

/** Pakollinen päivämäärä (`<input type="date">` lähettää muodon VVVV-KK-PP). */
export function requiredDate(missing: string) {
  return z
    .string({ error: missing })
    .trim()
    .min(1, missing)
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarkista päivämäärä.");
}

/**
 * Kenttäkohtaiset virheet lomakkeelle: `{ postalCode: "Postinumero on viisi numeroa" }`.
 *
 * Avaimena on oletuksena polun ensimmäinen osa. `fieldName` muuntaa
 * sisäkkäisen polun lomakkeen kentän nimeksi, esim. `tenants.0.name` →
 * `tenantName0`, jotta virhe näkyy oikean kentän vieressä eikä lomakkeen
 * yläreunassa.
 */
export function fieldErrors(
  error: z.ZodError,
  fieldName: (path: PropertyKey[]) => string | undefined = (path) =>
    typeof path[0] === "string" ? path[0] : undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = fieldName(issue.path);
    if (field && !result[field]) result[field] = issue.message;
  }
  return result;
}
