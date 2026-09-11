/**
 * Kutsulinkin tunnisteet (CLAUDE.md 5.2).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: vain palvelinkoodi. Tunniste luodaan vuokrasuhdetta
 *    luotaessa ja tarkistetaan kutsulinkkiä avattaessa.
 * 2. Henkilötieto: kutsuttavan sähköposti on rivillä, ei tunnisteessa.
 * 3. Syöte: tunniste on aina hex-merkkijono; muoto tarkistetaan ennen
 *    tietokantakyselyä, jotta kysely ei koskaan näe mielivaltaista syötettä.
 * 4. Toisto ja arvaus: 256 bitin satunnaisuus. Vertailu on vakioaikainen,
 *    jottei oikeaa tunnistetta voi hakea merkki kerrallaan ajastusta
 *    mittaamalla.
 * 5. **Selkokielistä tunnistetta ei tallenneta koskaan.** Tietokantaan menee
 *    vain HMAC — samoin kuin eSinetin allekirjoituslinkeissä. Jos tietokanta
 *    vuotaa, vuotaneilla tiedoilla ei pääse kenenkään vuokrasuhteeseen.
 * 6. Epäonnistuminen: vanhentunut ja väärä tunniste antavat saman vastauksen.
 * 7. Lokitus: tunnistetta ei lokiteta missään muodossa.
 * ===========================================================================
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Kutsun voimassaoloaika.
 *
 * 30 päivää: vuokrasuhde luodaan usein hyvissä ajoin ennen alkupäivää, ja
 * lyhyempi aika tarkoittaisi, että kutsu vanhenee ennen kuin vuokralainen
 * ehtii avata sen. Vanhentuneen tilalle voi lähettää uuden.
 */
export const INVITE_TTL_DAYS = 30;

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

function secret(): string {
  const value = process.env.INVITE_TOKEN_SECRET?.trim();
  if (!value) {
    throw new Error("Ympäristömuuttuja INVITE_TOKEN_SECRET puuttuu. Ks. .env.example.");
  }
  return value;
}

export interface Invite {
  /** Linkkiin menevä tunniste. Näytetään kerran, ei tallenneta. */
  token: string;
  /** Tietokantaan tallennettava tiiviste. */
  tokenHash: string;
  expiresAt: string;
}

/** Luo uuden kutsun. Selkokielinen tunniste palautetaan vain tässä. */
export function createInvite(now: Date = new Date()): Invite {
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const expires = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  return {
    token,
    tokenHash: hashInviteToken(token),
    expiresAt: expires.toISOString(),
  };
}

/**
 * Tunnisteen tiiviste.
 *
 * HMAC eikä pelkkä SHA-256: ilman salaisuutta hyökkääjä, joka saa
 * tietokannan, voisi laskea valmiiksi tiivisteitä ja verrata. Salaisuus on
 * palvelimella eikä tietokannassa.
 */
export function hashInviteToken(token: string): string {
  return createHmac("sha256", secret()).update(token, "utf8").digest("hex");
}

/** Onko tunniste oikean muotoinen? Tarkistetaan ennen tietokantakyselyä. */
export function isInviteTokenShaped(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

/** Vakioaikainen vertailu. Älä käytä `===`. */
export function inviteTokenMatches(token: string, storedHash: string): boolean {
  if (!isInviteTokenShaped(token)) return false;

  const expected = Buffer.from(hashInviteToken(token), "hex");
  let given: Buffer;
  try {
    given = Buffer.from(storedHash, "hex");
  } catch {
    return false;
  }

  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/** Onko kutsu vanhentunut? */
export function isInviteExpired(expiresAt: string | null, now: Date = new Date()): boolean {
  if (!expiresAt) return true;
  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) return true;
  return expires.getTime() <= now.getTime();
}

/** Kutsulinkin osoite. */
export function inviteUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/kutsu/${token}`;
}
