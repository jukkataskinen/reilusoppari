/**
 * Säilytysaika (CLAUDE.md kohta 2).
 *
 * ===========================================================================
 * MITÄ POISTETAAN JA MITÄ EI
 *
 * Vuokrasuhteen tiedot ja kuvat säilytetään kolme vuotta vuokrasuhteen
 * päättymisestä — yleinen vanhentumisaika — ja poistetaan sitten.
 * Todistukset ja tiivisteet jäävät pysyvästi.
 *
 * Ero on olennainen. Katselmuskuva on todiste siitä, missä kunnossa koti oli;
 * kun vaatimusta ei enää voi esittää, kuvaa ei ole syytä säilyttää.
 * Vuokratodistus on toisen ihmisen ansio, jonka hän voi tarvita vielä
 * vuosien päästä — ja tiiviste on ainoa tapa osoittaa jälkikäteen, että
 * hänen hallussaan oleva asiakirja on aito.
 *
 * TÄMÄ MODUULI EI POISTA MITÄÄN
 *
 * Se kertoo, mikä on poistokelpoista ja milloin. Poisto on peruuttamaton, ja
 * sen käyttöönotto on oma päätöksensä, joka Jukan on katsottava — ensimmäinen
 * poistettava rivi syntyy aikaisintaan 2029, joten kiirettä ei ole.
 *
 * Sääntö kirjoitetaan silti nyt: se on lupaus tietosuojaselosteessa, ja
 * lupaus, jonka toteutusta ei ole edes suunniteltu, on tyhjä.
 * ===========================================================================
 */

/** Yleinen vanhentumisaika (velan vanhentumisesta annettu laki 728/2003). */
export const RETENTION_YEARS = 3;

export type RetentionCategory =
  | "photos"
  | "maintenance"
  | "rent"
  | "contract_data"
  | "inspections";

/**
 * Mitä vuokrasuhteesta poistetaan säilytysajan jälkeen.
 *
 * Luettelo on nimenomainen eikä "kaikki paitsi": jos uusi taulu unohtuisi
 * lisätä, nimenomaisesta listasta se jäisi poistamatta — ja säilyisi liian
 * kauan. Päinvastainen virhe poistaisi sen, mitä ei saa poistaa.
 */
export const DELETED: RetentionCategory[] = [
  "photos",
  "maintenance",
  "rent",
  "contract_data",
  "inspections",
];

/**
 * Mitä EI poisteta koskaan.
 *
 * Nämä ovat listana eikä pelkkänä kommenttina, jotta testi voi tarkistaa,
 * etteivät ne ole myös poistettavien listalla. Kahdella listalla oleva
 * kohde tarkoittaisi, että todistus katoaa kolmen vuoden päästä.
 */
export const KEPT_FOREVER = ["certificates", "hashes"] as const;

/**
 * Milloin vuokrasuhteen tiedot ovat poistokelpoisia?
 *
 * `null`, jos vuokrasuhde ei ole päättynyt — silloin mitään ei poisteta,
 * kesti se kuinka kauan tahansa. Päättymätön vuokrasuhde on käytössä oleva
 * vuokrasuhde.
 */
export function deletableFrom(endedAt: string | null): string | null {
  if (!endedAt) return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(endedAt)) return null;

  const [year, month, day] = endedAt.slice(0, 10).split("-").map(Number);

  /*
    Kolme vuotta eteenpäin kalenterista, ei 1095 päivää.

    Karkausvuosi tekisi päivälaskennasta epätarkan, ja epätarkkuus olisi
    käyttäjän tappioksi: tiedot poistuisivat päivää liian aikaisin.
    Karkauspäivänä päättynyt vuokrasuhde siirtyy maaliskuun ensimmäiseen.
  */
  const target = new Date(Date.UTC(year + RETENTION_YEARS, month - 1, day));

  return target.toISOString().slice(0, 10);
}

export interface RetentionState {
  tenancyId: string;
  /** Vuokrasuhteen päättymispäivä, `null` jos kesken. */
  endedAt: string | null;
}

export interface RetentionDecision {
  tenancyId: string;
  /** Onko poistokelpoinen juuri nyt? */
  due: boolean;
  /** Milloin poistokelpoisuus alkaa. `null`, jos vuokrasuhde on kesken. */
  deletableFrom: string | null;
  /** Montako päivää siihen on. Negatiivinen tarkoittaa myöhässä. */
  daysUntil: number | null;
}

/** Yhden vuokrasuhteen tila. Puhdas funktio: ei kysele mitään. */
export function evaluateRetention(
  state: RetentionState,
  now: Date = new Date(),
): RetentionDecision {
  const from = deletableFrom(state.endedAt);

  if (!from) {
    return { tenancyId: state.tenancyId, due: false, deletableFrom: null, daysUntil: null };
  }

  const today = now.toISOString().slice(0, 10);
  const paivaa = Math.round(
    (Date.parse(`${from}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000,
  );

  return {
    tenancyId: state.tenancyId,
    due: today >= from,
    deletableFrom: from,
    daysUntil: paivaa,
  };
}

export interface RetentionReport {
  /** Poistokelpoiset juuri nyt. */
  due: RetentionDecision[];
  /** Poistokelpoisia vuoden sisällä: ennakkovaroitus. */
  soon: RetentionDecision[];
  /** Mitä poistettaisiin. */
  categories: RetentionCategory[];
  /** Mitä jää joka tapauksessa. */
  kept: readonly string[];
}

/** Päivien määrä, jota pidetään "pian". */
const SOON_DAYS = 365;

/**
 * Kuivaharjoitus: mitä poistettaisiin, jos poisto ajettaisiin nyt.
 *
 * Tämä on se, mitä toiminnosta on toistaiseksi käytössä. Raportin voi lukea
 * ennen kuin poisto otetaan käyttöön — ja sen jälkeenkin se on tapa
 * tarkistaa, että sääntö osuu siihen mihin pitää.
 */
export function retentionReport(
  states: RetentionState[],
  now: Date = new Date(),
): RetentionReport {
  const decisions = states.map((state) => evaluateRetention(state, now));

  return {
    due: decisions.filter((decision) => decision.due),
    soon: decisions.filter(
      (decision) =>
        !decision.due && decision.daysUntil !== null && decision.daysUntil <= SOON_DAYS,
    ),
    categories: DELETED,
    kept: KEPT_FOREVER,
  };
}
