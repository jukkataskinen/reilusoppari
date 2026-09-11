/**
 * Pohjan avain → eSinetin `template_id`.
 *
 * ===========================================================================
 * MIKSI TÄMÄ ON OLEMASSA
 *
 * Reilusoppari tuntee pohjat nimellä (`vuokrasopimus_asuinhuoneisto`), mutta
 * eSinetin `/documents/render` ottaa vastaan UUID:n. eSinetissä ei ole
 * REST-reittiä pohjien listaamiseen, joten yhdistämistä ei voi tehdä ajon
 * aikana — se on annettava konfiguraationa.
 *
 * `npm run templates:push` vie pohjat eSinettiin ja tulostaa tämän muuttujan
 * sisällön. Se on siis generoitua konfiguraatiota, ei käsin ylläpidettävää.
 *
 * Ks. `BLOCKERS.md`: jos eSinettiin lisätään `GET /templates`, tämä tiedosto
 * poistuu ja tunnisteet haetaan ajossa.
 * ===========================================================================
 */

import { EsinettiError } from "./errors";
import { TEMPLATE_KEYS, type TemplateKey } from "./types";

let cached: Partial<Record<TemplateKey, string>> | null = null;

/** Lukee `ESINETTI_TEMPLATE_IDS`-muuttujan (JSON: avain → uuid). Puuttuva muuttuja on tyhjä kartta, ei virhe. */
function loadMap(): Partial<Record<TemplateKey, string>> {
  if (cached) return cached;

  const raw = process.env.ESINETTI_TEMPLATE_IDS?.trim();
  if (!raw) {
    cached = {};
    return cached;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Ei kaadeta sovellusta käynnistyksessä: mock-tila ei tarvitse tätä
    // lainkaan, ja virhe näkyy heti kun pohjaa oikeasti käytetään.
    console.error("[esinetti] ESINETTI_TEMPLATE_IDS ei ole kelvollista JSONia.");
    cached = {};
    return cached;
  }

  const map: Partial<Record<TemplateKey, string>> = {};
  if (parsed && typeof parsed === "object") {
    for (const key of TEMPLATE_KEYS) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) map[key] = value.trim();
    }
  }

  cached = map;
  return cached;
}

/**
 * Pohjan tunniste. Heittää, jos sitä ei ole konfiguroitu — hiljainen
 * `undefined` päätyisi eSinettiin ja tuottaisi epämääräisen 400:n.
 */
export function resolveTemplateId(key: TemplateKey): string {
  const id = loadMap()[key];
  if (!id) {
    throw new EsinettiError(
      "not_configured",
      "Asiakirjapohjaa ei ole viety eSinettiin. Aja: npm run templates:push",
    );
  }
  return id;
}

/** Onko pohja konfiguroitu? Käyttöliittymä voi piilottaa toiminnon sen sijaan, että se epäonnistuisi. */
export function hasTemplateId(key: TemplateKey): boolean {
  return Boolean(loadMap()[key]);
}

/** Testien ja `templates:push`-skriptin käyttöön: pakottaa lukemaan muuttujan uudelleen. */
export function resetTemplateIdCache(): void {
  cached = null;
}
