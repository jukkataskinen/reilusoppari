/**
 * Vuokran kuittauksen säännöt (CLAUDE.md 5.5).
 *
 * ===========================================================================
 * TÄMÄ EI OLE MAKSUJÄRJESTELMÄ
 *
 * Reilusoppari ei näe tilitapahtumia eikä peri mitään. Kuittaus on
 * vuokranantajan oma merkintä siitä, tuliko vuokra. Se on siis mielipide
 * tosiasiasta, ei tosiasia — ja juuri siksi vuokralainen näkee sen ja voi
 * kommentoida.
 *
 * Sanamuodot on valittu sen mukaan. "Ei vielä" eikä "maksamatta": ensimmäinen
 * kuvaa hetkeä, jälkimmäinen ihmistä. Kuittaus voi olla väärässä — maksu on
 * voinut olla matkalla — ja sanamuodon on kestettävä se.
 *
 * MUUTTAMISEN AIKARAJA
 *
 * Kuittausta voi muuttaa 30 päivän ajan. Sen jälkeen ei, koska vuokratodistus
 * rakentuu näiden merkintöjen varaan: jos vuosien takaisia kuittauksia voisi
 * muuttaa, todistus kertoisi siitä, mitä vuokranantaja nyt ajattelee, eikä
 * siitä mitä silloin tapahtui.
 *
 * Jokainen muutos kirjataan lokiin. Merkintä, joka on muuttunut kolmesti,
 * kertoo lukijalle jotain sellaista, mitä lopputila yksin ei kerro.
 * ===========================================================================
 */

export type ConfirmationStatus = "paid" | "not_yet" | "partial";

export const EDIT_WINDOW_DAYS = 30;

/** Kuittauksen sanamuodot käyttöliittymään. Yksi paikka, ettei sävy erkane. */
export const STATUS_LABEL: Record<ConfirmationStatus, string> = {
  paid: "Kyllä",
  not_yet: "Ei vielä",
  partial: "Osittain",
};

/** Sama vuokralaiselle näytettävänä lauseena. */
export const STATUS_SENTENCE: Record<ConfirmationStatus, string> = {
  paid: "Vuokranantaja on merkinnyt vuokran saapuneeksi.",
  not_yet: "Vuokranantaja ei ole vielä nähnyt vuokraa tilillään.",
  partial: "Vuokranantaja on merkinnyt osan vuokrasta saapuneeksi.",
};

export interface Confirmation {
  status: ConfirmationStatus;
  amountPaid: number | null;
  confirmedAt: string;
}

/**
 * Voiko kuittausta vielä muuttaa?
 *
 * Aikaraja lasketaan ensimmäisestä kuittauksesta eikä viimeisimmästä
 * muutoksesta. Muuten merkintää voisi pitää auki loputtomiin muuttamalla
 * sitä kerran kuussa.
 */
export function canEditConfirmation(confirmedAt: string, now: Date = new Date()): boolean {
  const elapsed = now.getTime() - new Date(confirmedAt).getTime();
  return elapsed < EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/** Milloin muuttaminen sulkeutuu. Käyttöliittymä näyttää tämän. */
export function editClosesAt(confirmedAt: string): Date {
  return new Date(new Date(confirmedAt).getTime() + EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Osittaisella maksulla on oltava summa, muilla ei.
 *
 * Ilman summaa "osittain" ei kerro mitään: sekä 10 € että 840 € 850 eurosta
 * olisivat "osittain", eivätkä ne tarkoita samaa asiaa.
 */
export function validateConfirmation(
  status: ConfirmationStatus,
  amountPaid: number | null,
  rentAmount: number,
): { ok: true; amountPaid: number | null } | { ok: false; message: string } {
  if (status !== "partial") return { ok: true, amountPaid: null };

  if (amountPaid === null || Number.isNaN(amountPaid)) {
    return { ok: false, message: "Kerro, paljonko vuokrasta tuli." };
  }
  if (amountPaid <= 0) {
    return { ok: false, message: "Jos mitään ei tullut, merkintä on “Ei vielä”." };
  }
  if (amountPaid >= rentAmount) {
    return { ok: false, message: "Jos koko vuokra tuli, merkintä on “Kyllä”." };
  }

  return { ok: true, amountPaid };
}

export interface PeriodWithConfirmation {
  /** Kauden eräpäivä, `VVVV-KK-PP`. */
  dueDate: string;
  confirmation: Confirmation | null;
}

/**
 * Näytetäänkö ohje maksuvaikeuksista?
 *
 * Kaksi peräkkäistä "Ei vielä" (CLAUDE.md 5.5). Silloin näytetään ohje ja
 * linkki neuvontaan — **eikä muuta**. Ei muistutuksia, ei perintää, ei
 * merkintää mihinkään rekisteriin. Palvelu ei ole perintätoimisto eikä
 * luottotietoyhtiö, eikä siitä saa tulla sellaista vahingossa.
 *
 * Osittainen maksu ei laske: se on yritys maksaa, ja sen kohteleminen
 * maksamattomuutena olisi väärin sitä kohtaan, joka yritti.
 */
export function shouldOfferGuidance(periods: PeriodWithConfirmation[]): boolean {
  const past = [...periods]
    .filter((period) => period.confirmation !== null)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  let streak = 0;
  for (const period of past) {
    if (period.confirmation!.status === "not_yet") {
      streak += 1;
      if (streak >= 2) return true;
    } else {
      streak = 0;
    }
  }

  return false;
}

/** Kuukausi luettavana tekstinä: `2026-09-01` → `syyskuu 2026`. */
const MONTHS = [
  "tammikuu",
  "helmikuu",
  "maaliskuu",
  "huhtikuu",
  "toukokuu",
  "kesäkuu",
  "heinäkuu",
  "elokuu",
  "syyskuu",
  "lokakuu",
  "marraskuu",
  "joulukuu",
];

export function formatPeriodMonth(periodMonth: string): string {
  const [year, month] = periodMonth.split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

/**
 * Onko kausi jo erääntynyt?
 *
 * Eräpäivä itse ei ole myöhässä: maksu voi tulla perille päivän kuluessa.
 * Kysymys esitetään vuokranantajalle eräpäivänä, mutta "myöhässä" alkaa
 * vasta sitä seuraavana päivänä.
 */
export function isOverdue(dueDate: string, now: Date = new Date()): boolean {
  const today = now.toISOString().slice(0, 10);
  return dueDate < today;
}
