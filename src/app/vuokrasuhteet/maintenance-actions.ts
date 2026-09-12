"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import {
  addMaintenanceComment,
  cancelMaintenanceEntry,
  createMaintenanceEntry,
  resolveMaintenanceEntry,
  type MaintenanceKind,
} from "@/lib/db/maintenance";
import { notifyOtherParty } from "@/lib/notifications/tenancy";

/**
 * Huoltokirjan toiminnot (CLAUDE.md 5.6).
 *
 * Säännöt ovat datakerroksessa. Nämä ovat kuoria, joiden ainoa lisä on
 * ilmoitus toiselle osapuolelle: huoltokirja on hyödytön, jos toinen ei
 * tiedä että sinne on kirjattu jotain.
 */

export interface MaintenanceActionState {
  message?: string;
  done?: boolean;
}

const KINDS: MaintenanceKind[] = ["defect", "repair", "note"];

export async function createEntryAction(
  _previous: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const raw = String(formData.get("kind") ?? "defect");
  const kind = (KINDS.includes(raw as MaintenanceKind) ? raw : "defect") as MaintenanceKind;
  const title = String(formData.get("title") ?? "");
  const body = String(formData.get("body") ?? "");

  let entryId: string;
  try {
    const result = await createMaintenanceEntry(user.id, tenancyId, kind, title, body);
    if (!result.ok) return { message: result.message };
    entryId = result.id;
  } catch {
    return { message: "Tallennus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  await notifyOtherParty(user.id, tenancyId, {
    kind: "maintenance.created",
    dedupeKey: `maintenance.created:${entryId}`,
    title: kind === "defect" ? "Uusi vikailmoitus" : "Uusi merkintä huoltokirjassa",
    body: title.trim().slice(0, 120),
    path: `/vuokrasuhteet/${tenancyId}/huoltokirja`,
  });

  revalidatePath(`/vuokrasuhteet/${tenancyId}/huoltokirja`);
  redirect(`/vuokrasuhteet/${tenancyId}/huoltokirja/${entryId}`);
}

export async function commentAction(
  _previous: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  const body = String(formData.get("body") ?? "");

  try {
    const result = await addMaintenanceComment(user.id, tenancyId, entryId, body);
    if (!result.ok) return { message: result.message };
  } catch {
    return { message: "Kommentin lähetys ei onnistunut." };
  }

  await notifyOtherParty(user.id, tenancyId, {
    kind: "maintenance.comment",
    // Aikaleima tunnisteessa: saman merkinnän kommentteja voi tulla useita,
    // ja jokainen on oma ilmoituksensa.
    dedupeKey: `maintenance.comment:${entryId}:${Date.now()}`,
    title: "Uusi kommentti huoltokirjassa",
    body: body.trim().slice(0, 120),
    path: `/vuokrasuhteet/${tenancyId}/huoltokirja/${entryId}`,
  });

  revalidatePath(`/vuokrasuhteet/${tenancyId}/huoltokirja/${entryId}`);
  return { done: true };
}

export async function resolveAction(
  _previous: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");

  try {
    const result = await resolveMaintenanceEntry(user.id, tenancyId, entryId);
    if (!result.ok) return { message: result.message };
  } catch {
    return { message: "Merkintä ei onnistunut." };
  }

  await notifyOtherParty(user.id, tenancyId, {
    kind: "maintenance.resolved",
    dedupeKey: `maintenance.resolved:${entryId}`,
    title: "Vika merkitty korjatuksi",
    body: "Vuokranantaja on merkinnyt vian korjatuksi. Voit kommentoida, jos olet eri mieltä.",
    path: `/vuokrasuhteet/${tenancyId}/huoltokirja/${entryId}`,
  });

  revalidatePath(`/vuokrasuhteet/${tenancyId}/huoltokirja/${entryId}`);
  return { done: true };
}

export async function cancelAction(
  _previous: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  const reason = String(formData.get("reason") ?? "");

  try {
    const result = await cancelMaintenanceEntry(user.id, tenancyId, entryId, reason);
    if (!result.ok) return { message: result.message };
  } catch {
    return { message: "Peruminen ei onnistunut." };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}/huoltokirja/${entryId}`);
  return { done: true };
}
