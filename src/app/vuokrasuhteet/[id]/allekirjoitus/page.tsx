import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenancy } from "@/lib/db/tenancies";
import { signingReadiness, signingStatus } from "@/lib/tenancy/signing";
import { isUsingMockEsinetti } from "@/lib/esinetti";
import { AppShell } from "@/components/AppShell";
import { SendForSigning } from "@/components/SendForSigning";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Allekirjoitus",
  robots: { index: false, follow: false },
};

const SIGNER_STATUS: Record<string, string> = {
  pending: "Ei ole vielä avannut",
  opened: "On avannut asiakirjat",
  identified: "On tunnistautunut",
  signed: "On allekirjoittanut",
  declined: "On kieltäytynyt",
};

/**
 * Allekirjoituskierros (CLAUDE.md 5.4).
 *
 * ===========================================================================
 * TILA LUETAAN eSINETILTÄ, EI ARVATA OMASTA KANNASTA
 *
 * Kuka on avannut, kuka tunnistautunut ja kuka allekirjoittanut — kaikki
 * tulee eSinetiltä sivua ladattaessa. Oma kanta päivittyy vasta
 * `round.completed`-webhookista, koska vain se muuttaa vuokrasuhteen tilaa.
 *
 * Vaihtoehto olisi ollut peilata jokainen välitapahtuma omaan kantaan. Se
 * tarkoittaisi kahta totuutta, jotka voivat erota — ja erimielisyys siitä,
 * kuka on allekirjoittanut, on pahin paikka kahdelle totuudelle.
 * ===========================================================================
 */
export default async function SigningPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const tenancy = await getTenancy(user.id, id);
  if (!tenancy) notFound();

  const isLandlord = tenancy.landlordUserId === user.id;
  const [readiness, round] = await Promise.all([
    signingReadiness(user.id, id),
    signingStatus(user.id, id),
  ]);

  return (
    <AppShell>
      <h1 className="text-2xl">Allekirjoitus</h1>
      <p className="mt-2 text-ink/70">
        Vuokrasopimus ja alkukatselmuksen pöytäkirja allekirjoitetaan yhdessä, yhdellä
        tunnistautumisella. Ne kuuluvat yhteen: sopimus kertoo mistä sovittiin, pöytäkirja missä
        kunnossa koti oli silloin.
      </p>

      {isUsingMockEsinetti() ? (
        <p className="mt-6 rounded-[var(--radius-panel)] border border-coral bg-paper p-5 text-sm">
          eSinetti-yhteyttä ei ole määritetty, joten allekirjoitus on harjoittelutilassa. Kukaan
          ei allekirjoita mitään oikeasti.
        </p>
      ) : null}

      {round ? (
        <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <p className="font-medium">Asiakirjat on lähetetty allekirjoitettavaksi</p>
          <p className="mt-2 text-sm text-ink/70">
            Jokainen allekirjoittaja on saanut oman linkkinsä sähköpostiinsa. Kun kaikki ovat
            allekirjoittaneet, vuokrasuhde alkaa ja vuokrakaudet syntyvät automaattisesti.
          </p>

          <ul className="mt-5 flex flex-col gap-3">
            {round.signers.map((signer) => (
              <li key={signer.id} className="flex items-baseline justify-between gap-4">
                <span>
                  {signer.name}
                  {signer.roleLabel ? (
                    <span className="text-ink/60"> · {signer.roleLabel}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-sm text-ink/60">
                  {SIGNER_STATUS[signer.status] ?? signer.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : isLandlord ? (
        <SendForSigning
          tenancyId={id}
          ready={readiness.ready}
          message={readiness.ready ? null : readiness.message}
          missing={readiness.ready ? [] : (readiness.missing ?? [])}
        />
      ) : (
        <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <p className="font-medium">Odottaa vuokranantajaa</p>
          <p className="mt-2 text-sm text-ink/70">
            Vuokranantaja lähettää asiakirjat allekirjoitettavaksi, kun katselmus on lukittu.
            Saat oman linkkisi sähköpostiisi.
          </p>
        </div>
      )}

      <p className="mt-10 text-sm">
        <Link href={`/vuokrasuhteet/${id}`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
