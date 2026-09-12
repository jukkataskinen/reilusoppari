import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getProperty } from "@/lib/db/properties";
import { groupIntoSeries, listRecurringExpenses } from "@/lib/db/recurring-expenses";
import { currentMonth, seriesProblems } from "@/lib/expenses/recurring";
import { AppShell } from "@/components/AppShell";
import { RecurringExpenses } from "@/components/RecurringExpenses";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = { title: "Toistuvat kulut" };

/**
 * Asunnon toistuvat kuukausikulut (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * KULU ON ASUNNON, EI VUOKRASUHTEEN
 *
 * Siksi tämä on asunnon alla. Hoitovastike juoksee myös tyhjän kuukauden yli,
 * ja vuokralainen voi vaihtua kesken vuoden — vuokrasuhteeseen sidottu
 * toistuva kulu katkeaisi vaihdon kohdalla ilman että kukaan huomaa.
 *
 * SYÖTETÄÄN KERRAN, LASKETAAN AUTOMAATTISESTI
 *
 * Kuukausisumma ja alkukuukausi riittävät. Vuosikulu lasketaan siitä, eikä
 * kahtatoista kirjausta vuodessa tarvita — jokainen niistä olisi tilaisuus
 * unohtaa yksi, eikä unohdus näkyisi laskelmassa virheenä.
 * ===========================================================================
 */
export default async function RecurringExpensesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const property = await getProperty(user.id, id);
  if (!property) notFound();

  const periods = await listRecurringExpenses(user.id, id);
  const now = currentMonth();
  const series = groupIntoSeries(periods, now);

  /*
    Eheystarkistus näytetään käyttäjälle.

    Päällekkäinen kausi laskisi saman kuukauden kahdesti ja aukko jättäisi
    kuukauden laskematta. Kumpikaan ei näy laskelmassa virheenä — vain
    väärinä lukuina. Siksi ongelma kerrotaan siinä näkymässä, jossa sen voi
    korjata.
  */
  const problems = series.flatMap((item) => seriesProblems(item.periods));

  return (
    <AppShell>
      <h1 className="text-2xl">Toistuvat kulut</h1>
      <p className="mt-1 text-ink/70">{property.name ?? property.street}</p>

      <p className="mt-4 text-ink/70">
        Kuukausittain toistuva kulu kirjataan kerran: kuukausisumma ja mistä kuukaudesta alkaen.
        Verolaskelma laskee vuosikulun siitä. Kun summa muuttuu, kirjaat uuden summan muutoksen
        kuukaudesta — alkuvuosi lasketaan edelleen vanhalla.
      </p>

      <p className="mt-3 text-sm text-ink/70">
        Nämä kulut ovat asunnon, eivät vuokralaisen. Ne jatkuvat myös tyhjien kuukausien yli ja
        vuokralaisen vaihtuessa.
      </p>

      {problems.length > 0 ? (
        <div className="mt-6 rounded-[var(--radius-panel)] border border-coral bg-paper p-5">
          <p className="font-medium">Tarkista nämä</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-ink/70">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-ink/70">
            Päällekkäinen kausi laskee saman kuukauden kahdesti ja aukko jättää kuukauden
            laskematta. Kumpikaan ei näy laskelmassa virheenä, vain väärinä lukuina.
          </p>
        </div>
      ) : null}

      {series.length === 0 ? (
        <p className="mt-6 text-sm text-ink/60">
          Ei vielä toistuvia kuluja. Hoitovastike on tavallisin: kirjaa se kerran, niin se on
          mukana jokaisessa vuosilaskelmassa.
        </p>
      ) : null}

      <RecurringExpenses propertyId={id} series={series} now={now} />

      <p className="mt-10 text-sm">
        <Link href={`/asunnot/${id}`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
