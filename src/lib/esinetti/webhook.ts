/**
 * Webhookien tarkistus ja jäsennys on yhteisessä clientissa (`vendor/`,
 * npm run esinetti:sync-client). Tässä on vain Reilusopparin oma osuus:
 * ulkoisen viitteen muoto, jolla tapahtuma yhdistetään vuokrasuhteeseen.
 */
export * from "./vendor/webhook";

/**
 * `externalRef` → vuokrasuhteen id ja vaihe.
 *
 * Muoto on Reilusopparin oma (`buildExternalRef`), ja se on ainoa side
 * eSinetin kierroksen ja vuokrasuhteen välillä webhookissa. Tuntematon muoto
 * palauttaa `null` — silloin tapahtuma ohitetaan sen sijaan, että arvattaisiin.
 */
export function parseExternalRef(
  externalRef: string | null,
): { tenancyId: string; phase: "alku" | "loppu" } | null {
  if (!externalRef) return null;
  const match = /^tenancy:([0-9a-f-]{36}):(alku|loppu)$/.exec(externalRef);
  if (!match) return null;
  return { tenancyId: match[1], phase: match[2] as "alku" | "loppu" };
}

export function buildExternalRef(tenancyId: string, phase: "alku" | "loppu"): string {
  return "tenancy:" + tenancyId + ":" + phase;
}
