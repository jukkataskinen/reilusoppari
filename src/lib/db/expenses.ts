/**
 * Kulut ja kuitit (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * KULUT OVAT VAIN VUOKRANANTAJAN
 *
 * Vuokralainen ei näe kuluja eikä kuitteja — ei listassa, ei huoltokirjassa,
 * ei missään. Ne ovat vuokranantajan kirjanpitoa, eivät vuokrasuhteen
 * yhteistä tietoa, ja kuitissa voi olla hänen kotiosoitteensa, korttinsa
 * loppunumerot tai muun asunnon tietoja.
 *
 * Rajaus tehdään ASUNNON OMISTAJUUDEN kautta (`requireExpenseAccess`), ei
 * vuokrasuhteen osapuoliaseman: osapuoliasema koskee myös vuokralaista.
 * Tämä ero on koko tiedoston tärkein kohta.
 *
 * KUITTIKUVA EI OLE KATSELMUSKUVA
 *
 * Kuitti tallennetaan `rs_photos`-tauluun kuten muutkin kuvat, mutta sillä on
 * `expense_id` eikä `inspection_id`- tai `maintenance_entry_id`-viitettä.
 * Kaikki näkymät hakevat kuvat nimenomaan omalla viitteellään, joten kuitti
 * ei voi vahingossa päätyä pöytäkirjaan tai huoltokirjaan.
 * ===========================================================================
 */

import { getServiceClient } from "./supabase";
import { requireExpenseAccess } from "./access";
import { getTenancy } from "./tenancies";
import {
  isExpenseCategory,
  travelCost,
  type ExpenseCategory,
} from "../expenses/categories";

export interface ExpenseReceipt {
  id: string;
  storagePath: string;
  takenAtServer: string;
}

export interface Expense {
  id: string;
  propertyId: string;
  tenancyId: string | null;
  date: string;
  amount: number;
  category: ExpenseCategory;
  description: string | null;
  km: number | null;
  vatIncluded: boolean;
  receipts: ExpenseReceipt[];
}

export type ExpenseResult = { ok: true; id: string } | { ok: false; message: string };

export interface ExpenseInput {
  date: string;
  /** Euroa. Matkakuluissa jätetään tyhjäksi, jolloin se lasketaan kilometreistä. */
  amount: number | null;
  category: ExpenseCategory;
  description: string;
  km: number | null;
  vatIncluded: boolean;
  /** Huoltokirjan merkintä, jos kulu syntyi korjauksesta. */
  maintenanceEntryId?: string | null;
}

/**
 * Kirjaa kulun. Vain asunnon omistaja.
 *
 * Matkakuluissa summa lasketaan kilometreistä sen vuoden taksalla, jolle
 * kulu kirjataan — laskelma tehdään usein vasta seuraavana keväänä, eikä
 * silloin saa käyttää uutta taksaa vanhan vuoden ajoihin.
 */
export async function createExpense(
  userId: string,
  tenancyId: string,
  input: ExpenseInput,
): Promise<ExpenseResult> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy) return { ok: false, message: "Vuokrasuhdetta ei löytynyt." };

  // Omistajuus, ei osapuoliasema: vuokralainen on osapuoli muttei omistaja.
  await requireExpenseAccess(userId, tenancy.propertyId);

  if (!isExpenseCategory(input.category)) {
    return { ok: false, message: "Valitse kululuokka." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { ok: false, message: "Tarkista päivämäärä." };
  }

  const year = Number(input.date.slice(0, 4));

  let amount = input.amount;
  if (input.category === "matkat" && input.km !== null && amount === null) {
    amount = travelCost(input.km, year);
  }

  if (amount === null || Number.isNaN(amount) || amount <= 0) {
    return {
      ok: false,
      message:
        input.category === "matkat"
          ? "Anna kilometrit tai summa."
          : "Anna kulun summa euroina.",
    };
  }

  const { data, error } = await getServiceClient()
    .from("rs_expenses")
    .insert({
      property_id: tenancy.propertyId,
      tenancy_id: tenancyId,
      date: input.date,
      amount,
      vat_included: input.vatIncluded,
      category: input.category,
      description: input.description.trim().slice(0, 300) || null,
      km: input.km,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[kulut] kirjaus epäonnistui:", error?.message);
    throw new Error("Kulun tallennus epäonnistui.");
  }

  // Linkki huoltokirjan merkintään, jos kulu syntyi korjauksesta. Näin
  // vuosilaskelmasta näkee, mihin korjaukseen kulu liittyi.
  if (input.maintenanceEntryId) {
    await getServiceClient()
      .from("rs_maintenance_entries")
      .update({ expense_id: data.id, updated_at: new Date().toISOString() })
      .eq("id", input.maintenanceEntryId)
      .eq("tenancy_id", tenancyId);
  }

  return { ok: true, id: data.id };
}

interface ExpenseRow {
  id: string;
  property_id: string;
  tenancy_id: string | null;
  date: string;
  amount: string | number;
  vat_included: boolean;
  category: ExpenseCategory;
  description: string | null;
  km: string | number | null;
}

/**
 * Vuokrasuhteen kulut, uusin ensin. Vain asunnon omistajalle.
 *
 * Heittää, jos kutsuja ei omista asuntoa. Ei palauta tyhjää listaa: tyhjä
 * lista näyttäisi siltä, ettei kuluja ole, ja se olisi valhe.
 */
export async function listExpenses(userId: string, tenancyId: string): Promise<Expense[]> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy) throw new Error("Vuokrasuhdetta ei löytynyt.");

  await requireExpenseAccess(userId, tenancy.propertyId);

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("rs_expenses")
    .select("id, property_id, tenancy_id, date, amount, vat_included, category, description, km")
    .eq("tenancy_id", tenancyId)
    .order("date", { ascending: false });

  if (error) {
    console.error("[kulut] haku epäonnistui:", error.message);
    throw new Error("Kulujen haku epäonnistui.");
  }

  const rows = (data ?? []) as unknown as ExpenseRow[];
  if (rows.length === 0) return [];

  const { data: receipts } = await supabase
    .from("rs_photos")
    .select("id, expense_id, storage_path, taken_at_server")
    .in(
      "expense_id",
      rows.map((row) => row.id),
    );

  const byExpense = new Map<string, ExpenseReceipt[]>();
  for (const row of (receipts ?? []) as Array<{
    id: string;
    expense_id: string;
    storage_path: string;
    taken_at_server: string;
  }>) {
    const list = byExpense.get(row.expense_id) ?? [];
    list.push({ id: row.id, storagePath: row.storage_path, takenAtServer: row.taken_at_server });
    byExpense.set(row.expense_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    propertyId: row.property_id,
    tenancyId: row.tenancy_id,
    date: row.date,
    amount: Number(row.amount),
    category: row.category,
    description: row.description,
    km: row.km === null ? null : Number(row.km),
    vatIncluded: row.vat_included,
    receipts: byExpense.get(row.id) ?? [],
  }));
}

/** Yksi kulu, jos kutsuja omistaa asunnon. */
export async function getExpense(
  userId: string,
  tenancyId: string,
  expenseId: string,
): Promise<Expense | null> {
  const expenses = await listExpenses(userId, tenancyId);
  return expenses.find((expense) => expense.id === expenseId) ?? null;
}

/** Kirjaa kuitin kuvan. Kutsutaan kun tiedosto on jo Storagessa. */
export async function recordReceiptPhoto(input: {
  tenancyId: string;
  expenseId: string;
  uploaderUserId: string;
  storagePath: string;
  sha256: string;
  bytes: number;
  width: number | null;
  height: number | null;
}): Promise<{ id: string }> {
  const { data, error } = await getServiceClient()
    .from("rs_photos")
    .insert({
      tenancy_id: input.tenancyId,
      expense_id: input.expenseId,
      uploader_user_id: input.uploaderUserId,
      storage_path: input.storagePath,
      sha256: input.sha256,
      bytes: input.bytes,
      width: input.width,
      height: input.height,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[kulut] kuitin kirjaus epäonnistui:", error?.message);
    throw new Error("Kuitin tallennus epäonnistui.");
  }

  return { id: data.id };
}
