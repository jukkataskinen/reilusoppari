/**
 * Vuokranmaksun luokittelu vuokratodistusta varten (Jukan linjaus 2026-09-12).
 *
 * ===========================================================================
 * KOLME LUOKKAA, EI ENEMPÄÄ
 *
 *   1. Maksettu ensimmäisellä tarkistuksella (0–3 pv eräpäivästä)
 *      → "maksettu ajallaan"
 *   2. Maksettu muistutuksen jälkeen (4–10 pv)
 *      → "vähän myöhässä mutta ok"
 *   3. Muut
 *      → "vuokranmaksu viivästynyt"
 *
 * Luokkia on kolme eikä viittä, koska todistuksen lukija tekee niiden
 * perusteella yhden päätöksen: vuokrataanko tälle ihmiselle. Hienojakoisempi
 * asteikko antaisi vaikutelman mittaustarkkuudesta, jota tässä ei ole — tieto
 * on vuokranantajan merkintä siitä, milloin hän näki maksun tilillään.
 *
 * MIKSI RAJAT OVAT NÄISSÄ KOHDISSA
 *
 * Ne ovat samat kuin muistutusketjun rajat (`notifications.ts`). Se ei ole
 * sattumaa: "vähän myöhässä mutta ok" tarkoittaa nimenomaan sitä, että
 * vuokralainen hoiti asian heti kun siitä huomautettiin. Jos rajat erkanisivat
 * ketjusta, luokka menettäisi merkityksensä.
 *
 * MIKÄ TÄSSÄ EI OLE LUOTTOTIETO
 *
 * Tämä ei ole maksuhäiriömerkintä eikä ennuste. Se on kuvaus siitä, mitä
 * tässä vuokrasuhteessa tapahtui, ja se näkyy vain todistuksessa, jonka
 * vuokralainen itse jakaa. Sanasto on sen mukainen: "viivästynyt", ei
 * "laiminlyöty" (CLAUDE.md kohta 2).
 * ===========================================================================
 */

import { FIRST_CHECK_DAYS, SECOND_CHECK_DAYS } from "./notifications";
import type { ConfirmationStatus } from "./confirmation";

export type PaymentClass = "on_time" | "slightly_late" | "delayed";

/** Todistukseen tulostuvat sanamuodot. Yksi paikka, ettei sävy erkane. */
export const PAYMENT_CLASS_LABEL: Record<PaymentClass, string> = {
  on_time: "maksettu ajallaan",
  slightly_late: "vähän myöhässä mutta ok",
  delayed: "vuokranmaksu viivästynyt",
};

export interface PaidPeriod {
  dueDate: string;
  status: ConfirmationStatus | null;
  /** Hetki, jolloin merkintä muuttui maksetuksi. */
  paidAt: string | null;
}

/** Päiviä eräpäivästä maksuhetkeen. Negatiivinen = maksettu etuajassa. */
export function daysLate(dueDate: string, paidAt: string): number {
  const due = new Date(`${dueDate}T00:00:00.000Z`).getTime();
  const paid = new Date(paidAt).getTime();
  return Math.floor((paid - due) / 86_400_000);
}

/**
 * Yhden kauden luokka.
 *
 * Maksamaton tai osittain maksettu kausi on aina "viivästynyt": osittainen
 * maksu on yritys, mutta todistuksessa se ei ole sama asia kuin maksettu.
 * Jos kausi on yhä auki, se on myös viivästynyt — todistus tehdään
 * vuokrasuhteen päättyessä, jolloin avoin kausi on avoin lopullisesti.
 */
export function classifyPayment(period: PaidPeriod): PaymentClass {
  if (period.status !== "paid" || !period.paidAt) return "delayed";

  const late = daysLate(period.dueDate, period.paidAt);

  if (late <= FIRST_CHECK_DAYS) return "on_time";
  if (late <= SECOND_CHECK_DAYS) return "slightly_late";
  return "delayed";
}

export interface RentHistorySummary {
  months: number;
  onTime: number;
  slightlyLate: number;
  delayed: number;
}

/** Koko vuokrasuhteen vuokranmaksu lukuina. */
export function summarizeRentHistory(periods: PaidPeriod[]): RentHistorySummary {
  const summary: RentHistorySummary = {
    months: periods.length,
    onTime: 0,
    slightlyLate: 0,
    delayed: 0,
  };

  for (const period of periods) {
    const klass = classifyPayment(period);
    if (klass === "on_time") summary.onTime += 1;
    else if (klass === "slightly_late") summary.slightlyLate += 1;
    else summary.delayed += 1;
  }

  return summary;
}

/**
 * Yhteenveto lauseena todistukseen.
 *
 * Lause kertoo luvut eikä tulkitse niitä: "34 kuukaudesta 32 ajallaan" on
 * tosiasia, "erinomainen maksaja" on arvio. Arvion antaa ihminen
 * suosituksellaan, ei palvelu laskutoimituksella.
 */
export function summarySentence(summary: RentHistorySummary): string {
  if (summary.months === 0) return "Vuokrakausia ei ehtinyt kertyä.";

  const osat: string[] = [`${summary.onTime} maksettu ajallaan`];
  if (summary.slightlyLate > 0) {
    osat.push(`${summary.slightlyLate} vähän myöhässä mutta ok`);
  }
  if (summary.delayed > 0) {
    osat.push(`${summary.delayed} viivästynyt`);
  }

  const kuukautta = summary.months === 1 ? "kuukaudesta" : "kuukaudesta";
  return `${summary.months} ${kuukautta}: ${osat.join(", ")}.`;
}
