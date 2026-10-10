import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenancy } from "@/lib/db/tenancies";
import { findInspection } from "@/lib/db/inspections";
import {
  inspectionSigningReadiness,
  inspectionSigningStatus,
  signingReadiness,
  signingStatus,
} from "@/lib/tenancy/signing";
import { includeInspectionWithContract } from "@/lib/tenancy/signing-plan";
import { canSignNow } from "@/lib/tenancy/sign-now";
import { esinettiOrigin } from "@/lib/esinetti/signing-link";
import { isUsingMockEsinetti, type Round } from "@/lib/esinetti";
import { isUsingMockBilling } from "@/lib/billing";
import { quoteTenancy } from "@/lib/billing/checkout";
import { formatPrice, requiresPayment } from "@/lib/billing/pricing";
import { getTenancyBillingState } from "@/lib/db/billing";
import { AppShell } from "@/components/AppShell";
import { InspectionSigning } from "@/components/InspectionSigning";
import { SendForSigning } from "@/components/SendForSigning";
import { SignNow } from "@/components/SignNow";
import { SignedDocuments } from "@/components/SignedDocuments";
import {
  loadSignedDocumentFacts,
  shouldOfferFetch,
  signedDocumentList,
} from "@/lib/tenancy/signed-documents";
import { TenancyPayment } from "@/components/TenancyPayment";
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

function SignerList({ round }: { round: Round }) {
  return (
    <ul className="mt-5 flex flex-col gap-3">
      {round.signers.map((signer) => (
        <li key={signer.id} className="flex items-baseline justify-between gap-4">
          <span>
            {signer.name}
            {signer.roleLabel ? <span className="text-ink/60"> · {signer.roleLabel}</span> : null}
          </span>
          <span className="shrink-0 text-sm text-ink/60">
            {SIGNER_STATUS[signer.status] ?? signer.status}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Allekirjoitus: sopimus heti, alkukatselmuksen pöytäkirja erikseen
 * (CLAUDE.md 5.4, Jukan päätös 10.10.2026).
 *
 * ===========================================================================
 * TILA LUETAAN eSINETILTÄ, EI ARVATA OMASTA KANNASTA
 *
 * Kuka on avannut, kuka tunnistautunut ja kuka allekirjoittanut — kaikki
 * tulee eSinetiltä sivua ladattaessa. Oma kanta päivittyy vasta
 * `round.completed`-webhookista, koska vain se muuttaa vuokrasuhteen tilaa.
 *
 * KAKSI KIERROSTA, YKSI SIVU
 *
 * Sopimus ja pöytäkirja ovat omissa osioissaan. Jos pöytäkirja lähti
 * sopimuksen mukana, toista osiota ei näytetä: sama kierros kahdesti
 * näyttäisi siltä, että allekirjoitettavaa on kaksi kertaa.
 * ===========================================================================
 */
export default async function SigningPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const tenancy = await getTenancy(user.id, id);
  if (!tenancy) notFound();

  const isLandlord = tenancy.landlordUserId === user.id;
  const [readiness, round, billing, inspection, inspectionRound, inspectionReadiness] =
    await Promise.all([
      signingReadiness(user.id, id),
      signingStatus(user.id, id),
      getTenancyBillingState(id),
      findInspection(user.id, id, "initial"),
      inspectionSigningStatus(user.id, id),
      inspectionSigningReadiness(user.id, id),
    ]);

  /*
    Hinta lasketaan vain, jos maksua ei ole vielä tehty ja kierros on vielä
    lähettämättä. Maksetun vuokrasuhteen kohdalla hinnan näyttäminen olisi
    hämmentävää — ja hinta voi muuttua, koska ilmainen ensimmäinen ja
    krediitit kuluvat.
  */
  const quote = isLandlord && !billing?.paidVia && !round ? await quoteTenancy(user.id, id) : null;

  // Lähtikö pöytäkirja sopimuksen mukana? Silloin molemmilla on sama kierros.
  const combined = Boolean(round && inspection?.esinettiRoundId === round.id);
  const inspectionSigned = inspection?.status === "signed";

  // "Allekirjoita nyt" vain vuokranantajalle, joka ei ole vielä allekirjoittanut.
  const [signNowContract, signNowInspection] = await Promise.all([
    round ? canSignNow(user.id, id, round) : Promise.resolve(false),
    inspectionRound ? canSignNow(user.id, id, inspectionRound) : Promise.resolve(false),
  ]);
  const origin = esinettiOrigin();

  // Valmiit asiakirjat avataan täältä, ei eSinetistä (10.10.2026).
  const documentFacts = await loadSignedDocumentFacts(user.id, id);
  const offerFetch = await shouldOfferFetch(user.id, id, documentFacts);
  const contractSigned = Boolean(documentFacts.find((row) => row.kind === "sopimus")?.signedAt);

  return (
    <AppShell>
      <h1 className="text-2xl">Allekirjoitus</h1>
      <p className="mt-2 text-ink/70">
        Vuokrasopimus allekirjoitetaan heti, kun osapuolten tiedot ovat valmiit. Alkukatselmuksen
        pöytäkirja allekirjoitetaan erikseen muuton yhteydessä, viimeistään 14 päivän kuluessa
        vuokrasuhteen alkamisesta. Jos katselmus on jo lukittu, molemmat allekirjoitetaan
        kerralla.
      </p>

      {isUsingMockEsinetti() ? (
        <p className="mt-6 rounded-[var(--radius-panel)] border border-coral bg-paper p-5 text-sm">
          eSinetti-yhteyttä ei ole määritetty, joten allekirjoitus on harjoittelutilassa. Kukaan
          ei allekirjoita mitään oikeasti.
        </p>
      ) : null}

      <SignedDocuments
        tenancyId={id}
        documents={signedDocumentList(documentFacts)}
        showFetch={offerFetch}
      />

      <h2 className="mt-8 text-lg">Vuokrasopimus</h2>

      {quote ? (
        <>
          {isUsingMockBilling() ? (
            <p className="mt-4 rounded-[var(--radius-panel)] border border-coral bg-paper p-5 text-sm">
              Stripe-yhteyttä ei ole määritetty, joten maksaminen on harjoittelutilassa. Mitään
              ei veloiteta.
            </p>
          ) : null}

          <TenancyPayment
            tenancyId={id}
            price={requiresPayment(quote) ? formatPrice(quote.amountCents) : null}
            free={quote.reason}
          />
        </>
      ) : null}

      {round ? (
        <div className="mt-4 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <p className="font-medium">
            {contractSigned
              ? combined
                ? "Sopimus ja alkukatselmuksen pöytäkirja on allekirjoitettu"
                : "Sopimus on allekirjoitettu"
              : combined
                ? "Sopimus ja alkukatselmuksen pöytäkirja on lähetetty allekirjoitettavaksi"
                : "Sopimus on lähetetty allekirjoitettavaksi"}
          </p>
          <p className="mt-2 text-sm text-ink/70">
            {contractSigned
              ? "Allekirjoitettu asiakirja on ylempänä kohdassa Allekirjoitetut asiakirjat."
              : "Jokainen allekirjoittaja on saanut oman linkkinsä sähköpostiinsa. Kun kaikki ovat allekirjoittaneet, vuokrasuhde alkaa ja vuokrakaudet syntyvät automaattisesti."}
          </p>
          {signNowContract ? <SignNow tenancyId={id} kind="sopimus" esinettiOrigin={origin} /> : null}
          <SignerList round={round} />
        </div>
      ) : isLandlord ? (
        <SendForSigning
          tenancyId={id}
          ready={readiness.ready}
          message={readiness.ready ? null : readiness.message}
          missing={readiness.ready ? [] : (readiness.missing ?? [])}
          withInspection={includeInspectionWithContract(inspection)}
        />
      ) : (
        <div className="mt-4 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <p className="font-medium">Odottaa vuokranantajaa</p>
          <p className="mt-2 text-sm text-ink/70">
            Vuokranantaja lähettää sopimuksen allekirjoitettavaksi. Saat oman linkkisi
            sähköpostiisi.
          </p>
        </div>
      )}

      {/* Pöytäkirjan osio vain, kun sillä on tai tulee oma kierros. */}
      {round && !combined ? (
        <>
          <h2 className="mt-10 text-lg">Alkukatselmuksen pöytäkirja</h2>
          {inspectionSigned ? (
            <div className="mt-4 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
              <p className="font-medium">Pöytäkirja on allekirjoitettu</p>
            </div>
          ) : inspectionRound ? (
            <div className="mt-4 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
              <p className="font-medium">Pöytäkirja on lähetetty allekirjoitettavaksi</p>
              <p className="mt-2 text-sm text-ink/70">
                Jokainen allekirjoittaja on saanut oman linkkinsä sähköpostiinsa.
              </p>
              {signNowInspection ? (
                <SignNow tenancyId={id} kind="katselmus" esinettiOrigin={origin} />
              ) : null}
              <SignerList round={inspectionRound} />
            </div>
          ) : isLandlord ? (
            <InspectionSigning
              tenancyId={id}
              ready={inspectionReadiness.ready}
              message={inspectionReadiness.ready ? null : inspectionReadiness.message}
              showInspectionLink={
                !inspectionReadiness.ready && inspectionReadiness.reason === "inspection_not_locked"
              }
            />
          ) : (
            <div className="mt-4 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
              <p className="text-sm text-ink/70">
                Kun alkukatselmus on lukittu, vuokranantaja lähettää pöytäkirjan
                allekirjoitettavaksi. Saat oman linkkisi sähköpostiisi.
              </p>
            </div>
          )}
        </>
      ) : null}

      <p className="mt-10 text-sm">
        <Link href={`/vuokrasuhteet/${id}`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
