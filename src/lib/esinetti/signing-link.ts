/**
 * Allekirjoittajan oma allekirjoituslinkki eSinetiltä ("Allekirjoita nyt",
 * Jukan havainto 10.10.2026).
 *
 * ===========================================================================
 * MIKSI TÄMÄ ON OMA MODUULINSA EIKÄ CLIENTISSA
 *
 * eSinetin rajapinnassa ei vielä ole päätepistettä, joka palauttaisi
 * allekirjoittajan linkin: eSinetti tallentaa linkistä vain tiivisteen ja
 * lähettää linkin sähköpostilla (eSinetin BLOCKERS.md, 10.10.2026).
 * Yhteinen client (`vendor/`) synkronoidaan eSinetistä, joten sitä ei
 * muokata täällä. Tämä moduuli kutsuu ehdotettua päätepistettä
 *
 *   POST /rounds/{roundId}/signers/{signerId}/signing-link
 *   → { "data": { "url": "https://app.esinetti.fi/sign/<token>" } }
 *
 * ja on pois päältä, kunnes `ESINETTI_SIGNING_LINKS=1`. Silloin "Allekirjoita
 * nyt" -nappia ei näytetä lainkaan, ja vuokranantaja allekirjoittaa
 * sähköpostin linkistä kuten ennenkin. Nappia, joka ei toimi, ei näytetä.
 *
 * LINKKI EI JÄÄ MIHINKÄÄN
 *
 * Linkki on avain allekirjoittajan paikalle. Sitä ei tallenneta, ei lokiteta
 * eikä laiteta Reilusopparin osoitteeseen. Se haetaan palvelimella vasta,
 * kun vuokranantaja painaa nappia, ja annetaan suoraan selaimelle, joka avaa
 * sen uuteen ikkunaan.
 *
 * VAIN eSINETIN OMA OSOITE KELPAA
 *
 * Avattava osoite tarkistetaan: sen on oltava eSinetin originissa ja polulla
 * `/sign/`. Muuten vika tai väärä vastaus voisi avata käyttäjälle minkä
 * tahansa sivun Reilusopparin nimissä.
 * ===========================================================================
 */

import type { RoundSignerState } from "./types";

/** Onko "Allekirjoita nyt" käytössä? Vaatii oikean eSinetti-yhteyden. */
export function signingLinksEnabled(): boolean {
  return Boolean(process.env.ESINETTI_API_KEY?.trim()) && process.env.ESINETTI_SIGNING_LINKS === "1";
}

/** eSinetin origin rajapinnan osoitteesta, esim. `https://app.esinetti.fi`. */
export function esinettiOrigin(apiUrl = process.env.ESINETTI_API_URL?.trim()): string {
  try {
    return new URL(apiUrl || "https://app.esinetti.fi/api/v1").origin;
  } catch {
    return "https://app.esinetti.fi";
  }
}

/**
 * Upotettava allekirjoitusosoite (`/sign/<token>?embed=1`), tai `null`, jos
 * osoite ei ole eSinetin oma allekirjoitussivu.
 *
 * `embed=1` saa eSinetin sivun ilmoittamaan valmistumisesta avaajaikkunalle
 * (`postMessage` `esinetti:completed`), kun Reilusopparin osoite on eSinetin
 * asetuksissa kohdassa "Sallitut domainit (upotus)".
 */
export function toEmbedSigningUrl(value: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(value, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  if (!/^\/sign\/[^/]+$/.test(url.pathname)) return null;
  url.search = "";
  url.hash = "";
  url.searchParams.set("embed", "1");
  return url.toString();
}

/**
 * Kuka kierroksen allekirjoittajista on vuokranantaja itse?
 *
 * Yhdistetään sähköpostilla, kuten webhookissa: se on ainoa tunniste, joka
 * on sekä eSinetin allekirjoittajalla että osapuolirivillä. Jo allekirjoittanut
 * tai kieltäytynyt ei tarvitse linkkiä.
 */
export function pendingSignerFor(
  signers: RoundSignerState[],
  email: string | null,
): RoundSignerState | null {
  if (!email) return null;
  const wanted = email.trim().toLowerCase();
  return (
    signers.find(
      (signer) =>
        signer.email.trim().toLowerCase() === wanted &&
        signer.status !== "signed" &&
        signer.status !== "declined",
    ) ?? null
  );
}

export type SigningLinkResult =
  | { ok: true; url: string }
  | { ok: false; reason: "unavailable" | "error" };

/**
 * Hakee allekirjoittajan linkin eSinetiltä.
 *
 * 404 tarkoittaa, ettei päätepistettä ole (vielä): `unavailable`. Muut viat
 * ovat `error`. Kumpikaan ei kaada sivua; käyttäjä ohjataan sähköpostin
 * linkkiin.
 */
export async function fetchSigningLink(
  roundId: string,
  signerId: string,
  options: { apiUrl?: string; apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<SigningLinkResult> {
  const apiUrl = (options.apiUrl ?? process.env.ESINETTI_API_URL?.trim() ?? "https://app.esinetti.fi/api/v1")
    .replace(/\/+$/, "") || "https://app.esinetti.fi/api/v1";
  const apiKey = options.apiKey ?? process.env.ESINETTI_API_KEY?.trim() ?? "";
  if (!apiKey) return { ok: false, reason: "unavailable" };

  const path =
    "/rounds/" + encodeURIComponent(roundId) + "/signers/" + encodeURIComponent(signerId) + "/signing-link";

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(apiUrl + path, {
      method: "POST",
      headers: { accept: "application/json", authorization: "Bearer " + apiKey },
      cache: "no-store",
    });
  } catch {
    // Ei lokiteta virheoliota: siinä voi olla osoite ja otsakkeet.
    console.error("[esinetti] allekirjoituslinkin haku: network_error");
    return { ok: false, reason: "error" };
  }

  if (response.status === 404) return { ok: false, reason: "unavailable" };
  if (!response.ok) {
    console.error("[esinetti] allekirjoituslinkin haku: HTTP " + response.status);
    return { ok: false, reason: "error" };
  }

  const json = (await response.json().catch(() => null)) as {
    data?: { url?: unknown; token?: unknown };
  } | null;
  const url = json?.data?.url;
  const token = json?.data?.token;
  if (typeof url === "string" && url) return { ok: true, url };
  if (typeof token === "string" && token) return { ok: true, url: "/sign/" + encodeURIComponent(token) };
  return { ok: false, reason: "error" };
}
