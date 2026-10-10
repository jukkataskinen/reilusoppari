/**
 * Alkukatselmuksen muistutusten lähetys (Jukan päätös 10.10.2026).
 *
 * Suunnitelma on `deadline.ts`:ssä puhtaana funktiona, toimitus
 * `notifications/deliver.ts`:ssä. Tämä moduuli hakee vuokrasuhteet, joiden
 * muistutusikkuna on auki, ja toimittaa viestit osapuolille.
 *
 * Ajetaan samassa päivittäisessä cron-ajossa kuin vuokramuistutukset
 * (`app/api/cron/vuokrat`). Toisto on estetty `dedupe_key`-tunnisteella,
 * joten myöhässä tai kahdesti ajettu ajo ei lähetä samaa viestiä uudelleen.
 */

import { getServiceClient } from "../db/supabase";
import { deliver } from "../notifications/deliver";
import {
  addDays,
  INSPECTION_REMINDER_DAYS,
  INSPECTION_REMINDER_WINDOW_DAYS,
  plannedInspectionReminders,
  type InitialInspectionStatus,
} from "./deadline";

/** Tilat, joissa alkukatselmus on vielä ajankohtainen. */
const ACTIVE_STATUSES = ["draft", "inspection", "signing", "active"];

interface TenancyRow {
  id: string;
  start_date: string;
}

interface PartyRow {
  tenancy_id: string;
  user_id: string | null;
  role: "landlord" | "tenant";
}

export async function dispatchInspectionReminders(now: Date = new Date()): Promise<number> {
  const today = now.toISOString().slice(0, 10);
  // Alkamispäivät, joilla jokin muistutusikkuna voi olla auki.
  const first = Math.min(...INSPECTION_REMINDER_DAYS);
  const last = Math.max(...INSPECTION_REMINDER_DAYS) + INSPECTION_REMINDER_WINDOW_DAYS;
  const from = addDays(today, -last);
  const to = addDays(today, -first);

  const supabase = getServiceClient();

  const { data: tenancies, error } = await supabase
    .from("rs_tenancies")
    .select("id, start_date")
    .in("status", ACTIVE_STATUSES)
    .gte("start_date", from)
    .lte("start_date", to);

  if (error) {
    console.error("[katselmus] vuokrasuhteiden haku epäonnistui:", error.message);
    throw new Error("Vuokrasuhteiden haku epäonnistui.");
  }

  const rows = (tenancies ?? []) as unknown as TenancyRow[];
  if (rows.length === 0) return 0;
  const ids = rows.map((row) => row.id);

  const [{ data: inspections }, { data: parties }] = await Promise.all([
    supabase
      .from("rs_inspections")
      .select("tenancy_id, status")
      .eq("kind", "initial")
      .in("tenancy_id", ids),
    supabase.from("rs_tenancy_parties").select("tenancy_id, user_id, role").in("tenancy_id", ids),
  ]);

  const statusByTenancy = new Map(
    ((inspections ?? []) as Array<{ tenancy_id: string; status: InitialInspectionStatus }>).map(
      (row) => [row.tenancy_id, row.status],
    ),
  );
  const partyRows = (parties ?? []) as unknown as PartyRow[];

  let sent = 0;
  for (const tenancy of rows) {
    const planned = plannedInspectionReminders(
      {
        tenancyId: tenancy.id,
        startDate: tenancy.start_date,
        status: statusByTenancy.get(tenancy.id) ?? null,
      },
      now,
    );

    for (const reminder of planned) {
      // Kutsumatonta tai liittymätöntä ei voi tavoittaa: `user_id` puuttuu.
      const recipients = partyRows.filter(
        (party) => party.tenancy_id === tenancy.id && party.role === reminder.recipient && party.user_id,
      );

      for (const party of recipients) {
        const delivered = await deliver({
          userId: party.user_id!,
          kind: reminder.kind,
          // Vastaanottaja tunnisteeseen: kahden vuokralaisen tapauksessa
          // ensimmäinen ei saa varata tunnistetta toiselta.
          dedupeKey: `${reminder.dedupeKey}:${party.user_id}`,
          title: reminder.title,
          body: reminder.body,
          path: reminder.path,
        });
        if (delivered) sent += 1;
      }
    }
  }

  return sent;
}
