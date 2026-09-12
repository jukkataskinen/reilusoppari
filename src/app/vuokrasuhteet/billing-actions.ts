"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { startTenancyCheckout } from "@/lib/billing/checkout";

/**
 * Vuokrasuhteen maksu (CLAUDE.md 5.1, vaihe 5).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: vuokrasuhteen vuokranantaja. Tarkistus on
 *    `startTenancyCheckout`issa. Vuokralainen ei maksa koskaan.
 * 2. Henkilötieto: sähköposti kulkee Stripelle kuittia varten. Ei lokiteta.
 * 3. Syöte: vuokrasuhteen id ja suostumusruutu. Summaa EI oteta
 *    lomakkeesta — se laskettaisiin muuten selaimen kertomana.
 * 4. IDOR: vuokrasuhteen id lomakkeesta, omistajatarkistus datakerroksessa.
 * 5. Salaisuus: `STRIPE_SECRET_KEY` luetaan vain palvelimella.
 * 6. Epäonnistuminen: neutraali viesti.
 * 7. Lokitus: ei summia, ei sähköposteja.
 * ===========================================================================
 */

export interface BillingActionState {
  message?: string;
  /** Maksu hoitui ilman Stripeä (ilmainen, salkku tai krediitti). */
  paid?: boolean;
  reason?: string;
}

export async function payTenancyAction(
  _previous: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  if (!tenancyId) return { message: "Vuokrasuhde puuttuu." };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.reilusoppari.fi";

  const result = await startTenancyCheckout({
    userId: user.id,
    tenancyId,
    consentGiven: formData.get("consent") === "on",
    appUrl,
  });

  if (!result.ok) return { message: result.message };

  if (result.paid) {
    revalidatePath(`/vuokrasuhteet/${tenancyId}/allekirjoitus`);
    return { paid: true, reason: result.decision.reason };
  }

  /*
    Uudelleenohjaus Stripen sivulle tehdään palvelimella eikä palauteta
    osoitetta selaimelle avattavaksi: silloin osoite ei päädy sivun lähteeseen
    eikä selainlaajennuksien nähtäväksi. `redirect` heittää, joten mitään ei
    tule tämän jälkeen.
  */
  redirect(result.url);
}
