/**
 * Vuokrakausien generointi (CLAUDE.md 5.4, testattava kohta 7).
 *
 * ===========================================================================
 * ERÄPÄIVÄ 31. EI OLE OLEMASSA HELMIKUUSSA
 *
 * Eräpäivä tallennetaan päivänumerona (1–31), mutta kaikissa kuukausissa ei
 * ole sitä päivää. Sääntö on: **eräpäivä siirtyy kuukauden viimeiseen
 * päivään, ei seuraavan kuukauden puolelle.** Vuokra erääntyy siis
 * helmikuussa 28. tai 29., ei maaliskuun 3.
 *
 * Muu tulkinta olisi vuokralaiselle epäedullinen: hän maksaisi myöhässä
 * ilman että on tehnyt mitään väärin, ja kuittaus näyttäisi siltä.
 * ===========================================================================
 */

export interface RentPeriod {
  /** Kuukauden ensimmäinen päivä, `YYYY-MM-01`. Yksilöi kauden. */
  periodMonth: string;
  /** Eräpäivä `YYYY-MM-DD`, rajattu kuukauden pituuteen. */
  dueDate: string;
  amount: number;
}

export interface RentPeriodInput {
  /** Vuokrasuhteen alkupäivä `YYYY-MM-DD`. */
  startDate: string;
  /** Määräaikaisen päättymispäivä, tai `null` jos toistaiseksi voimassa. */
  endDate: string | null;
  /** Eräpäivä kuukauden päivänä, 1–31. */
  dueDay: number;
  amount: number;
  /**
   * Montako kuukautta eteenpäin toistaiseksi voimassa olevalle sopimukselle
   * generoidaan. Cron jatkaa myöhemmin; tämä on vain se, mitä luodaan heti.
   */
  horizonMonths?: number;
}

const DEFAULT_HORIZON_MONTHS = 12;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Kuukauden viimeinen päivä. Karkausvuodet tulevat `Date`:lta oikein. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Eräpäivä kuukaudelle.
 *
 * Rajaus kuukauden pituuteen tapahtuu tässä eikä tietokannassa, koska
 * tietokanta tallentaa vain päivänumeron eikä tiedä mistä kuukaudesta on
 * kyse.
 */
export function dueDateFor(year: number, month: number, dueDay: number): string {
  const day = Math.min(dueDay, daysInMonth(year, month));
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Vuokrakaudet vuokrasuhteelle.
 *
 * ===========================================================================
 * AVOIN KYSYMYS: VAJAAN ENSIMMÄISEN KUUKAUDEN VUOKRA
 *
 * Jos vuokrasuhde alkaa kesken kuukauden, tämä generoi ensimmäiselle
 * kuukaudelle TÄYDEN vuokran. Käytännössä osa vuokranantajista suhteuttaa
 * sen päivien mukaan.
 *
 * Suhteuttaminen ei ole tässä, koska se vaatii päätöksen laskutavasta
 * (päivät/30 vai päivät kuukaudessa) eikä ohjeessa ole sellaista. Kirjattu
 * `DECISIONS.md`:hen kysymykseksi. Kunnes se ratkaistaan, vuokranantaja voi
 * sopia vajaasta kuukaudesta erikseen sopimuksen muissa ehdoissa.
 * ===========================================================================
 */
export function generateRentPeriods(input: RentPeriodInput): RentPeriod[] {
  const start = new Date(input.startDate + "T00:00:00.000Z");
  if (Number.isNaN(start.getTime())) {
    throw new Error("Alkupäivä ei kelpaa.");
  }
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31) {
    throw new Error("Eräpäivän on oltava 1–31.");
  }

  const end = input.endDate ? new Date(input.endDate + "T00:00:00.000Z") : null;
  if (end && end < start) {
    throw new Error("Päättymispäivä on ennen alkupäivää.");
  }

  const horizon = input.horizonMonths ?? DEFAULT_HORIZON_MONTHS;
  const periods: RentPeriod[] = [];

  let year = start.getUTCFullYear();
  let month = start.getUTCMonth() + 1;

  for (let index = 0; ; index += 1) {
    const periodMonth = `${year}-${pad(month)}-01`;

    if (end) {
      // Määräaikainen: viimeinen kausi on se kuukausi, jossa sopimus päättyy.
      const endYear = end.getUTCFullYear();
      const endMonth = end.getUTCMonth() + 1;
      if (year > endYear || (year === endYear && month > endMonth)) break;
    } else if (index >= horizon) {
      break;
    }

    periods.push({
      periodMonth,
      dueDate: dueDateFor(year, month, input.dueDay),
      amount: input.amount,
    });

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }

    // Turvaraja: ilman tätä virheellinen päättymispäivä voisi tuottaa
    // miljoona riviä tietokantaan.
    if (periods.length >= 600) break;
  }

  return periods;
}
