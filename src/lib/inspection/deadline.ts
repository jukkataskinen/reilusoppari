/**
 * Alkukatselmuksen määräaika ja muistutukset (Jukan päätös 10.10.2026).
 *
 * ===========================================================================
 * MIKSI MÄÄRÄAIKA ON OLEMASSA
 *
 * Sopimus allekirjoitetaan heti, kun tiedot ovat valmiit, ja asunto kuvataan
 * vasta muuton yhteydessä. Silloin katselmus voi jäädä tekemättä, koska
 * mikään ei enää odota sitä. Neljäntoista päivän raja vuokrasuhteen
 * alkamisesta antaa muuttoon aikaa mutta pitää kuvat lähellä alkuhetkeä:
 * kuukausia myöhemmin otettu kuva ei enää kerro, millainen asunto oli
 * vuokralaisen tullessa.
 *
 * MUISTUTUS SEITSEMÄN JA NELJÄNTOISTA PÄIVÄN KOHDALLA
 *
 * Kumpikin osapuoli saa muistutuksen, jos katselmusta ei ole lukittu.
 * Lukittu katselmus ei enää tarvitse kuvia, joten muistutus lakkaa siihen.
 * Ikkuna on seitsemän päivää: myöhässä ajettu ajo ehtii vielä lähettää,
 * mutta kuukausien takaisia muistutuksia ei lähde, jos ajo on ollut pois.
 *
 * Tämä on puhdas funktio. Lähetys on `reminders.ts`:ssä.
 * ===========================================================================
 */

export const INSPECTION_DEADLINE_DAYS = 14;
export const INSPECTION_REMINDER_DAYS = [7, 14] as const;
/** Kuinka monta päivää muistutuksen hetken jälkeen se vielä lähetetään. */
export const INSPECTION_REMINDER_WINDOW_DAYS = 7;

export type InitialInspectionStatus = "open" | "locked" | "signed";

/** Päivä `VVVV-KK-PP` + n päivää, samassa muodossa. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Viimeinen päivä, jona alkukatselmus pitäisi olla lukittu. */
export function inspectionDeadline(startDate: string): string {
  return addDays(startDate, INSPECTION_DEADLINE_DAYS);
}

/** `VVVV-KK-PP` → `24.10.2026`. */
export function formatFinnishDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${Number(day)}.${Number(month)}.${year}`;
}

export type InspectionDeadlineView =
  | { phase: "signed" }
  | { phase: "locked" }
  | { phase: "open"; deadline: string | null; overdue: boolean };

/**
 * Mitä vuokrasuhteen sivulla kerrotaan alkukatselmuksesta.
 *
 * `status` on `null`, jos katselmusta ei ole vielä avattu kertaakaan. Se on
 * sama asia kuin avoin katselmus: kuvia ei ole, eikä mitään ole lukittu.
 */
export function inspectionDeadlineView(
  startDate: string | null,
  status: InitialInspectionStatus | null,
  today: string,
): InspectionDeadlineView {
  if (status === "signed") return { phase: "signed" };
  if (status === "locked") return { phase: "locked" };

  if (!startDate) return { phase: "open", deadline: null, overdue: false };
  const deadline = inspectionDeadline(startDate);
  return { phase: "open", deadline, overdue: today > deadline };
}

export interface InspectionReminderState {
  tenancyId: string;
  startDate: string;
  status: InitialInspectionStatus | null;
}

export type InspectionReminderKind = "inspection.deadline.7" | "inspection.deadline.14";

export interface PlannedInspectionReminder {
  kind: InspectionReminderKind;
  recipient: "landlord" | "tenant";
  /** Estää saman viestin lähettämisen kahdesti. Vastaanottaja lisätään lähetettäessä. */
  dedupeKey: string;
  title: string;
  body: string;
  path: string;
}

/**
 * Mitä tälle vuokrasuhteelle pitäisi juuri nyt lähettää?
 *
 * Vuokranantajalle ja vuokralaiselle eri teksti, koska heillä on eri tehtävä:
 * vuokralainen merkitsee olevansa valmis, vuokranantaja lukitsee.
 */
export function plannedInspectionReminders(
  state: InspectionReminderState,
  now: Date = new Date(),
): PlannedInspectionReminder[] {
  if (state.status === "locked" || state.status === "signed") return [];

  const today = now.toISOString().slice(0, 10);
  const deadline = formatFinnishDate(inspectionDeadline(state.startDate));
  const path = `/vuokrasuhteet/${state.tenancyId}/katselmus`;
  const planned: PlannedInspectionReminder[] = [];

  for (const days of INSPECTION_REMINDER_DAYS) {
    const from = addDays(state.startDate, days);
    const until = addDays(from, INSPECTION_REMINDER_WINDOW_DAYS);
    if (today < from || today >= until) continue;

    const kind: InspectionReminderKind = days === 7 ? "inspection.deadline.7" : "inspection.deadline.14";
    const title = days === 7 ? "Alkukatselmus odottaa" : "Alkukatselmuksen määräaika on nyt";

    planned.push({
      kind,
      recipient: "landlord",
      dedupeKey: `${kind}:${state.tenancyId}`,
      title,
      body:
        `Alkukatselmus pitäisi tehdä viimeistään ${deadline}. ` +
        "Kuvatkaa asunto, ja lukitse katselmus, kun vuokralainen on valmis.",
      path,
    });
    planned.push({
      kind,
      recipient: "tenant",
      dedupeKey: `${kind}:${state.tenancyId}`,
      title,
      body:
        `Alkukatselmus pitäisi tehdä viimeistään ${deadline}. ` +
        "Kuvaa asunnosta kohdat, joiden kunnon haluat muistaa, ja valitse Olen valmis.",
      path,
    });
  }

  return planned;
}
