/**
 * Huoltokirjan lomakkeiden kenttäkohtaiset virheet (CLAUDE.md 5.6).
 *
 * `maintenance-actions.ts` on `"use server"`-tiedosto, joten skeemat eivät
 * voi asua siellä: Next sallii sellaisessa tiedostossa vain async-
 * funktioiden viennin. Pituusrajat (120/300 merkkiä) eivät ole tässä, koska
 * `lib/db/maintenance.ts` katkaisee ylipitkän tekstin eikä hylkää sitä —
 * hylkäys hukkaisi kirjoitetun tekstin.
 */

import { z } from "zod";

export const maintenanceEntrySchema = z.object({
  title: z.string().trim().min(1, "Anna merkinnälle otsikko."),
  body: z.string(),
});

export const maintenanceCommentSchema = z.object({
  body: z.string().trim().min(1, "Kirjoita kommentti ennen lähettämistä."),
});

export const maintenanceCancelSchema = z.object({
  reason: z.string().trim().min(1, "Kerro lyhyesti, miksi merkintä perutaan."),
});
