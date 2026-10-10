"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { fieldErrors } from "@/lib/forms/schema";
import { createExpense, createPropertyExpense } from "@/lib/db/expenses";
import { expenseSchema } from "@/lib/expenses/schema";

/**
 * Kulun kirjaus (CLAUDE.md 5.7).
 *
 * Omistajarajaus on datakerroksessa: kulut ovat vain asunnon omistajan, eikä
 * osapuoliasema riitä.
 */

export interface ExpenseActionState {
  errors: Record<string, string>;
  message?: string;
  savedId?: string;
}

/**
 * Kulu voi kuulua vuokrasuhteeseen tai pelkkään asuntoon.
 *
 * Asunnon remontti vuokralaisten välissä ei kuulu kenenkään vuokrasuhteeseen.
 * Lomake lähettää siksi joko `tenancyId`:n tai `propertyId`:n, ei molempia.
 */

function number(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim().replace(",", ".");
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createExpenseAction(
  _previous: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const propertyId = String(formData.get("propertyId") ?? "");

  const parsed = expenseSchema.safeParse({
    category: String(formData.get("category") ?? ""),
    date: String(formData.get("date") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    km: String(formData.get("km") ?? ""),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  if (!tenancyId && !propertyId) return { errors: {}, message: "Kohde puuttuu." };

  const entryId = String(formData.get("maintenanceEntryId") ?? "") || null;

  const input = {
    date: parsed.data.date,
    amount: number(formData.get("amount")),
    category: parsed.data.category,
    description: String(formData.get("description") ?? ""),
    km: number(formData.get("km")),
    vatIncluded: formData.get("vatIncluded") === "on",
    maintenanceEntryId: entryId,
  };

  try {
    const result = tenancyId
      ? await createExpense(user.id, tenancyId, input)
      : await createPropertyExpense(user.id, propertyId, input);

    if (!result.ok) return { errors: {}, message: result.message };

    if (tenancyId) {
      revalidatePath(`/vuokrasuhteet/${tenancyId}/kulut`);
      if (entryId) revalidatePath(`/vuokrasuhteet/${tenancyId}/huoltokirja/${entryId}`);
    } else {
      revalidatePath(`/asunnot/${propertyId}/kulut`);
      revalidatePath(`/asunnot/${propertyId}/verolaskelma`);
    }

    return { errors: {}, savedId: result.id };
  } catch {
    return { errors: {}, message: "Tallennus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }
}
