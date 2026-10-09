/**
 * Lomakkeiden selainpuolen apuvälineet (ks. `components/Form.tsx`).
 *
 * Tässä tiedostossa ei saa olla zodia eikä palvelinkoodia: se päätyy
 * selainpakettiin jokaisella lomakesivulla.
 */

/**
 * Kentät, joihin virheen jälkeen siirrytään, tässä järjestyksessä.
 *
 * Ensin kenttä, jonka palvelin merkitsi virheelliseksi (`aria-invalid`), ja
 * vasta sitten yleinen virheilmoitus. Kenttään siirtyminen on hyödyllisempää:
 * käyttäjä voi korjata saman tien eikä joudu etsimään, mitä viesti tarkoitti.
 */
export const PROBLEM_SELECTORS = ['[aria-invalid="true"]', '[role="alert"]'] as const;

/** Selaimen `ValidityState`, vain ne kohdat joita käytetään. Testattava ilman DOMia. */
export type ValidityLike = Partial<
  Pick<
    ValidityState,
    | "valueMissing"
    | "typeMismatch"
    | "patternMismatch"
    | "rangeUnderflow"
    | "rangeOverflow"
    | "stepMismatch"
    | "tooLong"
    | "tooShort"
    | "badInput"
  >
>;

export interface FieldLike {
  type?: string;
  min?: string;
  max?: string;
  /**
   * Kentän oma viesti muulle kuin puuttuvalle arvolle, `data-virhe`-
   * attribuutista. Esim. postinumerolle "Postinumero on viisi numeroa"
   * yleisen "Tarkista muoto" sijaan.
   */
  dataset?: { virhe?: string };
}

/**
 * Suomenkielinen viesti selaimen omaan "täytä tämä kenttä" -kuplaan.
 *
 * Ilman tätä viesti tulee selaimen kielellä, usein englanniksi, ja on eri
 * sanoin kuin palvelimen virheet. Palauttaa `null`, kun kenttä on kunnossa.
 */
export function validityMessage(validity: ValidityLike, field: FieldLike = {}): string | null {
  if (validity.valueMissing) {
    if (field.type === "checkbox") return "Rastita tämä ruutu jatkaaksesi.";
    if (field.type === "radio") return "Valitse yksi vaihtoehdoista.";
    if (field.type === "file") return "Valitse tiedosto.";
    return "Tämä tieto puuttuu.";
  }
  const anyProblem =
    validity.badInput ||
    validity.typeMismatch ||
    validity.rangeUnderflow ||
    validity.rangeOverflow ||
    validity.stepMismatch ||
    validity.tooLong ||
    validity.tooShort ||
    validity.patternMismatch;
  if (anyProblem && field.dataset?.virhe) return field.dataset.virhe;
  if (validity.badInput) {
    return field.type === "date" ? "Tarkista päivämäärä." : "Kirjoita luku numeroina.";
  }
  if (validity.typeMismatch) {
    if (field.type === "email") return "Tarkista sähköpostiosoite.";
    if (field.type === "url") return "Tarkista osoite.";
    return "Tarkista muoto.";
  }
  if (validity.rangeUnderflow) {
    return field.min ? `Pienin sallittu arvo on ${field.min}.` : "Arvo on liian pieni.";
  }
  if (validity.rangeOverflow) {
    return field.max ? `Suurin sallittu arvo on ${field.max}.` : "Arvo on liian suuri.";
  }
  if (validity.stepMismatch) return "Kirjoita kokonaisluku.";
  if (validity.tooLong) return "Teksti on liian pitkä.";
  if (validity.tooShort) return "Teksti on liian lyhyt.";
  if (validity.patternMismatch) return "Tarkista muoto.";
  return null;
}

/** Ne lähetysnapit, joiden arvo kuuluu lomakedataan (kuten selaimen omassa lähetyksessä). */
export function submitterEntry(
  submitter: { name?: string; value?: string } | null | undefined,
): [string, string] | null {
  if (!submitter || !submitter.name) return null;
  return [submitter.name, submitter.value ?? ""];
}
