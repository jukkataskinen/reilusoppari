import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { isUsingMockBilling } from "@/lib/billing";
import { portfolioView } from "@/lib/billing/portfolio";
import { formatPrice, TENANCY_PRICE_CENTS } from "@/lib/billing/pricing";
import { getBillingProfile, getPortfolioState } from "@/lib/db/billing";
import { AppShell } from "@/components/AppShell";
import { PortfolioPanel } from "@/components/PortfolioPanel";
import { PaymentReturnNotice } from "@/components/PaymentReturnNotice";
import { paymentReturnView, readPaymentReturn } from "@/lib/billing/return-state";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Laskutus",
  robots: { index: false, follow: false },
};

/**
 * Laskutus (CLAUDE.md kohta 2, 5.9).
 *
 * ===========================================================================
 * KÄYTTÄJÄN ON NÄHTÄVÄ, MITÄ HÄN MAKSAA
 *
 * Sivu kokoaa kolme asiaa: ilmaisen ensimmäisen tilan, suositteluedut ja
 * salkkutilauksen. Ne ovat eri mekanismeja mutta sama kysymys — mitä
 * seuraava vuokrasuhde maksaa minulle.
 *
 * Vuokralaiselle tämä sivu ei kerro mitään uutta: hän ei maksa koskaan.
 * Sivua ei silti piiloteta häneltä, koska sen lukeminen on paras tapa
 * varmistua siitä.
 * ===========================================================================
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ tilaus?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const [state, profile] = await Promise.all([
    getPortfolioState(user.id),
    getBillingProfile(user.id),
  ]);

  const view = portfolioView(state);

  // Paluu salkkutilauksen maksusivulta (`?tilaus=valmis` / `?tilaus=peruttu`).
  const paymentReturn = paymentReturnView({
    product: "portfolio",
    param: readPaymentReturn((await searchParams).tilaus),
    active: view.kind === "active",
  });

  return (
    <AppShell>
      <h1 className="text-2xl">Laskutus</h1>
      <p className="mt-2 text-ink/70">
        Vuokralainen ei maksa koskaan mitään. Nämä koskevat vain sinua vuokranantajana.
      </p>

      <PaymentReturnNotice view={paymentReturn} />

      {/* --- Mitä seuraava vuokrasuhde maksaa ------------------------------ */}

      <section className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <h2 className="font-medium">Seuraava vuokrasuhde</h2>

        {!profile.freeTenancyUsed ? (
          <p className="mt-2 text-lg">
            Ilmainen
            <span className="ml-2 text-sm text-ink/60">ensimmäinen vuokrasuhteesi</span>
          </p>
        ) : view.kind === "active" ? (
          <p className="mt-2 text-lg">
            Sisältyy salkkutilaukseen
            <span className="ml-2 text-sm text-ink/60">ei erillistä maksua</span>
          </p>
        ) : profile.availableCredits > 0 ? (
          <p className="mt-2 text-lg">
            Ilmainen
            <span className="ml-2 text-sm text-ink/60">
              suosittelueduilla ({profile.availableCredits} jäljellä)
            </span>
          </p>
        ) : (
          <p className="mt-2 text-lg">
            {formatPrice(TENANCY_PRICE_CENTS)}
            <span className="ml-2 text-sm text-ink/60">kertamaksu, sis. ALV 25,5 %</span>
          </p>
        )}

        <p className="mt-3 text-sm text-ink/70">
          Maksu tehdään vasta kun lähetät sopimuksen allekirjoitettavaksi — ei
          vuokrasuhdetta luotaessa.{" "}
          <Link href="/suosittele" className="underline underline-offset-4">
            Tuomalla kaverin
          </Link>{" "}
          saatte molemmat yhden vuokrasuhteen veloituksetta.
        </p>
      </section>

      {/* --- Salkku -------------------------------------------------------- */}

      {/* Käsittelyn aikana tilausnappia ei näytetä: se veloittaisi toisen kerran. */}
      {paymentReturn.kind === "processing" ? null : (
        <PortfolioPanel
          view={view}
          tenanciesLastYear={state.tenanciesLastYear}
          plusProperties={state.plusProperties}
          mockMode={isUsingMockBilling()}
        />
      )}

      <p className="mt-8 text-sm text-ink/60">
        Hinnat sisältävät arvonlisäveron. Kuitti tulee sähköpostiisi jokaisesta maksusta.
      </p>

      <p className="mt-8 text-sm">
        <Link href="/omat-tiedot" className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
