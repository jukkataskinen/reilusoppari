import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { referralSummary } from "@/lib/db/referrals";
import { AppShell } from "@/components/AppShell";
import { CopyReferralLink } from "@/components/CopyReferralLink";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = { title: "Tuo kaveri" };

/**
 * Suosittelu (CLAUDE.md 5.9).
 *
 * ===========================================================================
 * MITÄ TÄLLÄ SIVULLA LUVATAAN JA MITÄ EI
 *
 * Krediitti syntyy vasta kun suositeltu vuokranantaja lähettää ensimmäisen
 * allekirjoituskierroksensa — ei rekisteröitymisestä. Se sanotaan tässä
 * suoraan, koska muuten sivu lupaisi enemmän kuin se antaa, ja odottava
 * krediitti, joka ei tule, on pahempi kuin ei lupausta lainkaan.
 *
 * Suositellun oma ensimmäinen vuokrasuhde on joka tapauksessa ilmainen.
 * Krediitti tulee hänen seuraavaansa.
 * ===========================================================================
 */
export default async function ReferralPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const summary = await referralSummary(user.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.reilusoppari.fi";
  const link = `${appUrl}/suosittelu/${summary.code}`;

  return (
    <AppShell>
      <h1 className="text-2xl">Tuo kaveri</h1>
      <p className="mt-2 text-ink/70">
        Kun tuomasi vuokranantaja lähettää ensimmäisen sopimuksensa allekirjoitettavaksi, saatte
        molemmat yhden vuokrasuhteen veloituksetta. Hänen ensimmäinen vuokrasuhteensa on
        muutenkin ilmainen, joten etu tulee seuraavaan.
      </p>

      <CopyReferralLink link={link} />

      <dl className="mt-8 grid grid-cols-3 gap-4 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <div>
          <dt className="text-sm text-ink/60">Kutsuttu</dt>
          <dd className="mt-0.5 text-xl">{summary.invited}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink/60">Aloittanut</dt>
          <dd className="mt-0.5 text-xl">{summary.completed}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink/60">Etuja jäljellä</dt>
          <dd className="mt-0.5 text-xl">{summary.availableCredits}</dd>
        </div>
      </dl>

      {summary.invited > summary.completed ? (
        <p className="mt-4 text-sm text-ink/70">
          {summary.invited - summary.completed === 1
            ? "Yksi kutsuttu ei ole vielä lähettänyt sopimusta allekirjoitettavaksi."
            : `${summary.invited - summary.completed} kutsuttua ei ole vielä lähettänyt sopimusta allekirjoitettavaksi.`}{" "}
          Etu syntyy vasta siinä kohdassa.
        </p>
      ) : null}

      <p className="mt-10 text-sm">
        <Link href="/vuokrasuhteet" className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
