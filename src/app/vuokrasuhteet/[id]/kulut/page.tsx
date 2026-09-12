import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenancy } from "@/lib/db/tenancies";
import { listExpenses } from "@/lib/db/expenses";
import { categoryInfo } from "@/lib/expenses/categories";
import { AppShell } from "@/components/AppShell";
import { ExpenseForm } from "@/components/ExpenseForm";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Kulut",
  robots: { index: false, follow: false },
};

function euro(amount: number): string {
  return `${amount.toFixed(2).replace(".", ",")} €`;
}

function päivä(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${Number(day)}.${Number(month)}.${year}`;
}

/**
 * Vuokrasuhteen kulut (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * VAIN ASUNNON OMISTAJALLE
 *
 * Vuokralainen saa 404:n, ei "ei oikeutta" -sivua. Ero on olennainen: hänen
 * ei kuulu tietää, että sivu on olemassa, saati että kuluja on kirjattu.
 *
 * Yhteenveto on tässä tarkoituksella karkea. Varsinainen verolaskelma
 * luokitteluineen ja ohjeteksteineen on vaihe 4 (CLAUDE.md 5.7); tämä on
 * kuluja kerättäessä se näkymä, josta näkee mitä on kirjattu.
 * ===========================================================================
 */
export default async function ExpensesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const tenancy = await getTenancy(user.id, id);
  if (!tenancy) notFound();

  let expenses;
  try {
    expenses = await listExpenses(user.id, id);
  } catch {
    // Vuokralainen päätyy tänne: sama vastaus kuin ulkopuoliselle.
    notFound();
  }

  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell>
      <h1 className="text-2xl">Kulut</h1>
      <p className="mt-2 text-ink/70">
        Asuntoon kohdistuvat kulut ja kuitit talteen sitä mukaa kun niitä syntyy. Nämä eivät näy
        vuokralaiselle.
      </p>

      {expenses.length > 0 ? (
        <p className="mt-4 text-sm text-ink/60">
          {expenses.length} {expenses.length === 1 ? "kulu" : "kulua"} · yhteensä {euro(total)}
        </p>
      ) : null}

      <ExpenseForm tenancyId={id} defaultDate={today} />

      {expenses.length === 0 ? (
        <p className="mt-8 text-sm text-ink/60">Kuluja ei ole vielä kirjattu.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {expenses.map((expense) => (
            <li key={expense.id}>
              <Link
                href={`/vuokrasuhteet/${id}/kulut/${expense.id}`}
                className="block rounded-[var(--radius-panel)] border border-line bg-paper p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-medium">{euro(expense.amount)}</p>
                  <p className="text-sm text-ink/60">
                    {categoryInfo(expense.category).label} · {päivä(expense.date)}
                  </p>
                </div>
                {expense.description ? (
                  <p className="mt-1 text-sm text-ink/70">{expense.description}</p>
                ) : null}
                <p className="mt-1 text-sm text-ink/60">
                  {expense.receipts.length === 0
                    ? "Ei kuittia"
                    : `${expense.receipts.length} ${
                        expense.receipts.length === 1 ? "kuitti" : "kuittia"
                      }`}
                  {expense.km !== null ? ` · ${String(expense.km).replace(".", ",")} km` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-sm">
        <Link href={`/vuokrasuhteet/${id}`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
