/**
 * Kuitilta luetun vastauksen jäsennys ja tarkistus.
 *
 * ===========================================================================
 * MALLI LUKEE TOSIASIOITA, IHMINEN TEKEE PÄÄTÖKSET
 *
 * Kuitilta luetaan summa, päivä, alv ja myyjä. **Kululuokkaa ei kysytä
 * mallilta lainkaan.** Raja vuosikorjauksen ja perusparannuksen välillä on
 * verotuksellinen arvio — juuri se, josta `content/tax-guidance.fi.ts`
 * varoittaa — ja väärin esitäytetty luokka siirtäisi summan hiljaa väärään
 * osioon laskelmassa. Tyhjä luokka pakottaa valitsemaan; väärä ei.
 *
 * EPÄVARMA KENTTÄ JÄTETÄÄN TYHJÄKSI
 *
 * Jäsennys hylkää arvon, joka ei ole järkevä: negatiivinen summa,
 * tulevaisuuden päivä, alv joka on suurempi kuin summa. Tyhjä kenttä on
 * käyttäjälle rehellinen — hän täyttää sen itse. Väärä luku, jota ei
 * huomata, valuu verolaskelmaan asti.
 *
 * TÄMÄ MODUULI ON PUHDAS
 *
 * Ei API-kutsuja eikä tietokantaa. Juuri jäsennys on se osa, joka menee
 * rikki hiljaa, kun mallin vastaus muuttuu hieman — ja siksi se on
 * testattava ilman että mitään kutsutaan.
 * ===========================================================================
 */

export interface ReceiptReading {
  /** Loppusumma euroina. `null`, jos sitä ei saatu luettua luotettavasti. */
  total: number | null;
  /** Arvonlisäveron määrä euroina, jos kuitissa on se eriteltynä. */
  vat: number | null;
  /** Ostopäivä `YYYY-MM-DD`. */
  date: string | null;
  /** Myyjän nimi sellaisena kuin se kuitissa lukee. */
  merchant: string | null;
}

/** Tyhjä luenta: kaikki kentät täytetään käsin. */
export const EMPTY_READING: ReceiptReading = {
  total: null,
  vat: null,
  date: null,
  merchant: null,
};

/**
 * Kehote mallille.
 *
 * Pyytää JSONin ilman selityksiä ja sanoo erikseen, että epävarma kenttä
 * jätetään tyhjäksi. Ilman sitä malli arvaa mieluummin kuin jättää tyhjän —
 * ja arvaus näyttää lomakkeella samalta kuin luettu arvo.
 */
export const RECEIPT_PROMPT =
  "Lue tämä kuitti. Vastaa VAIN JSON ilman selityksiä: " +
  '{"summa":numero_tai_null,"alv":numero_tai_null,' +
  '"paivamaara":"YYYY-MM-DD_tai_null","myyja":"teksti_tai_null"}. ' +
  "summa on kuitin loppusumma euroina, verollisena. " +
  "alv on arvonlisäveron määrä euroina, jos se on kuitissa eriteltynä. " +
  "myyja on liikkeen nimi. " +
  "Jos jokin kohta on epäselvä tai et näe sitä, palauta sille null. " +
  "Älä arvaa: tyhjä on parempi kuin väärä.";

/**
 * Poimii JSONin mallin vastauksesta.
 *
 * Koodiaidat riisutaan: malli lisää ne toisinaan, vaikka niitä ei pyydetä.
 * `null`, jos vastaus ei ole JSONia — se on virhe, jonka kutsuja käsittelee,
 * eikä poikkeus, joka kaataisi kuvauksen.
 */
export function extractJson(text: string): unknown {
  const cleaned = String(text).replace(/```json|```/g, "").trim();
  if (!cleaned) return null;

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/** Suurin summa, joka hyväksytään. Tätä isompi kuitti on lukuvirhe. */
const MAX_TOTAL = 100_000;

/**
 * Luku, jos se on järkevä euromäärä.
 *
 * Hylkää nollan ja negatiivisen: kumpikaan ei ole kulu. Hylkää myös
 * absurdin suuren, koska yleisin lukuvirhe on desimaalipilkun katoaminen —
 * `12,90` luettuna `1290`:ksi on juuri se virhe, jota ei huomaa lomakkeella.
 */
function euros(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value.replace(",", ".")) : value;

  if (typeof number !== "number" || !Number.isFinite(number)) return null;
  if (number <= 0 || number > MAX_TOTAL) return null;

  return Math.round(number * 100) / 100;
}

/**
 * Päivä, jos se on kelvollinen eikä tulevaisuudessa.
 *
 * Tulevaisuuden päivä on aina lukuvirhe — kuittia ei ole vielä olemassa.
 * Se on myös se virhe, joka rikkoisi verolaskelman: väärälle vuodelle
 * kirjattu kulu ei näy siinä laskelmassa, johon se kuuluu.
 */
function date(value: unknown, now: Date): string | null {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;

  // Päivä, joka ei ole olemassa (31.2.), normalisoituu eri päiväksi.
  if (parsed.toISOString().slice(0, 10) !== value) return null;

  if (value > now.toISOString().slice(0, 10)) return null;

  // Sovellusta ei ole ollut olemassa ennen tätä; sitä vanhempi on lukuvirhe.
  if (value < "2020-01-01") return null;

  return value;
}

/** Myyjän nimi siivottuna. Tyhjä tai absurdin pitkä hylätään. */
function merchant(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed === "" || trimmed.toLowerCase() === "null") return null;

  return trimmed.slice(0, 100);
}

/**
 * Mallin vastaus tarkistetuksi luennaksi.
 *
 * Ei koskaan heitä: rikkinäinen vastaus tuottaa tyhjän luennan, ja käyttäjä
 * täyttää kentät itse. Kuvaaminen ei saa kaatua siihen, ettei lukeminen
 * onnistunut — kuitti on silti tallessa.
 */
export function parseReceipt(raw: unknown, now: Date = new Date()): ReceiptReading {
  if (typeof raw !== "object" || raw === null) return EMPTY_READING;

  const body = raw as Record<string, unknown>;

  const total = euros(body.summa);
  const vat = euros(body.alv);

  return {
    total,
    /*
      Alv hylätään, jos se on suurempi kuin summa.

      Se on mahdoton ja tarkoittaa, että toinen luvuista on luettu väärin.
      Kumpaa ei tiedetä, joten epäluotettava jätetään pois ja summa jää —
      summa on se, jota laskelma tarvitsee.
    */
    vat: vat !== null && total !== null && vat > total ? null : vat,
    date: date(body.paivamaara, now),
    merchant: merchant(body.myyja),
  };
}

/** Onko luennasta mitään hyötyä? Tyhjää ei kannata näyttää luettuna. */
export function hasContent(reading: ReceiptReading): boolean {
  return (
    reading.total !== null ||
    reading.date !== null ||
    reading.merchant !== null ||
    reading.vat !== null
  );
}
