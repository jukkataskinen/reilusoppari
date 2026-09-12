"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { commentOnConfirmation, confirmRent } from "@/lib/db/rent";
import type { ConfirmationStatus } from "@/lib/rent/confirmation";
import { dispatchForPeriod, loadPeriodState } from "@/lib/rent/dispatch";

/**
 * Vuokran kuittaus ja siihen liittyvä kommentti (CLAUDE.md 5.5).
 *
 * Säännöt ovat `lib/rent/confirmation.ts`:ssä ja `lib/db/rent.ts`:ssä.
 * Nämä ovat kuoria.
 */

export interface RentActionState {
  message?: string;
  done?: boolean;
}

const STATUSES: ConfirmationStatus[] = ["paid", "not_yet", "partial"];

export async function confirmRentAction(
  _previous: RentActionState,
  formData: FormData,
): Promise<RentActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const periodId = String(formData.get("periodId") ?? "");
  const raw = String(formData.get("status") ?? "");

  if (!STATUSES.includes(raw as ConfirmationStatus)) {
    return { message: "Valitse Kyllä, Ei vielä tai Osittain." };
  }

  // Pilkku desimaalierottimena: suomalainen näppäimistö tarjoaa sen.
  const amountText = String(formData.get("amountPaid") ?? "").trim().replace(",", ".");
  const amountPaid = amountText === "" ? null : Number(amountText);

  try {
    const result = await confirmRent(
      user.id,
      tenancyId,
      periodId,
      raw as ConfirmationStatus,
      amountPaid,
    );
    if (!result.ok) return { message: result.message };
  } catch {
    return { message: "Kuittaus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  /*
    Vuokralaiselle kerrotaan heti.

    Cron lähettäisi saman seuraavana aamuna, mutta vuorokauden viive tuntuisi
    siltä, ettei merkinnällä ollut vaikutusta. Lähetys ei saa kaataa
    kuittausta: merkintä on jo tallessa, ja ilmoitus on herätys eikä sisältö.
  */
  try {
    const state = await loadPeriodState(periodId);
    if (state) await dispatchForPeriod(state, new Date(), "tenant");
  } catch (err) {
    console.error(
      "[vuokrat] ilmoituksen lähetys epäonnistui:",
      err instanceof Error ? err.message : err,
    );
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}/vuokrat`);
  return { done: true };
}

export async function commentOnRentAction(
  _previous: RentActionState,
  formData: FormData,
): Promise<RentActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const periodId = String(formData.get("periodId") ?? "");
  const comment = String(formData.get("comment") ?? "");

  try {
    const result = await commentOnConfirmation(user.id, tenancyId, periodId, comment);
    if (!result.ok) return { message: result.message };
  } catch {
    return { message: "Kommentin lähetys ei onnistunut." };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}/vuokrat`);
  return { done: true };
}
