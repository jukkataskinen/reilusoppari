/**
 * Vuokrasuhteen päättyminen: irtisanominen ja sen aikataulu (CLAUDE.md 5.8).
 *
 * ===========================================================================
 * IRTISANOMISAIKA EI ALA IRTISANOMISPÄIVÄSTÄ
 *
 * Asuinhuoneiston vuokrauksesta annetun lain (481/1995) mukaan irtisanomisaika
 * lasketaan sen **kalenterikuukauden viimeisestä päivästä**, jonka aikana
 * irtisanominen tehtiin. Kuukauden irtisanomisajalla 20. syyskuuta tehty
 * irtisanominen päättää vuokrasuhteen 31. lokakuuta — ei 20. lokakuuta.
 *
 * Tämä on se kohta, jonka ihmiset laskevat väärin, ja siksi sovellus laskee
 * sen heidän puolestaan ja näyttää päivämäärän ennen kuin irtisanominen
 * vahvistetaan.
 *
 * ERI OSAPUOLILLA ON ERI AIKA
 *
 * Laki asettaa vähimmäisajat: vuokralaiselle yksi kuukausi, vuokranantajalle
 * kolme ja yli vuoden kestäneessä vuokrasuhteessa kuusi. Sopimuksessa sovittu
 * aika voi olla pidempi muttei lyhyempi — lyhyempi ehto on vuokralaisen
 * vahingoksi mitätön.
 *
 * Sovellus ei siis käytä sopimuksen lukua sellaisenaan vaan pidempää näistä
 * kahdesta. Jos sopimukseen on kirjattu liian lyhyt aika, se ei lyhennä
 * kenenkään suojaa.
 *
 * SITOUTUMISAIKA ESTÄÄ IRTISANOMISEN
 *
 * Jos sopimuksessa on sovittu, ettei sitä voi irtisanoa ensimmäisten
 * kuukausien aikana (`minimumTermMonths`), irtisanomista ei voi kirjata ennen
 * sitä päivää.
 * ===========================================================================
 */

export type NoticeBy = "landlord" | "tenant";

/** Lain vähimmäisajat kuukausina (AHVL 481/1995). */
export const TENANT_MINIMUM_MONTHS = 1;
export const LANDLORD_MINIMUM_MONTHS = 3;
export const LANDLORD_MINIMUM_MONTHS_AFTER_YEAR = 6;

/** Kuukauden viimeinen päivä, `VVVV-KK-PP`. */
function lastDayOfMonth(year: number, monthIndex: number): string {
  const date = new Date(Date.UTC(year, monthIndex + 1, 0));
  return date.toISOString().slice(0, 10);
}

/**
 * Vuokrasuhteen päättymispäivä irtisanomisesta.
 *
 * Lasketaan irtisanomiskuukauden viimeisestä päivästä eteenpäin annetut
 * kuukaudet. Kuukauden lisäys osuu aina kuun viimeiseen päivään, joten
 * helmikuun lyhyys ei aiheuta poikkeuksia.
 */
export function tenancyEndsAt(noticeDate: string, months: number): string {
  const [year, month] = noticeDate.split("-").map(Number);
  // `month` on 1-pohjainen, JavaScriptin kuukausi 0-pohjainen.
  return lastDayOfMonth(year, month - 1 + months);
}

/**
 * Irtisanomisaika kuukausina tälle osapuolelle.
 *
 * Pidempi sopimuksen ehdosta ja lain vähimmäisajasta. Vuokranantajan aika
 * pitenee kuuteen kuukauteen, kun vuokrasuhde on kestänyt yli vuoden —
 * kesto lasketaan alkupäivästä irtisanomispäivään.
 */
export function noticeMonthsFor(
  by: NoticeBy,
  contractMonths: number,
  startDate: string,
  noticeDate: string,
): number {
  if (by === "tenant") return Math.max(contractMonths, TENANT_MINIMUM_MONTHS);

  const overAYear = monthsBetween(startDate, noticeDate) >= 12;
  const lawMinimum = overAYear ? LANDLORD_MINIMUM_MONTHS_AFTER_YEAR : LANDLORD_MINIMUM_MONTHS;

  return Math.max(contractMonths, lawMinimum);
}

/** Täysiä kuukausia kahden päivän välillä. */
export function monthsBetween(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);

  let months = (toYear - fromYear) * 12 + (toMonth - fromMonth);
  if (toDay < fromDay) months -= 1;
  return months;
}

export interface NoticeState {
  by: NoticeBy;
  /** Vuokrasuhteen tila. Irtisanoa voi vain käynnissä olevan. */
  status: string;
  startDate: string;
  /** Määräaikaisen sopimuksen päättymispäivä, tai `null`. */
  endDate: string | null;
  /** Sopimuksen irtisanomisaika kuukausina. */
  contractNoticeMonths: number;
  /** Sitoutumisaika kuukausina, tai `null`. */
  minimumTermMonths: number | null;
  /** Onko irtisanominen jo kirjattu? */
  noticeGivenAt: string | null;
  /** Irtisanomispäivä, oletuksena tänään. */
  noticeDate: string;
}

export type NoticeDecision =
  | { allowed: true; endsAt: string; months: number }
  | { allowed: false; reason: NoticeBlockReason; message: string };

export type NoticeBlockReason =
  | "not_active"
  | "already_given"
  | "fixed_term"
  | "minimum_term";

/** Voiko irtisanomisen kirjata nyt, ja milloin vuokrasuhde päättyy? */
export function evaluateNotice(state: NoticeState): NoticeDecision {
  if (state.noticeGivenAt) {
    return {
      allowed: false,
      reason: "already_given",
      message: "Irtisanominen on jo kirjattu.",
    };
  }

  if (state.status !== "active") {
    return {
      allowed: false,
      reason: "not_active",
      message:
        state.status === "ending" || state.status === "ended"
          ? "Vuokrasuhde on jo päättymässä."
          : "Vuokrasuhde ei ole vielä käynnissä.",
    };
  }

  if (state.endDate) {
    /*
      Määräaikaista ei voi irtisanoa.

      Se päättyy sovittuna päivänä, ja ennenaikainen päättäminen vaatii joko
      osapuolten sopimuksen tai tuomioistuimen. Kumpikaan ei ole nappi
      sovelluksessa, ja sen teeskenteleminen olisi harhaanjohtavaa.
    */
    return {
      allowed: false,
      reason: "fixed_term",
      message: `Sopimus on määräaikainen ja päättyy ${state.endDate}. Määräaikaista sopimusta ei voi irtisanoa yksipuolisesti — siitä on sovittava yhdessä.`,
    };
  }

  if (state.minimumTermMonths) {
    const earliest = tenancyEndsAt(state.startDate, state.minimumTermMonths);
    // Sitoutumisaika koskee irtisanomispäivää, ei päättymispäivää.
    const earliestNotice = addMonthsToDate(state.startDate, state.minimumTermMonths);

    if (state.noticeDate < earliestNotice) {
      return {
        allowed: false,
        reason: "minimum_term",
        message: `Sopimusta ei voi irtisanoa ennen ${formatDate(earliestNotice)}. Siihen asti se on molempien puolelta sitova (aikaisin päättymispäivä ${formatDate(earliest)}).`,
      };
    }
  }

  const months = noticeMonthsFor(
    state.by,
    state.contractNoticeMonths,
    state.startDate,
    state.noticeDate,
  );

  return { allowed: true, endsAt: tenancyEndsAt(state.noticeDate, months), months };
}

/** Päivä + kuukaudet, kuun loppuun rajattuna. */
function addMonthsToDate(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();

  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${Number(day)}.${Number(month)}.${year}`;
}
