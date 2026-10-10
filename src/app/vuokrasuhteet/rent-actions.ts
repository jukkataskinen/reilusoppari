"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { fieldErrors } from "@/lib/forms/schema";
import { commentOnConfirmation, confirmRent } from "@/lib/db/rent";
import { confirmRentSchema, rentCommentSchema } from "@/lib/rent/confirmation";
import { dispatchForPeriod, loadPeriodState } from "@/lib/rent/dispatch";

/**
 * Vuokran kuittaus ja siihen liittyvä kommentti (CLAUDE.md 5.5).
 *
 * Säännöt ovat `lib/rent/confirmation.ts`:ssä ja `lib/db/rent.ts`:ssä.
 * Nämä ovat kuoria.
 */

export interface RentActionState {
  errors: Record<string, string>;
  message?: string;
  done?: boolean;
}

export async function confirmRentAction(
  _previous: RentActionState,
  formData: FormData,
): Promise<RentActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const periodId = String(formData.get("periodId") ?? "");

  const parsed = confirmRentSchema.safeParse({
    status: String(formData.get("status") ?? ""),
    amountPaid: String(formData.get("amountPaid") ?? ""),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  // Pilkku desimaalierottimena: suomalainen näppäimistö tarjoaa sen.
  const amountText = parsed.data.amountPaid.trim().replace(",", ".");
  const amountPaid = amountText === "" ? null : Number(amountText);

  try {
    const result = await confirmRent(
      user.id,
      tenancyId,
      periodId,
      parsed.data.status,
      amountPaid,
    );
    if (!result.ok) return { errors: {}, message: result.message };
  } catch {
    return { errors: {}, message: "Kuittaus ei onnistunut. Yritä hetken kuluttua uudelleen." };
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
  return { errors: {}, done: true };
}

export async function commentOnRentAction(
  _previous: RentActionState,
  formData: FormData,
): Promise<RentActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const periodId = String(formData.get("periodId") ?? "");

  const parsed = rentCommentSchema.safeParse({ comment: String(formData.get("comment") ?? "") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  try {
    const result = await commentOnConfirmation(user.id, tenancyId, periodId, parsed.data.comment);
    if (!result.ok) return { errors: {}, message: result.message };
  } catch {
    return { errors: {}, message: "Kommentin lähetys ei onnistunut." };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}/vuokrat`);
  return { errors: {}, done: true };
}
