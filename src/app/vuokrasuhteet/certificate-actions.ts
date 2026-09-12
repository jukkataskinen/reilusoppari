"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import {
  addReply,
  createCertificateShare,
  giveRating,
  revokeCertificateShare,
} from "@/lib/db/certificates";
import { sealCertificate } from "@/lib/certificates/seal";
import { shareUrl } from "@/lib/certificates/share";
import { notifyOtherParty } from "@/lib/notifications/tenancy";
import type { CertificateFor } from "@/lib/certificates/rules";

/**
 * Arviot, vastineet, sinetöinti ja jakolinkit (CLAUDE.md 5.8).
 *
 * Säännöt ovat `lib/certificates/rules.ts`:ssä ja datakerroksessa. Nämä ovat
 * kuoria, joiden lisäarvo on ilmoitus toiselle osapuolelle: arvio ja vastine
 * ovat asioita, joihin toisella on määräaika vastata.
 */

export interface CertificateActionState {
  message?: string;
  done?: boolean;
  /** Uusi jakolinkki näytettäväksi kerran. Sitä ei tallenneta mihinkään. */
  shareLink?: string;
}

export async function giveRatingAction(
  _previous: CertificateActionState,
  formData: FormData,
): Promise<CertificateActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  // Kaksiarvoinen: suositus tai ei arviota. Kielteistä vaihtoehtoa ei ole.
  const rating = formData.get("rating") === "recommend" ? "recommend" : null;
  const comment = String(formData.get("comment") ?? "");

  try {
    const result = await giveRating(user.id, tenancyId, rating, comment);
    if (!result.ok) return { message: result.message };
  } catch {
    return { message: "Tallennus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  await notifyOtherParty(user.id, tenancyId, {
    kind: "certificate.rating",
    dedupeKey: `certificate.rating:${tenancyId}`,
    title: "Sinusta on annettu arvio",
    body: "Voit lukea sen ja halutessasi liittää oman vastineesi seitsemän päivän kuluessa.",
    path: `/vuokrasuhteet/${tenancyId}/todistukset`,
  });

  revalidatePath(`/vuokrasuhteet/${tenancyId}/todistukset`);
  return { done: true };
}

export async function replyAction(
  _previous: CertificateActionState,
  formData: FormData,
): Promise<CertificateActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const reply = String(formData.get("reply") ?? "");

  try {
    const result = await addReply(user.id, tenancyId, reply);
    if (!result.ok) return { message: result.message };
  } catch {
    return { message: "Vastineen lähetys ei onnistunut." };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}/todistukset`);
  return { done: true };
}

export async function sealAction(
  _previous: CertificateActionState,
  formData: FormData,
): Promise<CertificateActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const forRole = (formData.get("forRole") === "landlord" ? "landlord" : "tenant") as CertificateFor;

  try {
    const result = await sealCertificate(user.id, tenancyId, forRole);
    if (!result.ok) return { message: result.message };
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes("eSinetti-yhteyttä")
        ? "eSinetti-yhteyttä ei ole määritetty. Sinetöintiä ei voi tehdä."
        : "Sinetöinti ei onnistunut. Yritä hetken kuluttua uudelleen.";
    return { message };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}/todistukset`);
  return { done: true };
}

export async function createShareAction(
  _previous: CertificateActionState,
  formData: FormData,
): Promise<CertificateActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");

  try {
    const result = await createCertificateShare(user.id, tenancyId);
    if (!result.ok) return { message: result.message };

    /*
      Linkki näytetään kerran, eikä sitä voi katsoa myöhemmin uudelleen.

      Tunniste tallennetaan vain tiivisteenä, joten sitä ei voi näyttää
      toista kertaa. Se on tarkoitus: jos tunniste olisi haettavissa, myös
      tietokantaan päässyt saisi sen.
    */
    const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.reilusoppari.fi";
    revalidatePath(`/vuokrasuhteet/${tenancyId}/todistukset`);
    return { shareLink: shareUrl(base, result.token) };
  } catch {
    return { message: "Jakolinkin luonti ei onnistunut." };
  }
}

export async function revokeShareAction(
  _previous: CertificateActionState,
  formData: FormData,
): Promise<CertificateActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const shareId = String(formData.get("shareId") ?? "");

  try {
    const result = await revokeCertificateShare(user.id, tenancyId, shareId);
    if (!result.ok) return { message: result.message };
  } catch {
    return { message: "Mitätöinti ei onnistunut." };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}/todistukset`);
  return { done: true };
}
