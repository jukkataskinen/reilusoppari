/**
 * Vuokranmaksun herätteet ja muistutukset (Jukan linjaus 2026-09-12).
 *
 * ===========================================================================
 * KETJU
 *
 * Esimerkki: vuokra erääntyy kuun 5. päivä.
 *
 *   5. pv   Eräpäivä. Kukaan ei saa vielä mitään — maksu voi olla matkalla.
 *   8. pv   **Vuokranantajalle:** "Tarkista vuokranmaksutilanne."
 *           Hän merkitsee Kyllä / Ei vielä / Osittain.
 *           → Jos merkintä on Kyllä, vuokralainen saa tiedon ja ketju päättyy.
 *           → Jos vuokraa ei ole kokonaan saatu, vuokralainen saa
 *             **ystävällisen muistutuksen**.
 *  15. pv   **Vuokranantajalle:** toinen tarkistuskierros.
 *           → Jos vuokraa ei vieläkään ole saatu, vuokralainen saa
 *             **napakan viestin** ja ohjeen ottaa yhteyttä vuokranantajaan.
 *
 * MIKSI MUISTUTUS SEURAA MERKINTÄÄ EIKÄ KELLOA
 *
 * Muistutus lähtee vain silloin, kun vuokranantaja on merkinnyt, ettei
 * vuokraa ole saatu. Aikaan perustuva muistutus tavoittaisi myös ne, jotka
 * ovat maksaneet ajallaan — ja perusteeton muistutus maksamattomasta
 * vuokrasta on loukkaus, ei palvelu.
 *
 * Hinta on se, että jos vuokranantaja ei merkitse mitään, vuokralainen ei saa
 * muistutusta. Se on oikea suunta: palvelu ei väitä vuokralaisesta mitään,
 * mitä kukaan ei ole sanonut.
 *
 * MITÄ TÄSTÄ EI SEURAA
 *
 * Ei perintää, ei merkintää mihinkään rekisteriin, ei ilmoitusta kolmannelle.
 * Napakin viesti ohjaa yhteen asiaan: ota yhteyttä vuokranantajaan ja sopikaa.
 *
 * Tämä moduuli on puhdas funktio: se kertoo mitä pitäisi lähettää, ei lähetä
 * mitään. Niin ketjun voi lukea ja testata kokonaan.
 * ===========================================================================
 */

import { formatPeriodMonth, type ConfirmationStatus } from "./confirmation";

/** Päiviä eräpäivästä ensimmäiseen ja toiseen tarkistukseen. */
export const FIRST_CHECK_DAYS = 3;
export const SECOND_CHECK_DAYS = 10;

export type RentNotificationKind =
  | "rent.check"
  | "rent.check.second"
  | "rent.confirmed"
  | "rent.reminder.friendly"
  | "rent.reminder.firm";

export type Recipient = "landlord" | "tenant";

export interface PlannedNotification {
  kind: RentNotificationKind;
  recipient: Recipient;
  periodId: string;
  /** Estää saman viestin lähettämisen kahdesti. */
  dedupeKey: string;
  title: string;
  body: string;
  /** Mihin ilmoituksesta mennään. */
  path: string;
}

export interface PeriodState {
  periodId: string;
  tenancyId: string;
  periodMonth: string;
  dueDate: string;
  amount: number;
  status: ConfirmationStatus | null;
  amountPaid: number | null;
}

/** Päivä `VVVV-KK-PP` + n päivää, samassa muodossa. */
function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function euro(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const [whole, cents] = rounded.toFixed(rounded % 1 === 0 ? 0 : 2).split(".");
  return cents ? `${whole},${cents} €` : `${whole} €`;
}

/** Onko vuokra kokonaan saatu? Osittainen ei ole. */
function fullyPaid(state: PeriodState): boolean {
  return state.status === "paid";
}

/** Onko merkintä siitä, ettei vuokraa ole kokonaan saatu? */
function shortfall(state: PeriodState): boolean {
  return state.status === "not_yet" || state.status === "partial";
}

/** Paljonko on vielä maksamatta, jos osa tuli. */
function remaining(state: PeriodState): number {
  if (state.status !== "partial" || state.amountPaid === null) return state.amount;
  return Math.max(0, state.amount - state.amountPaid);
}

/**
 * Mitä tälle kaudelle pitäisi juuri nyt lähettää?
 *
 * Palauttaa kaikki ketjun viestit, joiden hetki on ohitettu. Kutsuja
 * pudottaa ne, jotka on jo lähetetty (`dedupeKey`), joten myöhässä ajettu
 * cron-ajo ei hukkaa viestejä eikä toista niitä.
 */
export function plannedNotifications(
  state: PeriodState,
  now: Date = new Date(),
): PlannedNotification[] {
  const today = now.toISOString().slice(0, 10);
  const firstCheck = addDays(state.dueDate, FIRST_CHECK_DAYS);
  const secondCheck = addDays(state.dueDate, SECOND_CHECK_DAYS);

  const month = formatPeriodMonth(state.periodMonth);
  const rentPath = `/vuokrasuhteet/${state.tenancyId}/vuokrat`;
  const planned: PlannedNotification[] = [];

  const add = (
    kind: RentNotificationKind,
    recipient: Recipient,
    title: string,
    body: string,
  ) => {
    planned.push({
      kind,
      recipient,
      periodId: state.periodId,
      dedupeKey: `${kind}:${state.periodId}`,
      title,
      body,
      path: rentPath,
    });
  };

  // --- Vuokranantajan tarkistuskierrokset ---------------------------------

  if (today >= firstCheck && state.status === null) {
    add(
      "rent.check",
      "landlord",
      "Tarkista vuokranmaksutilanne",
      `Tuliko ${month} vuokra ${euro(state.amount)}? Merkitse tilanne, niin vuokralainen näkee sen.`,
    );
  }

  if (today >= secondCheck && !fullyPaid(state)) {
    add(
      "rent.check.second",
      "landlord",
      "Vuokranmaksu vielä auki",
      `${month} vuokraa ei ole merkitty kokonaan saaduksi. Tarkista tilanne uudelleen.`,
    );
  }

  // --- Vuokralaisen viestit -----------------------------------------------

  if (fullyPaid(state)) {
    add(
      "rent.confirmed",
      "tenant",
      "Vuokra kuitattu",
      `Vuokranantaja on merkinnyt ${month} vuokran saapuneeksi.`,
    );
    return planned;
  }

  /*
    Muistutukset lähtevät vain merkinnän perusteella.

    `shortfall` tarkoittaa, että vuokranantaja on nimenomaisesti merkinnyt,
    ettei vuokraa ole kokonaan saatu. Ilman merkintää ei muistuteta: kukaan ei
    ole sanonut, että jotain puuttuisi.
  */
  if (!shortfall(state)) return planned;

  const puuttuu = euro(remaining(state));
  const osittain = state.status === "partial";

  if (today >= firstCheck) {
    add(
      "rent.reminder.friendly",
      "tenant",
      "Muistutus vuokrasta",
      osittain
        ? `${month} vuokrasta on vielä maksamatta ${puuttuu}. Jos maksu on jo matkalla, tämä viesti ehti ensin.`
        : `${month} vuokraa ${puuttuu} ei ole vielä näkynyt vuokranantajan tilillä. Jos maksu on jo matkalla, tämä viesti ehti ensin.`,
    );
  }

  if (today >= secondCheck) {
    /*
      Napakka mutta ei uhkaava.

      Viesti ohjaa yhteen asiaan: ota yhteyttä vuokranantajaan ja sopikaa.
      Siihen on syy — asia ratkeaa sopimalla, ja sopiminen on helpompaa
      ennen kuin kumpikaan on ehtinyt pahoittaa mielensä.
    */
    add(
      "rent.reminder.firm",
      "tenant",
      "Vuokra on yhä maksamatta",
      `${month} vuokrasta puuttuu ${puuttuu}, ja eräpäivästä on yli ${SECOND_CHECK_DAYS} päivää. ` +
        "Ota yhteyttä vuokranantajaan ja sopikaa, miten asia hoidetaan. Sopiminen ajoissa on " +
        "kummankin etu.",
    );
  }

  return planned;
}

/**
 * Mitä lähetetään heti, kun vuokranantaja tekee merkinnän?
 *
 * Cron lähettäisi saman seuraavana aamuna, mutta vuorokauden viive tuntuisi
 * siltä, ettei merkinnällä ollut vaikutusta. Sama suunnittelija molemmissa,
 * joten tekstit eivät voi erota toisistaan.
 */
export function notificationsOnConfirm(
  state: PeriodState,
  now: Date = new Date(),
): PlannedNotification[] {
  return plannedNotifications(state, now).filter(
    (notification) => notification.recipient === "tenant",
  );
}
