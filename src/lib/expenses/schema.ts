/**
 * Kulun kirjauksen kenttäkohtaiset virheet (CLAUDE.md 5.7).
 *
 * `expense-actions.ts` on `"use server"`-tiedosto, joten skeema ei voi asua
 * siellä: Next sallii sellaisessa tiedostossa vain async-funktioiden
 * viennin.
 *
 * Rajan (<=0, puuttuva) tarkistus tehdään tässä, jotta virhe näkyy oikean
 * kentän vieressä. Matkakulussa kilometrit riittävät summan sijaan — sama
 * sääntö kuin `lib/db/expenses.ts`:ssä, joka pysyy lopullisena
 * tarkistuksena.
 */

import { z } from "zod";
import { isExpenseCategory, type ExpenseCategory } from "./categories";

export const expenseSchema = z
  .object({
    category: z
      .string()
      .refine(isExpenseCategory, { message: "Valitse kululuokka." })
      .transform((value) => value as ExpenseCategory),
    date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarkista päivämäärä."),
    amount: z.string(),
    km: z.string(),
  })
  .superRefine((value, ctx) => {
    const amount =
      value.amount.trim() === "" ? null : Number(value.amount.trim().replace(",", "."));
    const km = value.km.trim() === "" ? null : Number(value.km.trim().replace(",", "."));

    if (value.category === "matkat") {
      const hasAmount = amount !== null && Number.isFinite(amount) && amount > 0;
      const hasKm = km !== null && Number.isFinite(km) && km > 0;
      if (!hasAmount && !hasKm) {
        ctx.addIssue({ code: "custom", path: ["km"], message: "Anna kilometrit tai summa." });
      }
    } else if (amount === null || !Number.isFinite(amount) || amount <= 0) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Anna kulun summa euroina." });
    }
  });
