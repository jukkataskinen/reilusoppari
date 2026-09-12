"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { sealTaxReport } from "@/lib/tax/seal";

/**
 * Verolaskelman sinetöinti (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: asunnon omistaja. Tarkistus on datakerroksessa
 *    (`requireExpenseAccess`), ei tässä — vuokralainen on vuokrasuhteen
 *    osapuoli muttei näe kuluja eikä laskelmaa.
 * 2. Henkilötieto: vuokratulot ja kulut. Ei lokiteta.
 * 3. Syöte: asunnon id ja vuosi. Vuosi tarkistetaan luvuksi järkevältä
 *    väliltä, jottei sillä voi rakentaa outoja kyselyjä.
 * 4. IDOR: asunnon id lomakkeesta, omistajatarkistus datakerroksessa.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: neutraali viesti.
 * 7. Lokitus: ei summia eikä osoitteita.
 * ===========================================================================
 */

export interface TaxActionState {
  message?: string;
  done?: boolean;
}

/** Järkevä väli: sovellus ei ole olemassa ennen 2026, eikä laskelmaa tehdä tulevaisuuteen. */
function validYear(value: string): number | null {
  const year = Number(value);
  if (!Number.isInteger(year)) return null;
  if (year < 2020 || year > new Date().getFullYear()) return null;
  return year;
}

export async function sealTaxReportAction(
  _previous: TaxActionState,
  formData: FormData,
): Promise<TaxActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const propertyId = String(formData.get("propertyId") ?? "");
  const year = validYear(String(formData.get("year") ?? ""));

  if (!propertyId || year === null) return { message: "Vuosi puuttuu tai on virheellinen." };

  try {
    const result = await sealTaxReport(user.id, propertyId, year);
    if (!result.ok) return { message: result.message };
  } catch (err) {
    // `assertRealEsinetti` heittää, jos eSinetti on vielä mock. Se on
    // kehitysvaiheen tilanne eikä käyttäjän virhe, joten viesti sanoo sen
    // suoraan sen sijaan että väittäisi jotain menneen vikaan.
    const message =
      err instanceof Error && err.message.includes("eSinetti")
        ? "Sinetöinti ei ole vielä käytössä tässä ympäristössä."
        : "Sinetöinti ei onnistunut. Yritä hetken kuluttua uudelleen.";
    return { message };
  }

  revalidatePath(`/asunnot/${propertyId}/verolaskelma`);
  return { done: true };
}
