import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getPropertyExpense } from "@/lib/db/expenses";
import { photoUrl } from "@/lib/db/inspections";
import { categoryInfo } from "@/lib/expenses/categories";
import { AppShell } from "@/components/AppShell";
import { PhotoCapture } from "@/components/PhotoCapture";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Kulu",
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
 * Yksi asunnon kulu ja sen kuitit (CLAUDE.md 5.7).
 *
 * Sivu on vain asunnon omistajalle: `getPropertyExpense` tekee
 * omistajatarkistuksen ja heittää muille. Vuokralainen saa saman 404:n kuin
 * ulkopuolinen, koska hänen ei kuulu tietää kulun olemassaolostakaan.
 */
export default async function PropertyExpensePage({
  params,
}: {
  params: Promise<{ id: string; kulu: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id, kulu } = await params;

  let expense;
  try {
    expense = await getPropertyExpense(user.id, id, kulu);
  } catch {
    notFound();
  }
  if (!expense) notFound();

  const receipts = await Promise.all(
    expense.receipts.map(async (receipt) => ({
      ...receipt,
      url: await photoUrl(receipt.storagePath),
    })),
  );

  return (
    <AppShell>
      <p className="text-sm text-ink/60">{categoryInfo(expense.category).label}</p>
      <h1 className="mt-1 text-2xl">{euro(expense.amount)}</h1>
      <p className="mt-2 text-sm text-ink/60">
        {päivä(expense.date)}
        {expense.km !== null ? ` · ${String(expense.km).replace(".", ",")} km` : ""}
        {expense.vatIncluded ? " · sis. alv" : " · alviton"}
      </p>

      {expense.description ? <p className="mt-4">{expense.description}</p> : null}

      <p className="mt-4 rounded-[var(--radius-panel)] border border-line bg-paper p-4 text-sm text-ink/70">
        Kulu ja kuitit näkyvät vain sinulle. Vuokralainen ei näe niitä missään.
      </p>

      <PhotoCapture endpoint={`/asunnot/${id}/kulut/${kulu}/kuitti`} label="Kuvaa kuitti" />

      {receipts.length > 0 ? (
        <div className="mt-6 flex flex-col gap-6">
          {receipts.map((receipt) => (
            <figure
              key={receipt.id}
              className="rounded-[var(--radius-panel)] border border-line bg-paper p-3"
            >
              {receipt.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- Signed URL vanhenee tunnissa, joten Next-optimointi ei sovi.
                <img src={receipt.url} alt="Kuitti" className="w-full rounded-[10px]" />
              ) : (
                <p className="p-4 text-sm text-ink/60">Kuittia ei juuri nyt saada näkyviin.</p>
              )}
            </figure>
          ))}
        </div>
      ) : null}

      <p className="mt-10 text-sm">
        <Link href={`/asunnot/${id}/kulut`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
