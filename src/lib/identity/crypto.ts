/**
 * Arkaluonteisten tunnisteiden salaus levylle (AES-256-GCM).
 *
 * ===========================================================================
 * MIKSI SOVELLUSTASOLLA EIKÄ KANNASSA
 *
 * Henkilötunnus on tietokannassa salattuna, ja avain on ympäristömuuttujassa
 * — ei kannassa. Jos joku saa tietokantavedoksen käsiinsä, hän ei saa
 * henkilötunnuksia: vedoksessa on vain `v1:`-alkuisia merkkijonoja.
 *
 * Salaus tehdään sovelluksessa eikä `pgcrypto`-funktioilla, koska SQL-kyselyn
 * parametrit päätyvät kannan hitaiden kyselyjen lokiin. Silloin avain tai
 * selkokielinen henkilötunnus olisi lokitiedostossa, ja koko salauksesta
 * tulisi teatteria.
 *
 * GCM eikä CBC: GCM havaitsee, jos salattua arvoa on muutettu. Ilman sitä
 * rivin voisi vaihtaa toisen rivin salattuun arvoon huomaamatta.
 *
 * MITÄ TÄMÄ EI SUOJAA
 *
 * Ei suojaa siltä, että sovellus itse vuotaa selkokielisen arvon lokiin,
 * virheilmoitukseen tai listanäkymään. Se on `finnish-id.ts`:n peittofunktion
 * ja CI-vahdin (`.github/workflows/ci.yml`) asia.
 * ===========================================================================
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Muoto: `v1:<iv base64url>:<tunniste base64url>:<salattu base64url>`. */
const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super("PERSON_DATA_KEY puuttuu tai on väärän mittainen.");
    this.name = "MissingEncryptionKeyError";
  }
}

/**
 * Avain ympäristöstä.
 *
 * Luetaan joka kutsulla eikä moduulin latautuessa: testit vaihtavat avainta
 * kesken ajon, ja moduulitason välimuisti tekisi siitä hiljaa toimimatonta.
 */
function key(): Buffer {
  const raw = process.env.PERSON_DATA_KEY;
  if (!raw) throw new MissingEncryptionKeyError();

  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== KEY_BYTES) throw new MissingEncryptionKeyError();
  return bytes;
}

/** Onko salausavain käytettävissä? Lomake kertoo puutteesta ennen tallennusta. */
export function hasEncryptionKey(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/**
 * Salaa arvon tallennettavaksi.
 *
 * Satunnainen alkuvektori joka kerta, joten sama henkilötunnus salautuu eri
 * arvoksi eri riveillä. Muuten kannasta näkisi, ketkä kaksi osapuolta ovat
 * sama ihminen — vaikkei henkilötunnusta saisikaan auki.
 */
export function encryptSensitive(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(":");
}

/**
 * Avaa salatun arvon.
 *
 * Heittää, jos arvoa on muutettu tai avain on väärä. Sitä ei saa niellä:
 * hiljainen `null` näyttäisi sopimuksessa samalta kuin "ei annettu", ja
 * asiakirja lähtisi allekirjoitettavaksi ilman osapuolen tunnistetta.
 */
export function decryptSensitive(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Salattu arvo on tuntemattomassa muodossa.");
  }

  const [, iv, tag, body] = parts;
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Uusi avain `.env.local`- ja Vercel-muuttujaan. Käytetään `npm run keys:person`. */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}
