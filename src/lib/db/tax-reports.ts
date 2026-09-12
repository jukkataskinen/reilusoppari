/**
 * Verolaskelman tiedot ja tallennus (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * LASKELMA ON ASUNNON, EI VUOKRASUHTEEN
 *
 * Yhdessä vuodessa voi olla kaksi vuokralaista peräkkäin, ja hoitovastike
 * juoksee myös tyhjän kuukauden yli. Jos laskelma tehtäisiin vuokrasuhteesta,
 * vuokranantaja saisi kaksi puolikasta laskelmaa eikä yhtäkään, jonka voi
 * siirtää OmaVeroon.
 *
 * Siksi kaikki haut ovat asunnon kautta: kulut `property_id`:llä ja
 * vuokratulot asunnon KAIKKIEN vuokrasuhteiden kuittauksista.
 *
 * VAIN OMISTAJA
 *
 * `requireExpenseAccess` on omistajatarkistus, ei osapuolitarkistus.
 * Vuokralainen on vuokrasuhteen osapuoli muttei näe kuluja eikä laskelmaa —
 * tämä on sama raja kuin `expenses.ts`:ssä ja yhtä tärkeä.
 * ===========================================================================
 */

import { getServiceClient } from "./supabase";
import { requireExpenseAccess } from "./access";
import { isExpenseCategory } from "../expenses/categories";
import {
  buildTaxReport,
  type ReportConfirmation,
  type ReportExpense,
  type TaxReport,
} from "../tax/report";

export interface StoredTaxReport {
  id: string;
  year: number;
  sealedPath: string | null;
  sealedSha256: string | null;
  generatedAt: string | null;
}

/**
 * Kokoaa vuoden laskelman asunnon kirjauksista.
 *
 * Ei tallenna mitään: tätä kutsutaan myös esikatselussa, ja esikatselun pitää
 * voida olla väärä ilman että se jää mihinkään.
 */
export async function collectTaxReport(
  userId: string,
  propertyId: string,
  year: number,
): Promise<TaxReport> {
  await requireExpenseAccess(userId, propertyId);

  const supabase = getServiceClient();

  /*
    Vuoden rajaus tehdään kyselyssä eikä vasta laskennassa.

    Salkussa voi olla kymmenen vuoden kirjaukset, eikä niitä ole syytä siirtää
    verkon yli, jotta yksi vuosi suodatettaisiin muistissa. `buildTaxReport`
    suodattaa silti uudelleen — se on puhdas funktio, joka ei saa luottaa
    kutsujan rajaukseen.
  */
  const [{ data: expenseRows, error: expenseError }, { data: tenancyRows }] = await Promise.all([
    supabase
      .from("rs_expenses")
      .select("date, amount, category, km")
      .eq("property_id", propertyId)
      .gte("date", `${year}-01-01`)
      .lte("date", `${year}-12-31`),
    supabase.from("rs_tenancies").select("id").eq("property_id", propertyId),
  ]);

  if (expenseError) {
    console.error("[verolaskelma] kulujen haku epäonnistui:", expenseError.message);
    throw new Error("Kulujen haku epäonnistui.");
  }

  const tenancyIds = ((tenancyRows ?? []) as Array<{ id: string }>).map((row) => row.id);

  const confirmations = tenancyIds.length > 0 ? await incomeRows(tenancyIds, year) : [];

  const expenses: ReportExpense[] = (
    (expenseRows ?? []) as Array<{
      date: string;
      amount: number | string;
      category: string;
      km: number | string | null;
    }>
  )
    // Tuntematon luokka jätetään pois eikä sijoiteta "muuhun": luokka
    // ratkaisee, onko kulu vuosikulua, eikä arvaus saa siirtää summaa
    // väärään osioon.
    .filter((row) => isExpenseCategory(row.category))
    .map((row) => ({
      date: row.date,
      amount: Number(row.amount),
      category: row.category as ReportExpense["category"],
      km: row.km === null ? null : Number(row.km),
    }));

  return buildTaxReport(year, expenses, confirmations);
}

/** Vuokrakaudet kuittauksineen. Kuittaamaton kausi tulee mukaan nollana. */
async function incomeRows(tenancyIds: string[], year: number): Promise<ReportConfirmation[]> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("rs_rent_periods")
    .select("id, due_date, amount, rs_rent_confirmations(status, amount_paid)")
    .in("tenancy_id", tenancyIds)
    .gte("due_date", `${year}-01-01`)
    .lte("due_date", `${year}-12-31`);

  if (error) {
    console.error("[verolaskelma] vuokrakausien haku epäonnistui:", error.message);
    throw new Error("Vuokratietojen haku epäonnistui.");
  }

  return (
    (data ?? []) as unknown as Array<{
      due_date: string;
      amount: number | string;
      rs_rent_confirmations:
        | Array<{ status: string | null; amount_paid: number | string | null }>
        | { status: string | null; amount_paid: number | string | null }
        | null;
    }>
  ).map((row) => {
    // PostgREST palauttaa liitoksen taulukkona tai oliona sen mukaan, mitä se
    // päättelee suhteesta. Suhde on 1:1, joten kumpikin tarkoittaa samaa.
    const joined = Array.isArray(row.rs_rent_confirmations)
      ? (row.rs_rent_confirmations[0] ?? null)
      : row.rs_rent_confirmations;

    return {
      dueDate: row.due_date,
      amount: Number(row.amount),
      status: (joined?.status ?? null) as ReportConfirmation["status"],
      amountPaid: joined?.amount_paid === null || joined?.amount_paid === undefined
        ? null
        : Number(joined.amount_paid),
    };
  });
}

/** Vuodet, joilta asunnolla on jotain kirjattua. Uusin ensin. */
export async function taxYears(userId: string, propertyId: string): Promise<number[]> {
  await requireExpenseAccess(userId, propertyId);

  const supabase = getServiceClient();

  const [{ data: expenses }, { data: tenancies }] = await Promise.all([
    supabase.from("rs_expenses").select("date").eq("property_id", propertyId),
    supabase.from("rs_tenancies").select("id").eq("property_id", propertyId),
  ]);

  const years = new Set<number>();
  for (const row of (expenses ?? []) as Array<{ date: string }>) {
    years.add(Number(row.date.slice(0, 4)));
  }

  const tenancyIds = ((tenancies ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (tenancyIds.length > 0) {
    const { data: periods } = await supabase
      .from("rs_rent_periods")
      .select("due_date")
      .in("tenancy_id", tenancyIds);

    for (const row of (periods ?? []) as Array<{ due_date: string }>) {
      years.add(Number(row.due_date.slice(0, 4)));
    }
  }

  /*
    Kuluva vuosi on aina listalla.

    Muuten uusi vuosi puuttuisi näkymästä siihen asti, kunnes ensimmäinen
    kirjaus on tehty — ja juuri siinä kohdassa laskelmaa tullaan katsomaan,
    kun mietitään mitä pitäisi kirjata.
  */
  years.add(new Date().getFullYear());

  return [...years].sort((a, b) => b - a);
}

/** Tallennetut laskelmat. Sinetöity laskelma näkyy tässä `sealedPath`ineen. */
export async function listStoredReports(
  userId: string,
  propertyId: string,
): Promise<StoredTaxReport[]> {
  await requireExpenseAccess(userId, propertyId);

  const { data, error } = await getServiceClient()
    .from("rs_tax_reports")
    .select("id, year, sealed_path, sealed_sha256, generated_at")
    .eq("property_id", propertyId)
    .order("year", { ascending: false });

  if (error) {
    console.error("[verolaskelma] laskelmien haku epäonnistui:", error.message);
    throw new Error("Laskelmien haku epäonnistui.");
  }

  return (
    (data ?? []) as Array<{
      id: string;
      year: number;
      sealed_path: string | null;
      sealed_sha256: string | null;
      generated_at: string | null;
    }>
  ).map((row) => ({
    id: row.id,
    year: row.year,
    sealedPath: row.sealed_path,
    sealedSha256: row.sealed_sha256,
    generatedAt: row.generated_at,
  }));
}

/** Yhden vuoden tallennettu laskelma, jos se on tehty. */
export async function getStoredReport(
  userId: string,
  propertyId: string,
  year: number,
): Promise<StoredTaxReport | null> {
  const rows = await listStoredReports(userId, propertyId);
  return rows.find((row) => row.year === year) ?? null;
}

/** Kirjaa sinetöidyn laskelman. Kutsutaan vain `tax/seal.ts`:stä. */
export async function saveSealedReport(input: {
  propertyId: string;
  year: number;
  report: TaxReport;
  sealedPath: string;
  sealedSha256: string;
  now: Date;
}): Promise<void> {
  const timestamp = input.now.toISOString();

  const { error } = await getServiceClient()
    .from("rs_tax_reports")
    .upsert(
      {
        property_id: input.propertyId,
        year: input.year,
        lines: input.report.lines,
        rental_income: input.report.rentalIncome,
        total_expenses: input.report.annualExpenses,
        sealed_path: input.sealedPath,
        sealed_sha256: input.sealedSha256,
        generated_at: timestamp,
        updated_at: timestamp,
      },
      { onConflict: "property_id,year" },
    );

  if (error) {
    console.error("[verolaskelma] tallennus epäonnistui:", error.message);
    throw new Error("Laskelman tallennus epäonnistui.");
  }
}
