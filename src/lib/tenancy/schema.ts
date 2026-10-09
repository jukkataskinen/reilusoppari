/**
 * Vuokrasuhteen luonnin validointi (CLAUDE.md 5.1, kohta 11).
 *
 * Tässä on vain se, mitä vuokrasuhteen aloittamiseen tarvitaan. Sopimuksen
 * muut ehdot — irtisanomisaika, tupakointi, lemmikit, avaimet — kysytään
 * vasta sopimuslomakkeella, koska ne eivät vaikuta siihen, voiko vuokralaisen
 * kutsua.
 */

import { z } from "zod";
import { requiredDate, requiredNumber } from "@/lib/forms/schema";

/** Suomalainen päivämäärä ISO-muodossa. */
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Päivämäärä muodossa VVVV-KK-PP");

export const tenantSchema = z.object({
  name: z.string().trim().min(1, "Vuokralaisen nimi puuttuu").max(200),
  email: z
    .string()
    .trim()
    .min(1, "Sähköpostiosoite puuttuu")
    .email("Tarkista sähköpostiosoite")
    .max(320)
    .toLowerCase(),
});

export const tenancySchema = z
  .object({
    propertyId: z.string().uuid("Valitse asunto"),

    /**
     * 1–2 vuokralaista (CLAUDE.md kohta 3). Useampi vaatisi päätöksen siitä,
     * kuka vastaa mistäkin — sitä ei ole tehty, joten rajaa ei nosteta
     * huomaamatta.
     */
    tenants: z
      .array(tenantSchema)
      .min(1, "Lisää ainakin yksi vuokralainen")
      .max(2, "Enintään kaksi vuokralaista"),

    startDate: requiredDate("Alkupäivä puuttuu"),
    /** Tyhjä = toistaiseksi voimassa oleva. */
    endDate: isoDate.nullable().optional(),

    rentAmount: requiredNumber(
      "Vuokra puuttuu",
      z.number().positive("Vuokran on oltava suurempi kuin nolla").max(100_000, "Tarkista vuokra"),
    ),

    rentDueDay: requiredNumber(
      "Eräpäivä puuttuu",
      z
        .number()
        .int("Eräpäivä on kokonaisluku")
        .min(1, "Eräpäivä on 1–31")
        .max(31, "Eräpäivä on 1–31"),
    ),

    /** Tyhjä vakuus on nolla: vakuudetonkin vuokrasuhde on mahdollinen. */
    depositAmount: requiredNumber(
      "Vakuus puuttuu",
      z.number().min(0, "Vakuus ei voi olla negatiivinen").max(100_000, "Tarkista vakuus"),
    ),
  })
  .refine((data) => !data.endDate || data.endDate > data.startDate, {
    message: "Päättymispäivä on ennen alkupäivää",
    path: ["endDate"],
  })
  .refine(
    (data) => {
      // Kaksi vuokralaista samalla sähköpostilla tarkoittaisi, että toinen
      // kutsu menee hukkaan ja toinen osapuoli jää ilman omaa tiliä.
      const emails = data.tenants.map((t) => t.email);
      return new Set(emails).size === emails.length;
    },
    { message: "Vuokralaisilla on oltava eri sähköpostiosoitteet", path: ["tenants"] },
  );

export type TenancyInput = z.infer<typeof tenancySchema>;

/** Lomakedata zodille. Tyhjä päättymispäivä on `null`, ei tyhjä merkkijono. */
export function tenancyFormToInput(form: FormData): Record<string, unknown> {
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const blankToNull = (key: string) => (text(key) === "" ? null : text(key));
  // Luvut menevät zodille sellaisinaan: `requiredNumber` ymmärtää
  // desimaalipilkun ja erottaa tyhjän kentän väärin kirjoitetusta.

  // Ensimmäinen vuokralainen on aina mukana, myös tyhjänä: silloin virhe
  // tulee nimi- ja sähköpostikentän viereen ("Vuokralaisen nimi puuttuu")
  // eikä yleisenä "Lisää ainakin yksi vuokralainen" -viestinä.
  const tenants: { name: string; email: string }[] = [];
  for (let index = 0; index < 2; index += 1) {
    const name = text(`tenantName${index}`);
    const email = text(`tenantEmail${index}`);
    if (index === 0 || name || email) tenants.push({ name, email });
  }

  return {
    propertyId: text("propertyId"),
    tenants,
    startDate: text("startDate"),
    endDate: blankToNull("endDate"),
    rentAmount: text("rentAmount"),
    rentDueDay: text("rentDueDay"),
    depositAmount: text("depositAmount") || "0",
  };
}

/**
 * Zodin polku lomakkeen kentän nimeksi: `tenants.1.email` → `tenantEmail1`.
 * Muut kentät ovat suoraan polun ensimmäinen osa.
 */
export function tenancyFieldName(path: PropertyKey[]): string | undefined {
  if (path[0] === "tenants" && typeof path[1] === "number" && typeof path[2] === "string") {
    return `tenant${path[2].charAt(0).toUpperCase()}${path[2].slice(1)}${path[1]}`;
  }
  return typeof path[0] === "string" ? path[0] : undefined;
}
