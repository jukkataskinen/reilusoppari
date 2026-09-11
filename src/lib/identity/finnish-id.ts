/**
 * Henkilötunnuksen ja y-tunnuksen tarkistus ja peittäminen.
 *
 * ===========================================================================
 * TARKISTUSMERKKI KANNATTAA LASKEA
 *
 * Sopimus allekirjoitetaan kerran. Jos henkilötunnuksessa on näppäilyvirhe,
 * se jää sinetöityyn asiakirjaan pysyvästi — ja juuri siinä tilanteessa, jossa
 * tunnistetta tarvitaan (perintä, käräjäoikeus), se on väärä. Tarkistusmerkin
 * laskeminen ottaa kiinni valtaosan näppäilyvirheistä ennen kuin ne ehtivät
 * asiakirjaan.
 *
 * Tarkistus EI kerro, onko tunnus olemassa tai kenelle se kuuluu. Sen tekee
 * vasta eSinetin vahva tunnistautuminen allekirjoituksen yhteydessä.
 * ===========================================================================
 */

/** Vuosisatamerkit. 2000-luvun kirjaimet laajennettiin vuonna 2023 (VRK). */
const CENTURIES: Record<string, number> = {
  "+": 1800,
  "-": 1900,
  Y: 1900,
  X: 1900,
  W: 1900,
  V: 1900,
  U: 1900,
  A: 2000,
  B: 2000,
  C: 2000,
  D: 2000,
  E: 2000,
  F: 2000,
};

/** Tarkistusmerkin aakkosto. I, O, Q ja Z puuttuvat: ne sekoittuisivat numeroihin. */
const CHECK_CHARACTERS = "0123456789ABCDEFHJKLMNPRSTUVWXY";

/** Isoiksi kirjaimiksi, välit pois. Muuta ei siivota — muoto tarkistetaan erikseen. */
export function normalizeHenkilotunnus(value: string): string {
  return value.replace(/\s/g, "").toUpperCase();
}

/**
 * Kelpaako henkilötunnus?
 *
 * Muoto, oikea päivämäärä ja tarkistusmerkki. Päivämäärä tarkistetaan
 * kalenterista eikä vain lukualueesta, jotta 31.02. ei mene läpi.
 */
export function isValidHenkilotunnus(value: string): boolean {
  const id = normalizeHenkilotunnus(value);
  const match = /^(\d{2})(\d{2})(\d{2})([+\-A-FUVWXY])(\d{3})([0-9A-Y])$/.exec(id);
  if (!match) return false;

  const [, dd, mm, yy, sign, individual, check] = match;
  const century = CENTURIES[sign];
  if (century === undefined) return false;

  const year = century + Number(yy);
  const date = new Date(Date.UTC(year, Number(mm) - 1, Number(dd)));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== Number(mm) - 1 ||
    date.getUTCDate() !== Number(dd)
  ) {
    return false;
  }

  // Yksilönumero 002–899. 900-sarja on väliaikaisia tunnuksia, joita ei
  // käytetä sopimuksissa.
  const serial = Number(individual);
  if (serial < 2 || serial > 899) return false;

  const expected = CHECK_CHARACTERS[Number(`${dd}${mm}${yy}${individual}`) % 31];
  return check === expected;
}

/** Syntymäaika henkilötunnuksesta (`VVVV-KK-PP`), tai `null` jos tunnus ei kelpaa. */
export function birthdateFromHenkilotunnus(value: string): string | null {
  if (!isValidHenkilotunnus(value)) return null;

  const id = normalizeHenkilotunnus(value);
  const year = CENTURIES[id[6]] + Number(id.slice(4, 6));
  return `${year}-${id.slice(2, 4)}-${id.slice(0, 2)}`;
}

/**
 * Peitetty muoto käyttöliittymään: `010190-***X`.
 *
 * Syntymäaika jää näkyviin, loppuosa ei. Näin vuokranantaja näkee tallentaneensa
 * oikean henkilön tunnuksen, mutta olan yli katsova ei saa sitä kokonaan.
 * Asiakirjaan menee kokonainen tunnus — se on koko sen tarkoitus.
 */
export function maskHenkilotunnus(value: string): string {
  const id = normalizeHenkilotunnus(value);
  if (id.length !== 11) return "•••";
  return `${id.slice(0, 7)}***${id.slice(10)}`;
}

/** Muotoillaan `1234567-8`. Hyväksyy myös ilman väliviivaa kirjoitetun. */
export function normalizeYTunnus(value: string): string {
  const digits = value.replace(/[\s-]/g, "");
  return digits.length === 8 ? `${digits.slice(0, 7)}-${digits[7]}` : value.trim();
}

/** Y-tunnuksen tarkistusnumero (PRH:n painokertoimet). */
export function isValidYTunnus(value: string): boolean {
  const match = /^(\d{7})-(\d)$/.exec(normalizeYTunnus(value));
  if (!match) return false;

  const [, body, check] = match;
  const weights = [7, 9, 10, 5, 8, 4, 2];
  const sum = weights.reduce((total, weight, index) => total + weight * Number(body[index]), 0);
  const remainder = sum % 11;

  // Jäännös 1 ei tuota kelvollista tarkistusnumeroa, joten sellaista
  // y-tunnusta ei ole olemassa.
  if (remainder === 1) return false;
  return Number(check) === (remainder === 0 ? 0 : 11 - remainder);
}
