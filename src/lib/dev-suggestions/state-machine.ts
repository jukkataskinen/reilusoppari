/**
 * Kehitysehdotusten tilakone (docs/kehitysehdotukset.md, Jukan päätös
 * 8.10.2026). Yhteinen käytäntö kaikkiin Jukan sovelluksiin — monorepon
 * sovellukset käyttävät pakettia `@adepta/kehitysehdotukset`, Reilusoppari
 * kopioi logiikan tähän samalla määrittelyllä.
 *
 * Puhdas funktio, jotta siirtymät voi testata kattavasti eikä sovelluksen
 * (palvelintoiminnot, webhook) tarvitse koskaan päätellä sallittuja tiloja
 * itse. "Sovellus ei saa ohittaa niitä": tämän tiedoston ulkopuolella ei
 * missään saa olla `status = "jotain"`-tyyppistä suoraa kirjoitusta.
 */

export const DEV_SUGGESTION_STATUSES = [
  "uusi",
  "hyvaksytty",
  "tyon_alla",
  "testattavana",
  "valmis",
  "hylatty",
] as const;

export type DevSuggestionStatus = (typeof DEV_SUGGESTION_STATUSES)[number];

export const DEV_SUGGESTION_EVENTS = [
  "hyvaksy",
  "hylkaa",
  "pr_avattu",
  "pr_yhdistetty",
  "toimii",
  "tarvitsee_muutoksen",
] as const;

export type DevSuggestionEvent = (typeof DEV_SUGGESTION_EVENTS)[number];

/**
 * Sallitut siirtymät tapahtumittain. Puuttuva avain tarkoittaa, että
 * tapahtuma ei tee mitään kyseisessä tilassa.
 */
const TRANSITIONS: Record<DevSuggestionEvent, Partial<Record<DevSuggestionStatus, DevSuggestionStatus>>> = {
  // Käsittelijä hyväksyy tuoreen ehdotuksen: GitHub-issue luodaan.
  hyvaksy: { uusi: "hyvaksytty" },
  // Hylkäys on mahdollinen miltä tahansa avoimelta tilalta, mutta ei
  // enää lopputilasta (valmis/hylatty) — ne eivät palaa takaisin.
  hylkaa: {
    uusi: "hylatty",
    hyvaksytty: "hylatty",
    tyon_alla: "hylatty",
    testattavana: "hylatty",
  },
  // PR avattu issueen, joka viittaa ehdotukseen. Myös testattavana-tilasta,
  // koska webhookin tapahtumat eivät aina tule järjestyksessä: jos tekijä
  // avaa uuden korjaus-PR:n ennen kuin "tarvitsee muutoksen" on ehditty
  // kirjata, siirtymä on silti oikea.
  pr_avattu: { hyvaksytty: "tyon_alla", testattavana: "tyon_alla" },
  // PR yhdistetty: issue sulkeutuu, ja käsittelijä pääsee testaamaan.
  pr_yhdistetty: { tyon_alla: "testattavana" },
  // Käsittelijä vahvistaa testauksen jälkeen, että korjaus toimii.
  toimii: { testattavana: "valmis" },
  // Käsittelijä avaa issuen uudelleen: takaisin työn alle.
  tarvitsee_muutoksen: { testattavana: "tyon_alla" },
};

/** Lopputila: ei enää siirtymiä kummastakaan tapahtumasta. */
export function isFinalStatus(status: DevSuggestionStatus): boolean {
  return status === "valmis" || status === "hylatty";
}

/**
 * Seuraava tila, tai `null` jos tapahtuma ei ole sallittu nykyisestä
 * tilasta. `null` ei ole virhe: kutsuja päättää, onko kyseessä jo tehty
 * siirtymä (ohitetaan hiljaa, esim. webhookin toisto) tai todella virheellinen
 * pyyntö (näytetään käsittelijälle).
 */
export function nextStatus(current: DevSuggestionStatus, event: DevSuggestionEvent): DevSuggestionStatus | null {
  return TRANSITIONS[event][current] ?? null;
}

export function isDevSuggestionStatus(value: unknown): value is DevSuggestionStatus {
  return typeof value === "string" && (DEV_SUGGESTION_STATUSES as readonly string[]).includes(value);
}
