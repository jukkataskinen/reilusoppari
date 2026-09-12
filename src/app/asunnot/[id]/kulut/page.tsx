import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getProperty } from "@/lib/db/properties";
import { listPropertyExpenses } from "@/lib/db/expenses";
import { categoryInfo } from "@/lib/expenses/categories";
import { AppShell } from "@/components/AppShell";
import { ExpenseForm } from "@/components/ExpenseForm";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Asunnon kulut",
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
 * Asunnon kaikki kulut (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * KULU EI ODOTA VUOKRALAISTA
 *
 * Asunnon remontti vuokralaisten välissä, vakuutusmaksu tyhjältä
 * kuukaudelta, taloyhtiön erillislasku — nämä eivät kuulu kenenkään
 * vuokrasuhteeseen. Tältä sivulta ne voi kirjata ilman sellaista.
 *
 * Lista näyttää MYÖS vuokrasuhteisiin kirjatut kulut, koska ne ovat saman
 * asunnon kuluja ja verolaskelma kokoaa ne yhteen. Jos lista näyttäisi
 * vähemmän kuin laskelma, käyttäjä ei löytäisi riviä, jonka hän laskelmasta
 * näkee.
 *
 * TOISTUVAT KULUT EIVÄT OLE TÄSSÄ
 *
 * Hoitovastike on kausi eikä kirjaus, ja sillä on oma näkymänsä
 * (`toistuvat-kulut`). Jos ne olisivat samassa listassa, kausi näyttäisi
 * yhdeltä kirjaukselta ja lukija luulisi vastiketta kertamaksuksi.
 * ===========================================================================
 */
export default async function PropertyExpensesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const property = await getProperty(user.id, id);
  if (!property) notFound();

  const expenses = await listPropertyExpenses(user.id, id);
  const today = new Date().toISOString().slice(0, 10);
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <AppShell>
      <h1 className="text-2xl">Asunnon kulut</h1>
      <p className="mt-1 text-ink/70">{property.name ?? property.street}</p>

      <p className="mt-4 text-ink/70">
        Kertakulut: korjaukset, kalusteet, vakuutus, matkat. Kulu kuuluu asuntoon eikä
        vuokralaiseen, joten sen voi kirjata myös silloin, kun asunto on tyhjänä.
      </p>

      <p className="mt-3 text-sm text-ink/70">
        Kuukausittain toistuvat kulut, kuten hoitovastike, kirjataan{" "}
        <Link href={`/asunnot/${id}/toistuvat-kulut`} className="underline underline-offset-4">
          erikseen kerran
        </Link>
        . Kaikki kootaan samaan{" "}
        <Link href={`/asunnot/${id}/verolaskelma`} className="underline underline-offset-4">
          verolaskelmaan
        </Link>
        .
      </p>

      <ExpenseForm
        propertyId={id}
        defaultDate={today}
        prompt={{
          title: "Kirjaa kulu",
          body:
            "Kulut ja ajokilometrit kannattaa kirjata silloin, kun kuitti on vielä tallessa. " +
            "Ne näkyvät vain sinulle.",
          button: "Uusi kulu",
        }}
      />

      {expenses.length === 0 ? (
        <p className="mt-8 text-sm text-ink/60">Ei vielä kirjattuja kuluja.</p>
      ) : (
        <>
          <div className="mt-8 flex items-baseline justify-between">
            <h2 className="text-lg">Kirjatut kulut</h2>
            <span className="text-ink/70">{euro(total)}</span>
          </div>

          <ul className="mt-4 flex flex-col gap-3">
            {expenses.map((expense) => (
              <li
                key={expense.id}
                className="rounded-[var(--radius-panel)] border border-line bg-paper p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <Link
                    href={`/asunnot/${id}/kulut/${expense.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {categoryInfo(expense.category).label}
                  </Link>
                  <span className="font-medium">{euro(expense.amount)}</span>
                </div>

                <p className="mt-1 text-sm text-ink/60">
                  {päivä(expense.date)}
                  {expense.km ? ` · ${expense.km} km` : ""}
                  {expense.receipts.length > 0
                    ? ` · ${expense.receipts.length === 1 ? "kuitti" : `${expense.receipts.length} kuittia`}`
                    : ""}
                  {/*
                    Vuokrasuhteeseen kirjattu kulu merkitään, jottei lista
                    näytä siltä että kaikki on kirjattu täältä.
                  */}
                  {expense.tenancyId ? " · kirjattu vuokrasuhteeseen" : ""}
                </p>

                {expense.description ? (
                  <p className="mt-1 text-sm">{expense.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-10 text-sm">
        <Link href={`/asunnot/${id}`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
