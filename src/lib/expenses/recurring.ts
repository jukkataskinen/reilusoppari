/**
 * Toistuvat kuukausikulut (CLAUDE.md 5.7, Jukan linjaus 2026-09-12).
 *
 * ===========================================================================
 * VASTIKE SYÖTETÄÄN KERRAN, EI KAKSITOISTA KERTAA VUODESSA
 *
 * Hoitovastike on sama summa joka kuukausi. Sen kirjaaminen kuukausittain
 * olisi kaksitoista käsin tehtyä kirjausta vuodessa asuntoa kohden — ja
 * jokainen niistä voi jäädä tekemättä. Unohtunut kirjaus ei näy laskelmassa
 * mitenkään: se vain tekee vuosikuluista liian pienet.
 *
 * Siksi toistuva kulu on KAUSI eikä tapahtuma: kuukausisumma ja se väli,
 * jolla se on voimassa. Vuosikulu lasketaan siitä.
 *
 * MUUTOS ON UUSI KAUSI, EI VANHAN MUOKKAUS
 *
 * Kun vastike nousee maaliskuussa, tammi–helmikuu on maksettu vanhalla
 * summalla. Jos summaa muutettaisiin paikalleen, koko vuosi laskettaisiin
 * uudella — ja vuosikulu olisi väärä juuri siltä vuodelta, jolta se
 * ilmoitetaan.
 *
 * Siksi muutos päättää vanhan kauden ja aloittaa uuden. Kaudet muodostavat
 * sarjan (`seriesId`), jonka sisällä ne eivät saa mennä päällekkäin.
 *
 * KUUKAUSI ON PIENIN YKSIKKÖ
 *
 * Kausi alkaa ja päättyy kuukauden tarkkuudella, ei päivän. Vastike on
 * kuukausimaksu: se joko maksetaan siltä kuukaudelta tai ei. Päivätarkkuus
 * pakottaisi keksimään säännön sille, lasketaanko 15. päivä alkanut kuukausi
 * — ja mikä tahansa sääntö olisi väärä jossain tapauksessa.
 *
 * KULU ON ASUNNON, EI VUOKRASUHTEEN
 *
 * Vastike juoksee myös tyhjän kuukauden yli, ja vuokralainen voi vaihtua
 * kesken vuoden. Siksi toistuvalla kululla ei ole vuokrasuhdetta lainkaan —
 * vain asunto.
 * ===========================================================================
 */

import type { ExpenseCategory } from "./categories";

/** Kuukausi muodossa `YYYY-MM`. */
export type Month = string;

export interface RecurringPeriod {
  id: string;
  /** Sarja, johon kausi kuuluu. Saman sarjan kaudet ovat saman kulun historiaa. */
  seriesId: string;
  category: ExpenseCategory;
  description: string | null;
  /** Euroa kuukaudessa. */
  monthlyAmount: number;
  startsMonth: Month;
  /** `null` = voimassa toistaiseksi. */
  endsMonth: Month | null;
}

/** `YYYY-MM` järjestysluvuksi, jotta kuukausia voi vertailla ja vähentää. */
export function monthIndex(month: Month): number {
  const [year, value] = month.split("-").map(Number);
  return year * 12 + (value - 1);
}

/** Järjestysluku takaisin `YYYY-MM`-muotoon. */
export function monthFromIndex(index: number): Month {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Onko merkkijono kelvollinen kuukausi? */
export function isMonth(value: string): value is Month {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5));
  return month >= 1 && month <= 12;
}

/** Edellinen kuukausi. Muutos päättää vanhan kauden tähän. */
export function previousMonth(month: Month): Month {
  return monthFromIndex(monthIndex(month) - 1);
}

/**
 * Montako annetun vuoden kuukautta kausi kattaa?
 *
 * Leikkaus vuoden kanssa: kausi voi alkaa edellisenä vuonna ja jatkua
 * seuraavaan, ja silloin tälle vuodelle kuuluu vain se osa, joka osuu
 * tähän vuoteen.
 */
export function monthsInYear(period: RecurringPeriod, year: number): number {
  const yearStart = monthIndex(`${year}-01`);
  const yearEnd = monthIndex(`${year}-12`);

  const start = Math.max(monthIndex(period.startsMonth), yearStart);
  const end = Math.min(
    period.endsMonth ? monthIndex(period.endsMonth) : yearEnd,
    yearEnd,
  );

  // Kausi ei osu tähän vuoteen lainkaan.
  if (end < start) return 0;

  return end - start + 1;
}

/** Kauden osuus vuoden kuluista euroina. */
export function amountInYear(period: RecurringPeriod, year: number): number {
  return round(monthsInYear(period, year) * period.monthlyAmount);
}

export interface RecurringYearTotal {
  category: ExpenseCategory;
  months: number;
  total: number;
}

/**
 * Vuoden toistuvat kulut luokittain.
 *
 * Kuukaudet lasketaan yhteen luokan sisällä. Se on tarkoitus: asunnossa voi
 * olla sekä hoitovastike että autopaikan vastike, ja molemmat ovat
 * hoitovastiketta. "24 kuukautta" kertoo silloin kahdesta rinnakkaisesta
 * kulusta eikä kahdesta vuodesta — laskelmassa lukee sekä kuukaudet että
 * summa, joten luku on tulkittavissa.
 */
export function recurringTotals(
  periods: RecurringPeriod[],
  year: number,
): Map<ExpenseCategory, RecurringYearTotal> {
  const totals = new Map<ExpenseCategory, RecurringYearTotal>();

  for (const period of periods) {
    const months = monthsInYear(period, year);
    if (months === 0) continue;

    const existing = totals.get(period.category) ?? {
      category: period.category,
      months: 0,
      total: 0,
    };

    existing.months += months;
    existing.total = round(existing.total + months * period.monthlyAmount);
    totals.set(period.category, existing);
  }

  return totals;
}

export type ChangeResult =
  | { ok: true; closeAt: Month | null; startAt: Month }
  | { ok: false; message: string };

/**
 * Mitä tapahtuu, kun summa muuttuu kuukaudesta `from` alkaen?
 *
 * Palauttaa, mihin kuukauteen voimassa oleva kausi päätetään ja mistä uusi
 * alkaa. Ei kirjoita mitään — kirjoitus on datakerroksessa, ja tämä on se
 * osa, joka on testattava ilman tietokantaa.
 */
export function planChange(
  series: RecurringPeriod[],
  from: Month,
  now: Month,
): ChangeResult {
  if (!isMonth(from)) return { ok: false, message: "Tarkista kuukausi." };

  const sorted = [...series].sort(
    (a, b) => monthIndex(a.startsMonth) - monthIndex(b.startsMonth),
  );

  const latest = sorted.at(-1);
  if (!latest) return { ok: false, message: "Kulua ei löytynyt." };

  /*
    Muutos ei voi alkaa ennen viimeisen kauden alkua.

    Takautuva muutos keskelle sarjaa tarkoittaisi, että jo lasketut vuodet
    muuttuvat — ja jos laskelma on ehditty sinetöidä, sinetöity ja näytöllä
    näkyvä laskelma eroaisivat toisistaan ilman että kumpikaan on väärin.
    Vanhan kauden summan voi korjata erikseen; se on eri asia kuin muutos.
  */
  if (monthIndex(from) <= monthIndex(latest.startsMonth)) {
    return {
      ok: false,
      message:
        "Muutos alkaa aikaisintaan nykyistä summaa seuraavasta kuukaudesta. " +
        "Jos haluat korjata vanhan summan, muokkaa sitä kautta.",
    };
  }

  if (latest.endsMonth && monthIndex(from) <= monthIndex(latest.endsMonth)) {
    return {
      ok: false,
      message: "Tälle kuukaudelle on jo kirjattu summa.",
    };
  }

  /*
    Tulevaisuuteen saa kirjata.

    Taloyhtiö ilmoittaa vastikkeen korotuksesta etukäteen, ja se kannattaa
    kirjata silloin kun kirje on kädessä. Raja on kaksitoista kuukautta
    eteenpäin: sitä kauempana oleva kirjaus on todennäköisemmin kirjoitusvirhe
    vuosiluvussa kuin aito ennakkotieto.
  */
  if (monthIndex(from) - monthIndex(now) > 12) {
    return {
      ok: false,
      message: "Muutos on yli vuoden päässä. Tarkista kuukausi.",
    };
  }

  return { ok: true, closeAt: previousMonth(from), startAt: from };
}

/**
 * Menevätkö sarjan kaudet päällekkäin tai jääkö väliin aukkoja?
 *
 * Palauttaa ongelmat selväkielisinä. Tätä ei kutsuta joka näytöllä vaan
 * testeissä ja kirjoituksen yhteydessä: päällekkäinen kausi laskisi saman
 * kuukauden kahdesti, ja aukko jättäisi kuukauden laskematta. Kumpikaan ei
 * näy laskelmassa virheenä — vain väärinä lukuina.
 */
export function seriesProblems(series: RecurringPeriod[]): string[] {
  const sorted = [...series].sort(
    (a, b) => monthIndex(a.startsMonth) - monthIndex(b.startsMonth),
  );

  const problems: string[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const period = sorted[i];

    if (period.endsMonth && monthIndex(period.endsMonth) < monthIndex(period.startsMonth)) {
      problems.push(`Kausi ${period.startsMonth} päättyy ennen kuin alkaa.`);
      continue;
    }

    const next = sorted[i + 1];
    if (!next) continue;

    if (!period.endsMonth) {
      problems.push(`Kausi ${period.startsMonth} on avoin, vaikka sen jälkeen on uusi kausi.`);
      continue;
    }

    const gap = monthIndex(next.startsMonth) - monthIndex(period.endsMonth);

    if (gap <= 0) problems.push(`Kaudet ${period.startsMonth} ja ${next.startsMonth} menevät päällekkäin.`);
    else if (gap > 1) problems.push(`Kausien ${period.endsMonth} ja ${next.startsMonth} väliin jää kuukausia.`);
  }

  return problems;
}

/** Sentin tarkkuus. Liukuluvut eivät saa tuottaa 2939.9999999999995:tä. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Kuluva kuukausi `YYYY-MM`. */
export function currentMonth(now: Date = new Date()): Month {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** `3/2026` — suomalainen tapa kirjoittaa kuukausi. */
export function formatMonth(month: Month): string {
  const [year, value] = month.split("-");
  return `${Number(value)}/${year}`;
}
