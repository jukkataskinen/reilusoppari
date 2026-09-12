"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { recordDepositReturn, recordNotice } from "@/lib/db/ending";
import { notifyOtherParty } from "@/lib/notifications/tenancy";

/**
 * Irtisanominen ja vakuuden palautus (CLAUDE.md 5.8).
 *
 * Molemmat ovat tapahtumia, joista toisen osapuolen on saatava tieto heti.
 * Irtisanominen muuttaa hänen elämäänsä, ja vakuuden palautus on rahaa —
 * kumpaakaan ei saa jäädä odottamaan seuraavaa kirjautumista.
 */

export interface EndingActionState {
  message?: string;
  done?: boolean;
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${Number(day)}.${Number(month)}.${year}`;
}

export async function recordNoticeAction(
  _previous: EndingActionState,
  formData: FormData,
): Promise<EndingActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");

  let endsAt: string;
  try {
    const result = await recordNotice(user.id, tenancyId);
    if (!result.ok) return { message: result.message };
    endsAt = result.endsAt;
  } catch {
    return { message: "Kirjaus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  await notifyOtherParty(user.id, tenancyId, {
    kind: "tenancy.notice",
    dedupeKey: `tenancy.notice:${tenancyId}`,
    title: "Vuokrasuhde on irtisanottu",
    body: `Vuokrasuhde päättyy ${formatDate(endsAt)}. Ennen sitä tehdään loppukatselmus.`,
    path: `/vuokrasuhteet/${tenancyId}/paattyminen`,
  });

  revalidatePath(`/vuokrasuhteet/${tenancyId}`);
  revalidatePath(`/vuokrasuhteet/${tenancyId}/paattyminen`);
  return { done: true };
}

export async function recordDepositAction(
  _previous: EndingActionState,
  formData: FormData,
): Promise<EndingActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const date = String(formData.get("date") ?? "");
  const amount = Number(String(formData.get("amount") ?? "").trim().replace(",", "."));

  try {
    const result = await recordDepositReturn(user.id, tenancyId, date, amount);
    if (!result.ok) return { message: result.message };
  } catch {
    return { message: "Kirjaus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  await notifyOtherParty(user.id, tenancyId, {
    kind: "tenancy.deposit",
    dedupeKey: `tenancy.deposit:${tenancyId}`,
    title: "Vakuus palautettu",
    body: `Vuokranantaja on kirjannut vakuuden palautetuksi ${formatDate(date)}.`,
    path: `/vuokrasuhteet/${tenancyId}/paattyminen`,
  });

  revalidatePath(`/vuokrasuhteet/${tenancyId}/paattyminen`);
  return { done: true };
}
