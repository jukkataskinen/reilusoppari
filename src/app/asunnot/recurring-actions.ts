"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import {
  changeRecurringAmount,
  endRecurringExpense,
  startRecurringExpense,
} from "@/lib/db/recurring-expenses";

/**
 * Toistuvat kuukausikulut (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: asunnon omistaja. Tarkistus on datakerroksessa
 *    (`requireExpenseAccess`) — vuokralainen ei näe kuluja lainkaan.
 * 2. Henkilötieto: ei mitään. Kuukausisumma ja kuukausi.
 * 3. Syöte: summa luvuksi, kuukausi muotoon `YYYY-MM`. Molemmat
 *    tarkistetaan datakerroksessa, joka on ainoa kirjoittaja.
 * 4. IDOR: asunnon ja sarjan id lomakkeesta; kysely rajataan molempiin,
 *    joten toisen asunnon sarjaa ei voi muuttaa omansa kautta.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: neutraali viesti.
 * 7. Lokitus: ei summia.
 *
 * SUMMA LUETAAN PILKULLA TAI PISTEELLÄ
 *
 * Suomeksi desimaalierotin on pilkku, ja puhelimen näppäimistö tarjoaa
 * sitä. Jos vain piste kelpaisi, "245,50" muuttuisi hiljaisesti NaN:ksi ja
 * käyttäjä saisi virheilmoituksen summasta, jonka hän kirjoitti oikein.
 * ===========================================================================
 */

export interface RecurringActionState {
  message?: string;
  done?: boolean;
}

/** `245,50` tai `245.50` → `245.5`. `NaN`, jos kenttä ei ole luku. */
function readAmount(value: FormDataEntryValue | null): number {
  return Number(String(value ?? "").replace(",", ".").trim());
}

export async function startRecurringAction(
  _previous: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) return { message: "Asunto puuttuu." };

  const result = await startRecurringExpense({
    userId: user.id,
    propertyId,
    category: String(formData.get("category") ?? ""),
    description: String(formData.get("description") ?? ""),
    monthlyAmount: readAmount(formData.get("monthlyAmount")),
    startsMonth: String(formData.get("startsMonth") ?? ""),
  });

  if (!result.ok) return { message: result.message };

  revalidatePath(`/asunnot/${propertyId}/toistuvat-kulut`);
  revalidatePath(`/asunnot/${propertyId}/verolaskelma`);
  return { done: true };
}

export async function changeRecurringAction(
  _previous: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const propertyId = String(formData.get("propertyId") ?? "");
  const seriesId = String(formData.get("seriesId") ?? "");
  if (!propertyId || !seriesId) return { message: "Kulua ei löytynyt." };

  const result = await changeRecurringAmount({
    userId: user.id,
    propertyId,
    seriesId,
    monthlyAmount: readAmount(formData.get("monthlyAmount")),
    fromMonth: String(formData.get("fromMonth") ?? ""),
  });

  if (!result.ok) return { message: result.message };

  revalidatePath(`/asunnot/${propertyId}/toistuvat-kulut`);
  revalidatePath(`/asunnot/${propertyId}/verolaskelma`);
  return { done: true };
}

export async function endRecurringAction(
  _previous: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const propertyId = String(formData.get("propertyId") ?? "");
  const seriesId = String(formData.get("seriesId") ?? "");
  if (!propertyId || !seriesId) return { message: "Kulua ei löytynyt." };

  const result = await endRecurringExpense({
    userId: user.id,
    propertyId,
    seriesId,
    lastMonth: String(formData.get("lastMonth") ?? ""),
  });

  if (!result.ok) return { message: result.message };

  revalidatePath(`/asunnot/${propertyId}/toistuvat-kulut`);
  revalidatePath(`/asunnot/${propertyId}/verolaskelma`);
  return { done: true };
}
