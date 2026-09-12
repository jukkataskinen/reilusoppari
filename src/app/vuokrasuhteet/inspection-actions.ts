"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { flagPhoto, lockInspection, markTenantReady } from "@/lib/db/inspections";
import { normalizeRoomName, roomSlug } from "@/lib/inspection/rooms";
import type { InspectionKind } from "@/lib/db/inspections";

/** Kumpi katselmus lomake koski. Tuntematon arvo on alkukatselmus. */
function kindOf(formData: FormData): InspectionKind {
  return formData.get("kind") === "final" ? "final" : "initial";
}

/** Polun osa, jolle ohjataan. Sama valinta kuin `kindOf`, mutta osoitteeseen. */
function basePathOf(formData: FormData): string {
  return formData.get("kind") === "final" ? "loppukatselmus" : "katselmus";
}

/**
 * Katselmuksen toiminnot (CLAUDE.md 5.3).
 *
 * Säännöt ovat datakerroksessa (`db/inspections.ts`) ja puhtaana funktiona
 * (`inspection/lock.ts`), eivät täällä. Nämä ovat kuoria: lue käyttäjä, kutsu
 * sääntöä, kerro tulos.
 */

export interface InspectionActionState {
  message?: string;
  done?: boolean;
}

export async function markReadyAction(
  _previous: InspectionActionState,
  formData: FormData,
): Promise<InspectionActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");

  try {
    await markTenantReady(user.id, tenancyId, kindOf(formData));
  } catch {
    return { message: "Merkintä ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}/${basePathOf(formData)}`);
  return { done: true };
}

export async function lockInspectionAction(
  _previous: InspectionActionState,
  formData: FormData,
): Promise<InspectionActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");

  try {
    const decision = await lockInspection(user.id, tenancyId, kindOf(formData));
    // Sääntö tarkistetaan myös täällä: nappi on vihje, tarkistus on portti.
    if (!decision.allowed) return { message: decision.message };
  } catch {
    return { message: "Lukitus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}/${basePathOf(formData)}`);
  revalidatePath(`/vuokrasuhteet/${tenancyId}`);
  return { done: true };
}

/**
 * Merkitsee kuvan kuulumattomaksi.
 *
 * Kuva ei poistu. Merkintä näkyy molemmille ja se tulee pöytäkirjaan —
 * poistettavissa oleva kuva tekisi koko katselmuksesta arvottoman.
 */
export async function flagPhotoAction(
  _previous: InspectionActionState,
  formData: FormData,
): Promise<InspectionActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const photoId = String(formData.get("photoId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200) || null;

  try {
    await flagPhoto(user.id, tenancyId, photoId, reason);
  } catch {
    return { message: "Merkintä ei onnistunut." };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}/katselmus`);
  revalidatePath(`/vuokrasuhteet/${tenancyId}/loppukatselmus`);
  return { done: true };
}

/**
 * Siirtyy huoneeseen, jota ei ole oletuslistalla.
 *
 * Huonetta ei luoda mihinkään: se syntyy siitä, että joku kuvaa sen. Nimi
 * kulkee osoitteessa kyselyparametrina, koska huonetta ei vielä ole
 * luettelossa, josta tunnisteen voisi kääntää takaisin nimeksi.
 */
export async function addRoomAction(
  _previous: InspectionActionState,
  formData: FormData,
): Promise<InspectionActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const name = normalizeRoomName(String(formData.get("room") ?? ""));

  if (!name) return { message: "Anna huoneelle nimi." };

  const slug = roomSlug(name);
  if (!slug) return { message: "Nimessä on oltava kirjaimia tai numeroita." };

  redirect(
    `/vuokrasuhteet/${tenancyId}/${basePathOf(formData)}/${slug}?nimi=${encodeURIComponent(name)}`,
  );
}
