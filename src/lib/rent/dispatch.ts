/**
 * Vuokramuistutusten lähetys: suunnitelmasta toimitukseen (CLAUDE.md 5.5).
 *
 * ===========================================================================
 * YKSI POLKU, KAKSI KUTSUJAA
 *
 * Sekä päivittäinen cron-ajo että kuittauksen tallennus kutsuvat tätä. Ilman
 * yhteistä polkua tekstit ja säännöt erkanisivat, ja vuokralainen saisi eri
 * viestin sen mukaan, kumpi sattui ehtimään ensin.
 *
 * Suunnittelu on `notifications.ts`:ssä puhtaana funktiona, toimitus
 * `notifications/deliver.ts`:ssä. Tämä moduuli on väli: se hakee tilan,
 * kysyy suunnitelman ja toimittaa sen oikeille ihmisille.
 * ===========================================================================
 */

import { getServiceClient } from "../db/supabase";
import { deliver } from "../notifications/deliver";
import { plannedNotifications, type PeriodState } from "./notifications";
import type { ConfirmationStatus } from "./confirmation";

interface PartyRow {
  user_id: string | null;
  role: "landlord" | "tenant";
}

/** Osapuolten käyttäjätunnisteet rooleittain. Kutsumattomia ei voi tavoittaa. */
async function recipients(
  tenancyId: string,
): Promise<{ landlord: string[]; tenant: string[] }> {
  const { data } = await getServiceClient()
    .from("rs_tenancy_parties")
    .select("user_id, role")
    .eq("tenancy_id", tenancyId);

  const rows = (data ?? []) as unknown as PartyRow[];

  return {
    landlord: rows.filter((r) => r.role === "landlord" && r.user_id).map((r) => r.user_id!),
    tenant: rows.filter((r) => r.role === "tenant" && r.user_id).map((r) => r.user_id!),
  };
}

/**
 * Lähettää yhden kauden ajankohtaiset viestit.
 *
 * Palauttaa lähetettyjen määrän. Jo lähetetyt eivät laske: `deliver` torjuu
 * ne `dedupe_key`-tunnisteella.
 */
export async function dispatchForPeriod(
  state: PeriodState,
  now: Date = new Date(),
  only?: "landlord" | "tenant",
): Promise<number> {
  const planned = plannedNotifications(state, now).filter(
    (notification) => !only || notification.recipient === only,
  );

  if (planned.length === 0) return 0;

  const people = await recipients(state.tenancyId);
  let sent = 0;

  for (const notification of planned) {
    const userIds = people[notification.recipient];

    for (const userId of userIds) {
      /*
        Tunniste sisältää vastaanottajan.

        Kahden vuokralaisen tapauksessa sama viesti menee molemmille, ja
        ilman käyttäjää tunnisteessa toinen jäisi ilman: ensimmäinen insertti
        varaisi tunnisteen ja toinen torjuttaisiin toistona.
      */
      const delivered = await deliver({
        userId,
        kind: notification.kind,
        dedupeKey: `${notification.dedupeKey}:${userId}`,
        title: notification.title,
        body: notification.body,
        path: notification.path,
      });

      if (delivered) sent += 1;
    }
  }

  return sent;
}

interface PeriodRow {
  id: string;
  tenancy_id: string;
  period_month: string;
  due_date: string;
  amount: string | number;
}

interface ConfirmationRow {
  rent_period_id: string;
  status: ConfirmationStatus;
  amount_paid: string | number | null;
}

/**
 * Yhden kauden tila suunnittelijalle.
 *
 * `null`, jos kautta ei ole. Kutsuja ei saa arvata tilaa: väärällä tilalla
 * lähtisi väärä viesti.
 */
export async function loadPeriodState(periodId: string): Promise<PeriodState | null> {
  const supabase = getServiceClient();

  const { data: period } = await supabase
    .from("rs_rent_periods")
    .select("id, tenancy_id, period_month, due_date, amount")
    .eq("id", periodId)
    .maybeSingle();

  if (!period) return null;
  const row = period as unknown as PeriodRow;

  const { data: confirmation } = await supabase
    .from("rs_rent_confirmations")
    .select("rent_period_id, status, amount_paid")
    .eq("rent_period_id", periodId)
    .maybeSingle();

  const confirmed = confirmation as unknown as ConfirmationRow | null;

  return {
    periodId: row.id,
    tenancyId: row.tenancy_id,
    periodMonth: row.period_month,
    dueDate: row.due_date,
    amount: Number(row.amount),
    status: confirmed?.status ?? null,
    amountPaid: confirmed?.amount_paid === null || confirmed?.amount_paid === undefined
      ? null
      : Number(confirmed.amount_paid),
  };
}

/**
 * Päivittäinen ajo: kaikki kaudet, joiden ketju voi olla kesken.
 *
 * ===========================================================================
 * RAJAUS ON AJASSA, EI TILASSA
 *
 * Haetaan kaudet, joiden eräpäivä on 3–60 päivää sitten. Alaraja on ketjun
 * ensimmäinen tarkistus; yläraja estää sen, että vuosien takaiset kaudet
 * käytäisiin läpi joka aamu.
 *
 * 60 päivää riittää: ketjun viimeinen viesti lähtee 10. päivänä, ja loput 50
 * ovat varaa sille, että cron on ollut alhaalla. Jos se on ollut alhaalla
 * kauemmin, viestit jäävät lähettämättä — ja se on parempi kuin kahden
 * kuukauden takaisten muistutusten ryöppy.
 * ===========================================================================
 */
export async function dispatchDueReminders(now: Date = new Date()): Promise<number> {
  const from = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await getServiceClient()
    .from("rs_rent_periods")
    .select("id, tenancy_id, period_month, due_date, amount")
    .gte("due_date", from)
    .lte("due_date", to);

  if (error) {
    console.error("[vuokrat] kausien haku epäonnistui:", error.message);
    throw new Error("Kausien haku epäonnistui.");
  }

  let sent = 0;
  for (const row of (data ?? []) as unknown as PeriodRow[]) {
    const state = await loadPeriodState(row.id);
    if (state) sent += await dispatchForPeriod(state, now);
  }

  return sent;
}
