/**
 * Vuokrasuhteen päättyminen: irtisanominen ja vakuuden palautus (CLAUDE.md 5.8).
 *
 * ===========================================================================
 * KUMPI TAHANSA VOI IRTISANOA
 *
 * Irtisanominen on kummankin oikeus, ja sovellus kirjaa sen kummalta tahansa.
 * Osapuoli ratkaisee vain sen, kuinka pitkä irtisanomisaika on
 * (`lib/tenancy/ending.ts`) — laki antaa vuokralaiselle lyhyemmän.
 *
 * VAKUUDEN PALAUTUS ON VUOKRANANTAJAN KIRJAUS
 *
 * Hän palauttaa vakuuden ja tietää milloin. Vuokralainen näkee merkinnän, ja
 * se päätyy vuokratodistukseen — palautettu vakuus kertoo vuokrasuhteesta
 * jotain olennaista.
 * ===========================================================================
 */

import { getServiceClient } from "./supabase";
import { getTenancy } from "./tenancies";
import { getContractTerms } from "./contracts";
import { evaluateNotice, type NoticeDecision, type NoticeState } from "../tenancy/ending";

export interface EndingState {
  notice: NoticeState;
  decision: NoticeDecision;
  isLandlord: boolean;
  noticeGivenAt: string | null;
  noticeBy: "landlord" | "tenant" | null;
  noticeEndsAt: string | null;
  depositAmount: number | null;
  depositReturnedAt: string | null;
  depositReturnedAmount: number | null;
}

interface EndingRow {
  notice_given_at: string | null;
  notice_by: "landlord" | "tenant" | null;
  notice_ends_at: string | null;
  deposit_returned_at: string | null;
  deposit_returned_amount: string | number | null;
}

/** Kaikki, mitä päättymisnäkymä tarvitsee. */
export async function getEndingState(
  userId: string,
  tenancyId: string,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<EndingState | null> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy) return null;

  const [terms, { data }] = await Promise.all([
    getContractTerms(userId, tenancyId),
    getServiceClient()
      .from("rs_tenancies")
      .select(
        "notice_given_at, notice_by, notice_ends_at, deposit_returned_at, deposit_returned_amount",
      )
      .eq("id", tenancyId)
      .single(),
  ]);

  const row = data as unknown as EndingRow | null;
  const isLandlord = tenancy.landlordUserId === userId;

  const notice: NoticeState = {
    by: isLandlord ? "landlord" : "tenant",
    status: tenancy.status,
    startDate: tenancy.startDate ?? today,
    endDate: tenancy.endDate,
    contractNoticeMonths: terms.noticePeriodMonths,
    minimumTermMonths: terms.minimumTermMonths,
    noticeGivenAt: row?.notice_given_at ?? null,
    noticeDate: today,
  };

  return {
    notice,
    decision: evaluateNotice(notice),
    isLandlord,
    noticeGivenAt: row?.notice_given_at ?? null,
    noticeBy: row?.notice_by ?? null,
    noticeEndsAt: row?.notice_ends_at ?? null,
    depositAmount: tenancy.depositAmount,
    depositReturnedAt: row?.deposit_returned_at ?? null,
    depositReturnedAmount:
      row?.deposit_returned_amount === null || row?.deposit_returned_amount === undefined
        ? null
        : Number(row.deposit_returned_amount),
  };
}

export type EndingResult = { ok: true; endsAt: string } | { ok: false; message: string };

/**
 * Kirjaa irtisanomisen.
 *
 * Päättymispäivä lasketaan ja tallennetaan `notice_ends_at`-sarakkeeseen —
 * EI `end_date`-sarakkeeseen, joka tarkoittaa määräaikaisen sopimuksen
 * sovittua päättymispäivää. Jos se kirjoitettaisiin sinne, allekirjoitettu
 * sopimus muuttuisi taannehtivasti määräaikaiseksi.
 */
export async function recordNotice(
  userId: string,
  tenancyId: string,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<EndingResult> {
  const state = await getEndingState(userId, tenancyId, today);
  if (!state) return { ok: false, message: "Vuokrasuhdetta ei löytynyt." };
  if (!state.decision.allowed) return { ok: false, message: state.decision.message };

  const now = new Date().toISOString();
  const { endsAt } = state.decision;
  const supabase = getServiceClient();

  const { error } = await supabase
    .from("rs_tenancies")
    .update({
      status: "ending",
      notice_given_at: now,
      notice_by: state.notice.by,
      notice_ends_at: endsAt,
      updated_at: now,
    })
    .eq("id", tenancyId)
    .eq("status", "active");

  if (error) {
    console.error("[päättyminen] irtisanomisen kirjaus epäonnistui:", error.message);
    throw new Error("Irtisanomisen kirjaus epäonnistui.");
  }

  await supabase.from("rs_audit_log").insert({
    tenancy_id: tenancyId,
    actor_user_id: userId,
    action: "tenancy.notice.given",
    target_type: "tenancy",
    target_id: tenancyId,
    details: { by: state.notice.by, endsAt },
  });

  return { ok: true, endsAt };
}

/**
 * Kirjaa vakuuden palautuksen. Vain vuokranantaja.
 *
 * Summa voi olla pienempi kuin vakuus, jos siitä on vähennetty jotain — mutta
 * ei suurempi. Suurempi summa olisi näppäilyvirhe, ja se päätyisi
 * vuokratodistukseen.
 */
export async function recordDepositReturn(
  userId: string,
  tenancyId: string,
  date: string,
  amount: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy) return { ok: false, message: "Vuokrasuhdetta ei löytynyt." };

  if (tenancy.landlordUserId !== userId) {
    return { ok: false, message: "Vain vuokranantaja voi kirjata vakuuden palautuksen." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: "Tarkista päivämäärä." };
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, message: "Tarkista summa." };
  }
  if (tenancy.depositAmount !== null && amount > tenancy.depositAmount) {
    return {
      ok: false,
      message: `Summa on suurempi kuin vakuus (${tenancy.depositAmount} €). Tarkista luku.`,
    };
  }

  const now = new Date().toISOString();
  const supabase = getServiceClient();

  const { error } = await supabase
    .from("rs_tenancies")
    .update({ deposit_returned_at: date, deposit_returned_amount: amount, updated_at: now })
    .eq("id", tenancyId);

  if (error) {
    console.error("[päättyminen] vakuuden kirjaus epäonnistui:", error.message);
    throw new Error("Kirjaus epäonnistui.");
  }

  await supabase.from("rs_audit_log").insert({
    tenancy_id: tenancyId,
    actor_user_id: userId,
    action: "tenancy.deposit.returned",
    target_type: "tenancy",
    target_id: tenancyId,
    details: { date, amount },
  });

  return { ok: true };
}

/** Merkitsee vuokrasuhteen päättyneeksi. Kutsutaan loppukatselmuksen allekirjoituksesta. */
export async function markEnded(tenancyId: string): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await getServiceClient()
    .from("rs_tenancies")
    .update({ status: "ended", updated_at: now })
    .eq("id", tenancyId)
    .eq("status", "ending");

  if (error) {
    console.error("[päättyminen] tilan päivitys epäonnistui:", error.message);
  }
}
