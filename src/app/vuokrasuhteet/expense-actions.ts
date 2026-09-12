"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createExpense } from "@/lib/db/expenses";
import { isExpenseCategory, type ExpenseCategory } from "@/lib/expenses/categories";

/**
 * Kulun kirjaus (CLAUDE.md 5.7).
 *
 * Omistajarajaus on datakerroksessa: kulut ovat vain asunnon omistajan, eikä
 * osapuoliasema riitä.
 */

export interface ExpenseActionState {
  message?: string;
  savedId?: string;
}

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
  const rawCategory = String(formData.get("category") ?? "");
  if (!isExpenseCategory(rawCategory)) return { message: "Valitse kululuokka." };

  const entryId = String(formData.get("maintenanceEntryId") ?? "") || null;

  try {
    const result = await createExpense(user.id, tenancyId, {
      date: String(formData.get("date") ?? ""),
      amount: number(formData.get("amount")),
      category: rawCategory as ExpenseCategory,
      description: String(formData.get("description") ?? ""),
      km: number(formData.get("km")),
      vatIncluded: formData.get("vatIncluded") === "on",
      maintenanceEntryId: entryId,
    });

    if (!result.ok) return { message: result.message };

    revalidatePath(`/vuokrasuhteet/${tenancyId}/kulut`);
    if (entryId) revalidatePath(`/vuokrasuhteet/${tenancyId}/huoltokirja/${entryId}`);

    return { savedId: result.id };
  } catch {
    return { message: "Tallennus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }
}
