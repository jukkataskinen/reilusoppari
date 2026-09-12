/**
 * Todistuksen jakolinkit (CLAUDE.md 5.8, kohta 6).
 *
 * ===========================================================================
 * LINKKI NÄYTTÄÄ TODISTUKSEN, EI MITÄÄN MUUTA
 *
 * Jakolinkin avaaja näkee todistuksen ja vain sen: ei asunnon katselmuskuvia,
 * ei huoltokirjaa, ei toisen osapuolen yhteystietoja. Todistus on se, mitä
 * vuokralainen haluaa näyttää — kaikki muu on vuokrasuhteen sisäistä.
 *
 * TUNNISTE TALLENNETAAN VAIN TIIVISTEENÄ
 *
 * Sama periaate kuin kutsulinkeissä: tietokannassa on HMAC-tiiviste, ei
 * tunniste. Tietokantavedoksesta ei siis pääse kenenkään todistukseen.
 *
 * KATSELUKERRAT NÄKYVÄT OMISTAJALLE
 *
 * Jokainen avaus kasvattaa laskuria, ja omistaja näkee sen. Hän on jakanut
 * linkin jollekin ja saa tietää, käytettiinkö sitä — ja jos käyttökertoja on
 * enemmän kuin hän jakoi linkkejä, se on tieto, jonka perusteella linkin voi
 * mitätöidä.
 * ===========================================================================
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SHARE_TTL_DAYS = 30;

export interface ShareToken {
  token: string;
  tokenHash: string;
  expiresAt: string;
}

/** Salaisuus ympäristöstä. Puuttuva salaisuus on virhe, ei oletusarvo. */
function secret(): string {
  const value = process.env.SHARE_TOKEN_SECRET?.trim();
  if (!value) throw new Error("SHARE_TOKEN_SECRET puuttuu.");
  return value;
}

/** Uusi jakolinkin tunniste. 256 bittiä satunnaista. */
export function createShareToken(now: Date = new Date()): ShareToken {
  const token = randomBytes(32).toString("hex");

  return {
    token,
    tokenHash: hashShareToken(token),
    expiresAt: new Date(now.getTime() + SHARE_TTL_DAYS * 86_400_000).toISOString(),
  };
}

export function hashShareToken(token: string): string {
  return createHmac("sha256", secret()).update(token, "utf8").digest("hex");
}

/** Muoto tarkistetaan ennen kyselyä, jottei mielivaltainen syöte päädy kantaan. */
export function isShareTokenShaped(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token);
}

/**
 * Vakioaikainen vertailu.
 *
 * Tavallinen `===` paljastaisi ajastusta mittaamalla, kuinka monta merkkiä
 * arvauksesta osui oikein.
 */
export function shareTokenMatches(token: string, storedHash: string): boolean {
  if (!isShareTokenShaped(token)) return false;

  const expected = Buffer.from(hashShareToken(token), "hex");
  const given = Buffer.from(storedHash, "hex");
  if (expected.length !== given.length) return false;

  return timingSafeEqual(expected, given);
}

export function isShareExpired(
  expiresAt: string,
  revokedAt: string | null,
  now: Date = new Date(),
): boolean {
  if (revokedAt) return true;
  return new Date(expiresAt).getTime() <= now.getTime();
}

/** Jaettava osoite. */
export function shareUrl(baseUrl: string, token: string): string {
  return new URL(`/todistus/${token}`, baseUrl).toString();
}
