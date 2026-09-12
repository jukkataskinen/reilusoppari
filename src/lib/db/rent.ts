/**
 * Vuokrakaudet ja kuittaukset (CLAUDE.md 5.5).
 *
 * ===========================================================================
 * KUITTAUS ON VUOKRANANTAJAN MERKINTÄ, KOMMENTTI VUOKRALAISEN
 *
 * Vain vuokranantaja kuittaa: hän on se, joka näkee tilinsä. Vain vuokralainen
 * kommentoi: kommentti on vastine, ei toinen kuittaus. Kummallakaan ei ole
 * pääsyä toisen merkintään — muuten historia ei kertoisi kumman näkemys se on.
 *
 * MUUTOSHISTORIA KIRJATAAN
 *
 * Kuittausta voi muuttaa 30 päivän ajan, ja jokainen muutos menee
 * `rs_audit_log`-tauluun. Merkintä, joka on muuttunut kolmesti, kertoo
 * lukijalle jotain sellaista, mitä lopputila yksin ei kerro.
 * ===========================================================================
 */

import { getServiceClient } from "./supabase";
import { requireTenancyParty } from "./access";
import { getTenancy } from "./tenancies";
import {
  canEditConfirmation,
  validateConfirmation,
  type Confirmation,
  type ConfirmationStatus,
} from "../rent/confirmation";

export interface RentPeriodRow {
  id: string;
  periodMonth: string;
  dueDate: string;
  amount: number;
  confirmation: (Confirmation & { confirmedBy: string }) | null;
  tenantComment: string | null;
  tenantCommentedAt: string | null;
  /** Voiko kuittausta vielä muuttaa? Lasketaan palvelimella. */
  editable: boolean;
}

interface PeriodRow {
  id: string;
  period_month: string;
  due_date: string;
  amount: string | number;
}

interface ConfirmationRow {
  rent_period_id: string;
  confirmed_by: string;
  status: ConfirmationStatus;
  amount_paid: string | number | null;
  confirmed_at: string;
  paid_at: string | null;
  tenant_comment: string | null;
  tenant_commented_at: string | null;
}

/** Vuokrakaudet kuittauksineen, uusin ensin. */
export async function listRentPeriods(
  userId: string,
  tenancyId: string,
): Promise<RentPeriodRow[]> {
  await requireTenancyParty(userId, tenancyId);

  const supabase = getServiceClient();

  const { data: periods, error } = await supabase
    .from("rs_rent_periods")
    .select("id, period_month, due_date, amount")
    .eq("tenancy_id", tenancyId)
    .order("period_month", { ascending: false });

  if (error) {
    console.error("[rent] kausien haku epäonnistui:", error.message);
    throw new Error("Vuokrakausien haku epäonnistui.");
  }

  const rows = (periods ?? []) as unknown as PeriodRow[];
  if (rows.length === 0) return [];

  const { data: confirmations } = await supabase
    .from("rs_rent_confirmations")
    .select(
      "rent_period_id, confirmed_by, status, amount_paid, confirmed_at, paid_at, tenant_comment, tenant_commented_at",
    )
    .in(
      "rent_period_id",
      rows.map((row) => row.id),
    );

  const byPeriod = new Map<string, ConfirmationRow>();
  for (const row of (confirmations ?? []) as unknown as ConfirmationRow[]) {
    byPeriod.set(row.rent_period_id, row);
  }

  return rows.map((row) => {
    const confirmation = byPeriod.get(row.id);

    return {
      id: row.id,
      periodMonth: row.period_month,
      dueDate: row.due_date,
      amount: Number(row.amount),
      confirmation: confirmation
        ? {
            status: confirmation.status,
            amountPaid:
              confirmation.amount_paid === null ? null : Number(confirmation.amount_paid),
            confirmedAt: confirmation.confirmed_at,
            confirmedBy: confirmation.confirmed_by,
            paidAt: confirmation.paid_at,
          }
        : null,
      tenantComment: confirmation?.tenant_comment ?? null,
      tenantCommentedAt: confirmation?.tenant_commented_at ?? null,
      editable: confirmation ? canEditConfirmation(confirmation.confirmed_at) : true,
    };
  });
}

export type ConfirmResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Kuittaa vuokrakauden. Vain vuokranantaja.
 *
 * Ensimmäinen kuittaus luo rivin, myöhempi muuttaa sitä. `confirmed_at` EI
 * päivity muutoksessa: 30 päivän ikkuna lasketaan ensimmäisestä
 * kuittauksesta, eikä merkintää saa pitää auki loputtomiin muuttamalla sitä
 * kerran kuussa.
 */
export async function confirmRent(
  userId: string,
  tenancyId: string,
  periodId: string,
  status: ConfirmationStatus,
  amountPaid: number | null,
): Promise<ConfirmResult> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy) return { ok: false, message: "Vuokrasuhdetta ei löytynyt." };

  if (tenancy.landlordUserId !== userId) {
    // Vuokralainen ei kuittaa: hän ei näe vuokranantajan tiliä. Hänen
    // kanavansa on kommentti.
    return { ok: false, message: "Vain vuokranantaja voi kuitata vuokran." };
  }

  const supabase = getServiceClient();

  const { data: period } = await supabase
    .from("rs_rent_periods")
    .select("id, amount")
    .eq("id", periodId)
    .eq("tenancy_id", tenancyId)
    .maybeSingle();

  if (!period) return { ok: false, message: "Vuokrakautta ei löytynyt." };

  const rentAmount = Number((period as { amount: string | number }).amount);
  const validated = validateConfirmation(status, amountPaid, rentAmount);
  if (!validated.ok) return { ok: false, message: validated.message };

  const { data: existing } = await supabase
    .from("rs_rent_confirmations")
    .select("id, status, amount_paid, confirmed_at, paid_at")
    .eq("rent_period_id", periodId)
    .maybeSingle();

  const previous = existing as {
    id: string;
    status: ConfirmationStatus;
    amount_paid: string | number | null;
    confirmed_at: string;
    paid_at: string | null;
  } | null;

  if (previous && !canEditConfirmation(previous.confirmed_at)) {
    return {
      ok: false,
      message: "Kuittausta voi muuttaa 30 päivän ajan. Tämän kauden merkintä on jo lukittu.",
    };
  }

  const now = new Date().toISOString();

  /*
    `paid_at` on eri asia kuin `confirmed_at`.

    `confirmed_at` on ensimmäisen kuittauksen hetki eikä muutu: 30 päivän
    muutosikkuna lasketaan siitä. `paid_at` on hetki, jolloin merkintä muuttui
    maksetuksi, ja vuokratodistuksen luokittelu perustuu siihen
    (`rent/history.ts`).

    Jos merkintä muuttuu pois maksetusta, `paid_at` nollataan: silloin vuokraa
    ei ole maksettu, eikä maksuhetkeä ole olemassa. Jos se pysyy maksettuna,
    aiempi hetki säilyy — merkinnän muuttaminen ei saa siirtää maksupäivää.
  */
  const paidAt =
    status !== "paid" ? null : (previous?.status === "paid" ? previous.paid_at : now) ?? now;

  const { error } = previous
    ? await supabase
        .from("rs_rent_confirmations")
        .update({ status, amount_paid: validated.amountPaid, paid_at: paidAt, updated_at: now })
        .eq("id", previous.id)
    : await supabase.from("rs_rent_confirmations").insert({
        rent_period_id: periodId,
        confirmed_by: userId,
        status,
        amount_paid: validated.amountPaid,
        confirmed_at: now,
        paid_at: paidAt,
      });

  if (error) {
    console.error("[rent] kuittaus epäonnistui:", error.message);
    throw new Error("Kuittaus ei onnistunut.");
  }

  /*
    Muutos lokiin, ensimmäinen kuittaus myös.

    Loki on osa sitä, mihin vuokratodistus perustuu: merkintä, joka on
    muuttunut kolmesti, kertoo jotain sellaista, mitä lopputila yksin ei
    kerro. Lokiin ei kirjoiteta rahasummaa suurempaa tietoa kuin merkintään
    itseensä kuuluu.
  */
  await supabase.from("rs_audit_log").insert({
    tenancy_id: tenancyId,
    actor_user_id: userId,
    action: previous ? "rent.confirmation.changed" : "rent.confirmation.created",
    target_type: "rent_period",
    target_id: periodId,
    details: previous
      ? {
          from: { status: previous.status, amountPaid: previous.amount_paid },
          to: { status, amountPaid: validated.amountPaid },
        }
      : { status, amountPaid: validated.amountPaid },
  });

  return { ok: true };
}

/**
 * Vuokralaisen kommentti kuittaukseen (enintään 300 merkkiä).
 *
 * Kommentti on vastine, ei toinen kuittaus. Siksi se tallennetaan samalle
 * riville eikä omakseen: se kuuluu siihen merkintään, jota se koskee.
 */
export async function commentOnConfirmation(
  userId: string,
  tenancyId: string,
  periodId: string,
  comment: string,
): Promise<ConfirmResult> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy) return { ok: false, message: "Vuokrasuhdetta ei löytynyt." };

  if (tenancy.landlordUserId === userId) {
    return { ok: false, message: "Kommentti on vuokralaisen vastine kuittaukseen." };
  }

  const trimmed = comment.trim().slice(0, 300);
  if (trimmed === "") return { ok: false, message: "Kirjoita kommentti ennen lähettämistä." };

  const supabase = getServiceClient();

  // Kommentoida voi vain kuitattua kautta: ilman kuittausta ei ole mitään,
  // mihin vastata.
  const { data: confirmation } = await supabase
    .from("rs_rent_confirmations")
    .select("id, rent_period_id")
    .eq("rent_period_id", periodId)
    .maybeSingle();

  if (!confirmation) return { ok: false, message: "Tätä kautta ei ole vielä kuitattu." };

  const { error } = await supabase
    .from("rs_rent_confirmations")
    .update({
      tenant_comment: trimmed,
      tenant_commented_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", (confirmation as { id: string }).id);

  if (error) {
    console.error("[rent] kommentin tallennus epäonnistui:", error.message);
    throw new Error("Kommentin tallennus epäonnistui.");
  }

  await supabase.from("rs_audit_log").insert({
    tenancy_id: tenancyId,
    actor_user_id: userId,
    action: "rent.confirmation.commented",
    target_type: "rent_period",
    target_id: periodId,
    details: {},
  });

  return { ok: true };
}
