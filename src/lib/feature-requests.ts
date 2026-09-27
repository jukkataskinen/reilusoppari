import { z } from "zod";
import { HELP_TOPICS } from "@/lib/help/topics";

/**
 * Kehitystoiveet (migraatio 0018, DECISIONS.md 2026-09-27).
 *
 * Toive kohdistetaan toimintoon, joka on sama kuin ohjesivuston aihe. Näin
 * toiveet ryhmittyvät samoin kuin ohjeet, eikä toimintojen listaa tarvitse
 * ylläpitää kahdessa paikassa.
 */

export const OTHER_FEATURE = "muu";

export function featureOptions(): { value: string; label: string; group: string }[] {
  return [
    ...HELP_TOPICS.filter((t) => t.slug !== "kehitystoiveet").map((t) => ({
      value: t.slug,
      label: t.title,
      group: t.group,
    })),
    { value: OTHER_FEATURE, label: "Uusi toiminto tai muu asia", group: "Muu" },
  ];
}

export function isFeature(value: unknown): value is string {
  return typeof value === "string" && featureOptions().some((f) => f.value === value);
}

export function featureLabel(slug: string): string {
  return featureOptions().find((f) => f.value === slug)?.label ?? "Muu asia";
}

export const IMPORTANCE_LABEL: Record<Importance, string> = {
  nice: "Olisi mukava",
  important: "Tärkeä",
  blocking: "Estää käytön",
};

export const REQUEST_STATUS: Record<RequestStatus, { label: string; tone: "sky" | "moss" | "ink" }> = {
  new: { label: "Vastaanotettu", tone: "sky" },
  planned: { label: "Suunnitteilla", tone: "sky" },
  in_progress: { label: "Työn alla", tone: "sky" },
  done: { label: "Tehty", tone: "moss" },
  declined: { label: "Ei toteuteta", tone: "ink" },
};

export const IMPORTANCES = ["nice", "important", "blocking"] as const;
export const STATUSES = ["new", "planned", "in_progress", "done", "declined"] as const;
export type Importance = (typeof IMPORTANCES)[number];
export type RequestStatus = (typeof STATUSES)[number];

/**
 * Sivun osoite, jolta toive jätettiin. Vain sovelluksen sisäinen polku:
 * muuten lomakkeella voisi tallentaa minkä tahansa osoitteen, ja käsittelijän
 * näkymässä se olisi linkki ulos.
 */
export function safePagePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // "//" alussa olisi selaimelle toisen palvelimen osoite.
  return trimmed.length <= 200 && /^\/[\w\-/]*$/.test(trimmed) && !trimmed.startsWith("//") ? trimmed : null;
}

export const featureRequestSchema = z.object({
  feature: z.string().refine(isFeature, "Valitse toiminto, jota toive koskee."),
  pagePath: z.unknown().transform(safePagePath),
  title: z.string().trim().min(1, "Kirjoita toiveelle lyhyt otsikko.").max(200, "Otsikko on liian pitkä."),
  description: z
    .string()
    .trim()
    .min(1, "Kerro, mitä toivot ja miksi.")
    .max(5000, "Teksti on liian pitkä. Enintään 5000 merkkiä."),
  importance: z.enum(IMPORTANCES, "Valitse, kuinka tärkeä asia on."),
});

export const featureRequestUpdateSchema = z.object({
  status: z.enum(STATUSES, "Valitse tila."),
  response: z
    .string()
    .trim()
    .max(5000, "Vastaus on liian pitkä.")
    .transform((v) => (v === "" ? null : v)),
});

/**
 * Onko käyttäjä toiveiden käsittelijä?
 *
 * Reilusopparissa ei ole organisaatiota eikä pääkäyttäjää, joten käsittelijät
 * luetaan ympäristömuuttujasta. Sähköposti tulee Auth0:n istunnosta, jossa se
 * on todennettu kertakäyttöisellä koodilla, joten siihen voi luottaa.
 */
export function isFeatureRequestAdmin(email: string | null | undefined, list = process.env.FEATURE_REQUEST_ADMIN_EMAILS): boolean {
  if (!email || !list) return false;
  const wanted = email.trim().toLowerCase();
  return list
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(wanted);
}

/** Päivä suomalaisittain Helsingin ajassa: palvelin voi olla toisessa aikavyöhykkeessä. */
export function formatRequestDate(iso: string): string {
  return new Intl.DateTimeFormat("fi-FI", { timeZone: "Europe/Helsinki", day: "numeric", month: "numeric", year: "numeric" }).format(
    new Date(iso),
  );
}
