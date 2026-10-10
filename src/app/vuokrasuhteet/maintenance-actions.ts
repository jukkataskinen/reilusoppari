"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { fieldErrors } from "@/lib/forms/schema";
import {
  addMaintenanceComment,
  cancelMaintenanceEntry,
  createMaintenanceEntry,
  resolveMaintenanceEntry,
  type MaintenanceKind,
} from "@/lib/db/maintenance";
import {
  maintenanceCancelSchema,
  maintenanceCommentSchema,
  maintenanceEntrySchema,
} from "@/lib/maintenance/schema";
import { notifyOtherParty } from "@/lib/notifications/tenancy";

/**
 * Huoltokirjan toiminnot (CLAUDE.md 5.6).
 *
 * Säännöt ovat datakerroksessa. Nämä ovat kuoria, joiden ainoa lisä on
 * ilmoitus toiselle osapuolelle: huoltokirja on hyödytön, jos toinen ei
 * tiedä että sinne on kirjattu jotain.
 */

export interface MaintenanceActionState {
  errors: Record<string, string>;
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

  const parsed = maintenanceEntrySchema.safeParse({
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  let entryId: string;
  try {
    const result = await createMaintenanceEntry(
      user.id,
      tenancyId,
      kind,
      parsed.data.title,
      parsed.data.body,
    );
    if (!result.ok) return { errors: {}, message: result.message };
    entryId = result.id;
  } catch {
    return { errors: {}, message: "Tallennus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  await notifyOtherParty(user.id, tenancyId, {
    kind: "maintenance.created",
    dedupeKey: `maintenance.created:${entryId}`,
    title: kind === "defect" ? "Uusi vikailmoitus" : "Uusi merkintä huoltokirjassa",
    body: parsed.data.title.slice(0, 120),
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

  const parsed = maintenanceCommentSchema.safeParse({ body: String(formData.get("body") ?? "") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  try {
    const result = await addMaintenanceComment(user.id, tenancyId, entryId, parsed.data.body);
    if (!result.ok) return { errors: {}, message: result.message };
  } catch {
    return { errors: {}, message: "Kommentin lähetys ei onnistunut." };
  }

  await notifyOtherParty(user.id, tenancyId, {
    kind: "maintenance.comment",
    // Aikaleima tunnisteessa: saman merkinnän kommentteja voi tulla useita,
    // ja jokainen on oma ilmoituksensa.
    dedupeKey: `maintenance.comment:${entryId}:${Date.now()}`,
    title: "Uusi kommentti huoltokirjassa",
    body: parsed.data.body.slice(0, 120),
    path: `/vuokrasuhteet/${tenancyId}/huoltokirja/${entryId}`,
  });

  revalidatePath(`/vuokrasuhteet/${tenancyId}/huoltokirja/${entryId}`);
  return { errors: {}, done: true };
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
    if (!result.ok) return { errors: {}, message: result.message };
  } catch {
    return { errors: {}, message: "Merkintä ei onnistunut." };
  }

  await notifyOtherParty(user.id, tenancyId, {
    kind: "maintenance.resolved",
    dedupeKey: `maintenance.resolved:${entryId}`,
    title: "Vika merkitty korjatuksi",
    body: "Vuokranantaja on merkinnyt vian korjatuksi. Voit kommentoida, jos olet eri mieltä.",
    path: `/vuokrasuhteet/${tenancyId}/huoltokirja/${entryId}`,
  });

  revalidatePath(`/vuokrasuhteet/${tenancyId}/huoltokirja/${entryId}`);
  return { errors: {}, done: true };
}

export async function cancelAction(
  _previous: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");

  const parsed = maintenanceCancelSchema.safeParse({ reason: String(formData.get("reason") ?? "") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const reason = parsed.data.reason;

  try {
    const result = await cancelMaintenanceEntry(user.id, tenancyId, entryId, reason);
    if (!result.ok) return { errors: {}, message: result.message };
  } catch {
    return { errors: {}, message: "Peruminen ei onnistunut." };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}/huoltokirja/${entryId}`);
  return { errors: {}, done: true };
}
