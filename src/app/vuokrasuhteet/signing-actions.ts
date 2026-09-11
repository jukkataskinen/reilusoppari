"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { sendForSigning } from "@/lib/tenancy/signing";

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
