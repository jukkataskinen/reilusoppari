import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getProperty } from "@/lib/db/properties";
import { collectTaxReport, listStoredReports, taxYears } from "@/lib/db/tax-reports";
import { CATEGORY_GUIDANCE, CLOSING_NOTE, DISCLAIMER } from "@content/tax-guidance.fi";
import { describeLine } from "@/documents/TaxReport";
import { isKmRateConfirmed, kmRate } from "@/lib/expenses/categories";
import { AppShell } from "@/components/AppShell";
import { SealTaxReport } from "@/components/SealTaxReport";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = { title: "Verolaskelma" };

function euro(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const hasCents = rounded % 1 !== 0;
  const [whole, cents] = rounded.toFixed(hasCents ? 2 : 0).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return cents ? `${grouped},${cents} €` : `${grouped} €`;
}

/**
 * Vuoden verolaskelma asunnolle (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * KAKSI SUMMAA ERILLÄÄN, MYÖS NÄYTÖLLÄ
 *
 * Sama sääntö kuin asiakirjassa: vuosikulut ja muut kirjaukset ovat eri
 * osioita, eikä missään ole lukua, jossa ne olisi laskettu yhteen. Rahastoitu
 * rahoitusvastike, perusparannus ja korot eivät ole vuosikuluja, ja jos ne
 * näyttäisivät saman taulukon riveiltä, näkymä johtaisi harhaan siinä
 * kohdassa, jossa virhe maksaa eniten.
 *
 * LASKELMA ON ASUNNON, EI VUOKRASUHTEEN
 *
 * Siksi tämä on asunnon alla eikä vuokrasuhteen: yhdessä vuodessa voi olla
 * kaksi vuokralaista peräkkäin, ja hoitovastike juoksee myös tyhjän
 * kuukauden yli.
 * ===========================================================================
 */
export default async function TaxReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vuosi?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const property = await getProperty(user.id, id);
  if (!property) notFound();

  const years = await taxYears(user.id, id);
  const wanted = Number((await searchParams).vuosi);
  const year = years.includes(wanted) ? wanted : (years[0] ?? new Date().getFullYear());

  const [report, stored] = await Promise.all([
    collectTaxReport(user.id, id, year),
    listStoredReports(user.id, id),
  ]);

  const annual = report.lines.filter((line) => line.deductibleAnnually);
  const other = report.lines.filter((line) => !line.deductibleAnnually);
  const sealed = stored.find((row) => row.year === year && row.sealedPath);
  const travel = report.lines.find((line) => line.category === "matkat");

  return (
    <AppShell>
      <h1 className="text-2xl">Verolaskelma {year}</h1>
      <p className="mt-1 text-ink/70">{property.name ?? property.street}</p>
      <p className="mt-3 text-sm text-ink/70">{DISCLAIMER}</p>

      {/* --- Vuoden valinta ------------------------------------------------ */}

      {years.length > 1 ? (
        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Verovuosi">
          {years.map((value) => (
            <Link
              key={value}
              href={`/asunnot/${id}/verolaskelma?vuosi=${value}`}
              className={
                "inline-flex min-h-[var(--size-touch)] items-center rounded-full border px-4 text-sm " +
                (value === year ? "border-ink bg-ink text-paper" : "border-line bg-paper")
              }
            >
              {value}
            </Link>
          ))}
        </nav>
      ) : null}

      {/* --- Vuokratulo ---------------------------------------------------- */}

      <section className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <h2 className="font-medium">Vuokratulo</h2>
        <p className="mt-2 text-2xl">{euro(report.rentalIncome)}</p>
        <p className="mt-1 text-sm text-ink/60">
          {report.incomeMonths === 1
            ? "Yhdeltä kuukaudelta"
            : `${report.incomeMonths} kuukaudelta`}
          , omista kuittauksistasi.
        </p>
        {/*
          Kuittaamaton kuukausi on nolla eikä oletus koko vuokrasta. Se
          sanotaan tässä ääneen, koska luku voi muuten näyttää liian pieneltä
          ilman että syy on nähtävissä.
        */}
        <p className="mt-2 text-sm text-ink/60">
          Kuukausi, jota et ole kuitannut, on laskelmassa nolla.{" "}
          <Link href={`/asunnot/${id}`} className="underline underline-offset-4">
            Tarkista kuittaukset
          </Link>{" "}
          jos luku näyttää väärältä.
        </p>
      </section>

      {/* --- Vuosikulut ---------------------------------------------------- */}

      <section className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <h2 className="font-medium">Vuosikuluina vähennettävät</h2>

        {/*
          Linkki toistuviin on tässä eikä vain asunnon sivulla: jos vastike
          puuttuu laskelmasta, sitä etsitään täältä.
        */}
        <p className="mt-1 text-sm text-ink/60">
          Kuukausittain toistuvat kulut, kuten hoitovastike, kirjataan{" "}
          <Link href={`/asunnot/${id}/toistuvat-kulut`} className="underline underline-offset-4">
            erikseen kerran
          </Link>
          , ja laskelma laskee vuosikulun niistä.
        </p>

        {annual.length === 0 ? (
          <p className="mt-2 text-sm text-ink/70">
            Tälle vuodelle ei ole kirjattu vuosikuluja.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {annual.map((line) => (
              <li key={line.category} className="border-b border-line pb-3 last:border-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span>{line.label}</span>
                  <span className="font-medium">{euro(line.total)}</span>
                </div>
                <p className="mt-0.5 text-sm text-ink/60">
                  {describeLine(line)}
                </p>
                {CATEGORY_GUIDANCE[line.category].note ? (
                  <p className="mt-1 text-sm text-ink/60">
                    {CATEGORY_GUIDANCE[line.category].note}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
          <span className="font-medium">Yhteensä</span>
          <span className="text-lg font-medium">{euro(report.annualExpenses)}</span>
        </div>
      </section>

      {/* --- Muut kirjaukset -----------------------------------------------
          Oma osionsa, oma summansa. Näitä ei lasketa vuosikuluihin. */}

      {other.length > 0 ? (
        <section className="mt-6 rounded-[var(--radius-panel)] border border-line bg-canvas p-5">
          <h2 className="font-medium">Muut kirjaukset</h2>
          <p className="mt-1 text-sm text-ink/70">
            Nämä eivät ole vuosikuluja, eikä niitä lasketa yllä olevaan summaan.
          </p>

          <ul className="mt-3 flex flex-col gap-3">
            {other.map((line) => (
              <li key={line.category} className="border-b border-line pb-3 last:border-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span>{line.label}</span>
                  <span className="font-medium">{euro(line.total)}</span>
                </div>
                <p className="mt-0.5 text-sm text-ink/60">
                  {describeLine(line)}
                </p>
                {CATEGORY_GUIDANCE[line.category].note ? (
                  <p className="mt-1 text-sm text-ink/60">
                    {CATEGORY_GUIDANCE[line.category].note}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
            <span className="font-medium">Yhteensä</span>
            <span className="text-lg font-medium">{euro(report.otherEntries)}</span>
          </div>
        </section>
      ) : null}

      {/* --- Tulos --------------------------------------------------------- */}

      <section className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-medium">Vuokratulo miinus vuosikulut</h2>
            <p className="mt-0.5 text-sm text-ink/60">
              {euro(report.rentalIncome)} − {euro(report.annualExpenses)}
            </p>
          </div>
          <span className="text-2xl">{euro(report.net)}</span>
        </div>
      </section>

      {/*
        Km-taksa on vuosittain päivitettävä (CLAUDE.md kohta 9.5). Jos vuoden
        taksaa ei ole vielä vahvistettu, se sanotaan — muuten matkakulut
        näyttäisivät lasketuilta luvulta, joka voi vielä muuttua.
      */}
      {travel && !isKmRateConfirmed(year) ? (
        <p className="mt-4 text-sm text-ink/70">
          Matkakulut on laskettu arviolla {kmRate(year)} € / km. Verohallinnon {year}-taksaa ei
          ole vielä vahvistettu tähän sovellukseen, joten luku voi vielä muuttua.
        </p>
      ) : null}

      {/* --- Laskelman tulostus -------------------------------------------- */}

      <SealTaxReport
        propertyId={id}
        year={year}
        sealedAt={sealed?.generatedAt ?? null}
        hasContent={report.lines.length > 0 || report.rentalIncome > 0}
      />

      <p className="mt-6 text-sm text-ink/70">{CLOSING_NOTE}</p>

      <p className="mt-8 text-sm">
        <Link href={`/asunnot/${id}`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
