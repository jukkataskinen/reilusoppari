/**
 * eSinetin upotuksen valmistumisviesti (`postMessage` `esinetti:completed`).
 *
 * Oma tiedostonsa, koska tätä käytetään selaimessa: `signing-link.ts` lukee
 * palvelimen ympäristömuuttujia, eikä sitä tuoda selainpakettiin.
 */

/**
 * Onko viesti eSinetin ilmoitus valmiista allekirjoituksesta?
 *
 * Hyväksytään vain eSinetin oma origin, kuten eSinetin upotusskriptissä.
 * Muuten mikä tahansa sivu voisi väittää allekirjoituksen valmistuneen.
 */
export function isCompletionMessage(eventOrigin: string, data: unknown, expectedOrigin: string): boolean {
  if (eventOrigin !== expectedOrigin) return false;
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "esinetti:completed"
  );
}
