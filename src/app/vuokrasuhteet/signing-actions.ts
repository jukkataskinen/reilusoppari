"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import {
  sendFinalForSigning,
  sendForSigning,
  sendInspectionForSigning,
} from "@/lib/tenancy/signing";
import { landlordSigningUrl, SIGN_NOW_FALLBACK_MESSAGE } from "@/lib/tenancy/sign-now";

/**
 * Asiakirjojen lähetys allekirjoitettavaksi (CLAUDE.md 5.4).
 *
 * Ehdot tarkistetaan `lib/tenancy/signing.ts`:ssä, ei täällä. Tämä on kuori:
 * lue käyttäjä, kutsu sääntöä, kerro tulos.
 */

export interface SigningActionState {
  message?: string;
  sent?: boolean;
}

export async function sendForSigningAction(
  _previous: SigningActionState,
  formData: FormData,
): Promise<SigningActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");

  try {
    const result = await sendForSigning(user.id, tenancyId);
    if (!result.ok) return { message: result.message };
  } catch (err) {
    // Mock tuotannossa on oma virheensä eikä geneerinen: se tarkoittaa,
    // ettei eSinetti-yhteyttä ole määritetty lainkaan.
    const message =
      err instanceof Error && err.message.includes("eSinetti-yhteyttä")
        ? "eSinetti-yhteyttä ei ole määritetty. Allekirjoitusta ei voi tehdä."
        : "Lähetys ei onnistunut. Yritä hetken kuluttua uudelleen.";
    return { message };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}`);
  revalidatePath(`/vuokrasuhteet/${tenancyId}/allekirjoitus`);
  return { sent: true };
}

/**
 * Alkukatselmuksen pöytäkirja omana kierroksenaan (Jukan päätös 10.10.2026).
 * Sopimus on jo lähetetty; pöytäkirja lähtee, kun katselmus on lukittu.
 */
export async function sendInspectionForSigningAction(
  _previous: SigningActionState,
  formData: FormData,
): Promise<SigningActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");

  try {
    const result = await sendInspectionForSigning(user.id, tenancyId);
    if (!result.ok) return { message: result.message };
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes("eSinetti-yhteyttä")
        ? "eSinetti-yhteyttä ei ole määritetty. Allekirjoitusta ei voi tehdä."
        : "Lähetys ei onnistunut. Yritä hetken kuluttua uudelleen.";
    return { message };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}`);
  revalidatePath(`/vuokrasuhteet/${tenancyId}/allekirjoitus`);
  revalidatePath(`/vuokrasuhteet/${tenancyId}/katselmus`);
  return { sent: true };
}

/** Loppukatselmuksen pöytäkirja allekirjoitettavaksi (CLAUDE.md 5.8). */
export async function sendFinalForSigningAction(
  _previous: SigningActionState,
  formData: FormData,
): Promise<SigningActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");

  try {
    const result = await sendFinalForSigning(user.id, tenancyId);
    if (!result.ok) return { message: result.message };
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes("eSinetti-yhteyttä")
        ? "eSinetti-yhteyttä ei ole määritetty. Allekirjoitusta ei voi tehdä."
        : "Lähetys ei onnistunut. Yritä hetken kuluttua uudelleen.";
    return { message };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}/paattyminen`);
  return { sent: true };
}

export interface SignNowResult {
  /** Upotettava eSinetin allekirjoitusosoite. Ei tallenneta eikä lokiteta. */
  url?: string;
  message?: string;
}

/**
 * "Allekirjoita nyt": vuokranantajan oma allekirjoitusosoite (10.10.2026).
 *
 * Kutsutaan napin painalluksesta, ei sivun latauksessa: linkki haetaan vasta
 * kun sitä tarvitaan, eikä se päädy sivun HTML:ään valmiiksi.
 */
export async function signNowAction(tenancyId: string, document: string): Promise<SignNowResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  if (document !== "sopimus" && document !== "katselmus") {
    return { message: SIGN_NOW_FALLBACK_MESSAGE };
  }

  try {
    const result = await landlordSigningUrl(user.id, String(tenancyId), document);
    return result.ok ? { url: result.url } : { message: result.message };
  } catch {
    return { message: SIGN_NOW_FALLBACK_MESSAGE };
  }
}
