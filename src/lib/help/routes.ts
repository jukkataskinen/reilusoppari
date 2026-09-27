import { HELP_TOPICS, sectionId } from "./topics";

/**
 * Sovelluksen sivut ja niiden ohjeet. Kehys (`AppShell`) näyttää kirjautuneelle
 * jokaisella sivulla linkin sivun ohjeeseen ja kehitystoiveeseen tämän kartan
 * perusteella. Tarkempi sääntö on ensin.
 *
 * Uusi sivu lisätään tähän samassa muutoksessa: testi
 * tests/unit/help-routes.test.ts käy läpi kaikki sivutiedostot ja kaatuu, jos
 * kirjautuneen käyttäjän sivulta puuttuu ohje.
 */
const ROUTES: { pattern: RegExp; slug: string; section?: string }[] = [
  { pattern: /^\/$/, slug: "aloitus" },
  { pattern: /^\/asunnot\/[^/]+\/vuokrasuhde\/uusi/, slug: "vuokrasuhde", section: "Uusi vuokrasuhde" },
  { pattern: /^\/asunnot\/[^/]+\/toistuvat-kulut/, slug: "toistuvat-kulut" },
  { pattern: /^\/asunnot\/[^/]+\/verolaskelma/, slug: "verolaskelma" },
  { pattern: /^\/asunnot\/[^/]+\/kulut/, slug: "kulut" },
  { pattern: /^\/asunnot/, slug: "asunnot" },
  { pattern: /^\/kuitti/, slug: "kulut", section: "Kuitin kuvaaminen" },
  { pattern: /^\/kutsu\//, slug: "liittyminen" },
  { pattern: /^\/vuokrasuhteet\/[^/]+\/sopimus/, slug: "sopimus" },
  { pattern: /^\/vuokrasuhteet\/[^/]+\/osapuolet/, slug: "osapuolet" },
  { pattern: /^\/vuokrasuhteet\/[^/]+\/katselmus/, slug: "katselmus" },
  { pattern: /^\/vuokrasuhteet\/[^/]+\/allekirjoitus/, slug: "allekirjoitus" },
  { pattern: /^\/vuokrasuhteet\/[^/]+\/vuokrat/, slug: "vuokranmaksu" },
  { pattern: /^\/vuokrasuhteet\/[^/]+\/huoltokirja/, slug: "huoltokirja" },
  { pattern: /^\/vuokrasuhteet\/[^/]+\/kulut/, slug: "kulut" },
  { pattern: /^\/vuokrasuhteet\/[^/]+\/paattyminen/, slug: "paattyminen" },
  { pattern: /^\/vuokrasuhteet\/[^/]+\/loppukatselmus/, slug: "loppukatselmus" },
  { pattern: /^\/vuokrasuhteet\/[^/]+\/todistukset/, slug: "todistukset" },
  { pattern: /^\/vuokrasuhteet/, slug: "vuokrasuhde" },
  { pattern: /^\/keskustelut\//, slug: "yhteydenotto", section: "Kysymykset todistuksesta" },
  { pattern: /^\/omat-tiedot/, slug: "omat-tiedot" },
  { pattern: /^\/laskutus/, slug: "laskutus" },
  { pattern: /^\/maksu\//, slug: "laskutus" },
  { pattern: /^\/suosittele/, slug: "suosittelu" },
  { pattern: /^\/kehitystoiveet/, slug: "kehitystoiveet" },
];

/** Sivun ohje: otsikko ja osoite (osioon asti, jos sivu vastaa ohjeen osiota). */
export function helpFor(pathname: string): { slug: string; title: string; href: string } | null {
  const route = ROUTES.find((r) => r.pattern.test(pathname));
  const topic = route ? HELP_TOPICS.find((t) => t.slug === route.slug) : null;
  if (!route || !topic) return null;
  const section =
    route.section && topic.sections.some((s) => s.title === route.section) ? `#${sectionId(route.section)}` : "";
  return { slug: topic.slug, title: topic.title, href: `/ohjeet/${topic.slug}${section}` };
}

export const HELP_ROUTE_SLUGS = ROUTES.map((r) => ({ slug: r.slug, section: r.section ?? null }));
