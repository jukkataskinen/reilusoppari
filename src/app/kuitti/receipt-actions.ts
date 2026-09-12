"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { createPropertyExpense } from "@/lib/db/expenses";
import { isExpenseCategory } from "@/lib/expenses/categories";

/**
 * Kuitista kirjattu kulu (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: asunnon omistaja. Tarkistus on `createPropertyExpense`
 *    :ssa, joka heittää muille.
 * 2. Henkilötieto: summa ja myyjän nimi. Ei lokiteta.
 * 3. Syöte: kaikki kentät tarkistetaan datakerroksessa.
 * 4. IDOR: asunnon id tulee selaimesta, omistajatarkistus datakerroksessa.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: neutraali viesti.
 * 7. Lokitus: ei summia.
 *
 * TÄMÄ ON TAVALLINEN FUNKTIO, EI `useActionState`-TOIMINTO
 *
 * Kulku on kaksivaiheinen: ensin kirjataan kulu, sitten lähetetään kuitin
 * kuva sille. Jälkimmäinen tarvitsee ensimmäisen palauttaman tunnisteen,
 * joten selaimen on odotettava tulosta — `useActionState` antaisi sen vasta
 * uudelleenpiirron kautta, ja kuva olisi sillä välin vain muistissa.
 * ===========================================================================
 */

export interface SaveReceiptInput {
  propertyId: string;
  date: string;
  /** Euroa. Käyttäjän vahvistama, ei mallin lukema sellaisenaan. */
  amount: number;
  category: string;
  description: string;
}

export type SaveReceiptResult =
  | { ok: true; expenseId: string }
  | { ok: false; message: string };

export async function saveReceiptExpense(
  input: SaveReceiptInput,
): Promise<SaveReceiptResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Kirjautuminen vaaditaan." };

  if (!isExpenseCategory(input.category)) {
    return { ok: false, message: "Valitse kululuokka." };
  }

  try {
    const result = await createPropertyExpense(user.id, input.propertyId, {
      date: input.date,
      amount: input.amount,
      category: input.category,
      description: input.description,
      km: null,
      // Kuitilta luettu summa on verollinen loppusumma.
      vatIncluded: true,
    });

    if (!result.ok) return { ok: false, message: result.message };

    revalidatePath(`/asunnot/${input.propertyId}/kulut`);
    revalidatePath(`/asunnot/${input.propertyId}/verolaskelma`);

    return { ok: true, expenseId: result.id };
  } catch {
    return { ok: false, message: "Tallennus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }
}
