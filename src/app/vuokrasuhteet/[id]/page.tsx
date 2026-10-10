import { readPaymentReturn } from "@/lib/billing/return-state";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { getProperty } from "@/lib/db/properties";
import { getTenancy, getTenancyDeletionFacts, listParties } from "@/lib/db/tenancies";
import {
  isSelfJoined,
  TENANCY_DELETION_MESSAGES,
  tenancyDeletionBlocker,
} from "@/lib/tenancy/invite-management";
import { formatAddress } from "@/lib/property/schema";
import {
  loadSignedDocumentFacts,
  shouldOfferFetch,
  signedDocumentList,
} from "@/lib/tenancy/signed-documents";
import { loadTenancyOverview } from "@/lib/tenancy/overview";
import {
  defectRowText,
  isContractSigned,
  nextStep,
  PHASE_STATUS_LABEL,
  rentRowText,
  tenancyPhases,
  type NextStep,
  type Phase,
  type PhaseStatus,
  type StepTone,
} from "@/lib/tenancy/next-step";
import { formatFinnishDate } from "@/lib/inspection/deadline";
import { SignedDocuments } from "@/components/SignedDocuments";
import { EndOfTenancyNotice } from "@/components/EndOfTenancyNotice";
import { InviteRow } from "./InviteRow";
import { DeleteTenancy } from "./DeleteTenancy";
import { AppShell } from "@/components/AppShell";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = { title: "Vuokrasuhde" };

function formatDate(value: string | null): string {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${Number(day)}.${Number(month)}.${year}`;
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR" }).format(value);
}

/*
  Värit kertovat tilan, mutta eivät koskaan yksin: jokaisella merkillä on
  rinnallaan sana (valmis, kesken, myöhässä, tulossa). Coral vain silloin,
  kun jokin on myöhässä.
*/
const PHASE_DOT: Record<PhaseStatus, string> = {
  done: "bg-moss border-moss text-paper",
  current: "bg-amber border-amber text-ink",
  overdue: "bg-coral border-coral text-paper",
  upcoming: "bg-paper border-line text-ink/60",
  missed: "bg-paper border-ink/40 text-ink/60",
};

const TONE_LABEL: Record<StepTone, string> = {
  action: "Sinun vuorosi",
  overdue: "Myöhässä",
  waiting: "Odottaa toista",
  done: "Kaikki kunnossa",
};

const TONE_DOT: Record<StepTone, string> = {
  action: "bg-sky",
  overdue: "bg-coral",
  waiting: "bg-amber",
  done: "bg-moss",
};

function stepHref(tenancyId: string, path: string): string {
  return path.startsWith("#") ? path : `/vuokrasuhteet/${tenancyId}/${path}`;
}

/** Seuraavaksi: täsmälleen yksi tehtävä, syy ja määräaika. */
function NextStepCard({ tenancyId, step }: { tenancyId: string; step: NextStep }) {
  return (
    <section
      aria-labelledby="seuraavaksi"
      className={
        "mt-6 rounded-[var(--radius-panel)] border-2 bg-paper p-5 " +
        (step.tone === "overdue" ? "border-coral" : "border-ink/15")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="seuraavaksi" className="text-sm font-medium text-ink/70">
          Seuraavaksi
        </h2>
        <span className="inline-flex items-center gap-1.5 text-sm text-ink/70">
          <span aria-hidden="true" className={"h-2.5 w-2.5 rounded-full " + TONE_DOT[step.tone]} />
          {TONE_LABEL[step.tone]}
        </span>
      </div>
      <p className="mt-2 text-xl font-medium">{step.title}</p>
      <p className="mt-1.5 text-ink/80">{step.reason}</p>
      {step.deadline && step.tone !== "overdue" ? (
        <p className="mt-1.5 text-sm text-ink/70">Määräaika {formatFinnishDate(step.deadline)}</p>
      ) : null}
      {step.path && step.actionLabel ? (
        <Link
          href={stepHref(tenancyId, step.path)}
          className="mt-4 inline-flex min-h-[var(--size-touch)] w-full items-center justify-center rounded-full bg-ink px-5 font-medium text-paper sm:w-auto"
        >
          {step.actionLabel}
        </Link>
      ) : null}
    </section>
  );
}

/** Vaiheet 1–4. Nykyinen vaihe merkitään `aria-current`illa. */
function PhaseTimeline({
  tenancyId,
  phases,
  currentPhase,
}: {
  tenancyId: string;
  phases: Phase[];
  currentPhase: Phase["key"];
}) {
  return (
    <section aria-labelledby="vaiheet" className="mt-8">
      <h2 id="vaiheet" className="text-lg">
        Vaiheet
      </h2>
      <ol className="mt-3 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-paper">
        {phases.map((phase) => {
          const current = phase.key === currentPhase;
          return (
            <li key={phase.key} className="border-b border-line last:border-b-0">
              <Link
                href={stepHref(tenancyId, phase.path)}
                aria-current={current ? "step" : undefined}
                className={
                  "flex min-h-[var(--size-touch)] items-center gap-3 px-4 py-3 " +
                  (current ? "bg-cloud" : "")
                }
              >
                <span
                  aria-hidden="true"
                  className={
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-medium " +
                    PHASE_DOT[phase.status]
                  }
                >
                  {phase.status === "done" ? "✓" : phase.number}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={"block " + (current ? "font-medium" : "")}>
                    <span className="sr-only">Vaihe {phase.number}: </span>
                    {phase.title}
                  </span>
                  <span className="block text-sm text-ink/60">
                    <span className={phase.status === "overdue" ? "font-medium text-ink" : ""}>
                      {PHASE_STATUS_LABEL[phase.status]}
                    </span>
                    {" · "}
                    {phase.detail}
                  </span>
                </span>
                <span aria-hidden="true" className="text-ink/40">
                  ›
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Ryhmän rivi: vähintään 44 px, nuoli ja lyhyt tila. */
function RowLink({
  href,
  title,
  status,
  quiet = false,
}: {
  href: string;
  title: string;
  status?: string;
  quiet?: boolean;
}) {
  return (
    <li className="border-b border-line last:border-b-0">
      <Link href={href} className="flex min-h-[var(--size-touch)] items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className={"block " + (quiet ? "text-ink/80" : "")}>{title}</span>
          {status ? <span className="block text-sm text-ink/60">{status}</span> : null}
        </span>
        <span aria-hidden="true" className="text-ink/40">
          ›
        </span>
      </Link>
    </li>
  );
}

function Group({
  id,
  title,
  children,
  after,
  quiet = false,
}: {
  id: string;
  title: string;
  children: ReactNode;
  after?: ReactNode;
  quiet?: boolean;
}) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className={quiet ? "text-base text-ink/70" : "text-lg"}>
        {title}
      </h2>
      <ul
        className={
          "mt-3 overflow-hidden rounded-[var(--radius-panel)] border border-line " +
          (quiet ? "bg-transparent" : "bg-paper")
        }
      >
        {children}
      </ul>
      {after}
    </section>
  );
}

/**
 * Vuokrasuhteen sivu ohjaa seuraavaan tehtävään (Jukan palaute 10.10.2026).
 *
 * ===========================================================================
 * JÄRJESTYS: MITÄ TEHDÄ, MISSÄ OLLAAN, KUKA, MISTÄ LÖYTYY
 *
 * Ennen sivulla oli yhdeksän samanarvoista painiketta. Nyt ylimpänä on yksi
 * tehtävä (`nextStep`), sen alla vuokrasuhteen neljä vaihetta tiloineen,
 * sitten osapuolet ja lopuksi ryhmitellyt rivit. Ryhmät, joilla ei ole
 * vaiheessa merkitystä, piilotetaan: arki ja päättyminen vasta
 * allekirjoituksen jälkeen, osapuolten tietojen muokkaus vain ennen sitä.
 * ===========================================================================
 */
export default async function TenancyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ maksu?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;

  /*
    Ennen 10.10.2026 luodut maksusivut palaavat tänne. Maksun tilanne
    kerrotaan Allekirjoitus-sivulla, jossa maksu aloitettiin.
  */
  const paymentReturn = readPaymentReturn((await searchParams).maksu);
  if (paymentReturn) redirect(`/vuokrasuhteet/${id}/allekirjoitus?maksu=${paymentReturn}`);

  const tenancy = await getTenancy(user.id, id);
  if (!tenancy) notFound();

  const isLandlord = tenancy.landlordUserId === user.id;
  const [overview, parties, property, deletionFacts, documentFacts] = await Promise.all([
    loadTenancyOverview(user.id, tenancy),
    listParties(user.id, id),
    // Vuokralainen ei omista asuntoa, joten hänelle tämä on `null`.
    getProperty(user.id, tenancy.propertyId),
    // Poisto koskee vain vuokranantajaa; vuokralaiselle sitä ei edes kysytä.
    isLandlord ? getTenancyDeletionFacts(user.id, id) : Promise.resolve(null),
    loadSignedDocumentFacts(user.id, id),
  ]);
  const offerFetch = await shouldOfferFetch(user.id, id, documentFacts);

  const { state, role } = overview;
  const step = nextStep(state, role);
  const phases = tenancyPhases(state);
  const signed = isContractSigned(state);
  const signedDocuments = signedDocumentList(documentFacts);

  const deletionBlocker = deletionFacts ? tenancyDeletionBlocker(deletionFacts) : null;
  // Sähköpostin korjaus ja kutsun poisto vain ennen allekirjoitusta: sama
  // sääntö kuin palvelimella (`invite-management.ts`).
  const invitesEditable = tenancy.status === "draft" || tenancy.status === "inspection";

  const tenants = parties.filter((party) => party.role === "tenant");
  const nameOf = (partyId: string) =>
    overview.parties.find((party) => party.partyId === partyId)?.name ?? null;
  const landlordName = overview.parties.find((party) => party.role === "landlord")?.name ?? null;

  const base = `/vuokrasuhteet/${tenancy.id}`;
  const ins = state.initialInspection;
  const inspectionPhase = phases.find((phase) => phase.key === "alkukatselmus")!;
  const afterActive = ["ending", "ended", "certified"].includes(tenancy.status);
  // Allekirjoitus-rivi, kun jotain on lähetettävänä tai allekirjoitettavana.
  const signingOpen = !signed || (ins.status === "locked" && !afterActive);

  return (
    <AppShell>
      <h1 className="text-2xl">{property ? formatAddress(property) : "Vuokrasuhde"}</h1>
      <p className="mt-1 text-ink/70">
        {fi.tenancyStatus[tenancy.status]} · {isLandlord ? "Olet vuokranantaja" : "Olet vuokralainen"}
      </p>

      <NextStepCard tenancyId={tenancy.id} step={step} />

      <PhaseTimeline tenancyId={tenancy.id} phases={phases} currentPhase={step.phase} />

      <section id="osapuolet" aria-labelledby="osapuolet-otsikko" className="mt-8 scroll-mt-4">
        <h2 id="osapuolet-otsikko" className="text-lg">
          Osapuolet
        </h2>
        <div className="mt-3 flex flex-col gap-3">
          <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4">
            <p className="text-sm text-ink/60">Vuokranantaja</p>
            <p className="font-medium">{landlordName ?? (isLandlord ? "Sinä" : "Vuokranantaja")}</p>
          </div>
          {tenants.map((party) => (
            <div key={party.id}>
              <p className="mb-1 text-sm text-ink/60">
                Vuokralainen{nameOf(party.id) ? `: ${nameOf(party.id)}` : ""}
              </p>
              {isLandlord ? (
                /*
                  Kutsulinkin luonti on vain vuokranantajalla. Vuokralaiselle
                  toisen osapuolen kutsulinkki olisi pääsy tämän paikalle.
                */
                <InviteRow
                  tenancyId={tenancy.id}
                  partyId={party.id}
                  email={party.inviteEmail ?? ""}
                  // Vuokranantaja itse vuokralaisen paikalla ei ole liittynyt
                  // vuokralainen, vaan korjattava virhe (`isSelfJoined`).
                  joined={Boolean(party.joinedAt) && !isSelfJoined(tenancy.landlordUserId, party.userId)}
                  selfJoined={isSelfJoined(tenancy.landlordUserId, party.userId)}
                  editable={invitesEditable}
                />
              ) : (
                <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4">
                  <p className="font-medium break-all">{party.inviteEmail}</p>
                  <p className="mt-0.5 text-sm text-ink/60">
                    {party.joinedAt ? "Liittynyt" : "Ei ole vielä liittynyt"}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <Group
        id="sopimus-ryhma"
        title="Sopimus ja asiakirjat"
        after={
          <SignedDocuments
            tenancyId={tenancy.id}
            documents={signedDocuments}
            showFetch={offerFetch}
            inline
          />
        }
      >
        <RowLink
          href={`${base}/sopimus`}
          title="Vuokrasopimus"
          status={
            signed
              ? "Allekirjoitettu"
              : state.contract.sent
                ? "Lähetetty allekirjoitettavaksi"
                : state.contract.missing.length > 0 && isLandlord
                  ? "Luonnos, täydennettävää"
                  : "Luonnos"
          }
        />
        {/* Osapuolten tietoja muokataan vain ennen allekirjoitusta. */}
        {!signed ? (
          <RowLink
            href={`${base}/osapuolet`}
            title={fi.nav.parties}
            status={
              state.parties.ownMissing + (isLandlord ? state.parties.othersMissing : 0) > 0
                ? "Tietoja puuttuu"
                : "Valmis"
            }
          />
        ) : null}
        {signingOpen ? (
          <RowLink
            href={`${base}/allekirjoitus`}
            title={fi.nav.signing}
            status={
              !signed
                ? state.contract.sent
                  ? "Sopimus odottaa allekirjoituksia"
                  : "Sopimusta ei ole vielä lähetetty"
                : ins.sent
                  ? "Pöytäkirja odottaa allekirjoituksia"
                  : "Pöytäkirja lähettämättä"
            }
          />
        ) : null}
        {!afterActive ? (
          <RowLink
            href={`${base}/katselmus`}
            title={fi.nav.inspection}
            status={`${PHASE_STATUS_LABEL[inspectionPhase.status]} · ${inspectionPhase.detail}`}
          />
        ) : null}
      </Group>

      {signed ? (
        <Group id="arki" title="Arki">
          <RowLink
            href={`${base}/vuokrat`}
            title={fi.nav.rent}
            status={rentRowText(overview.currentRent, state.today, role)}
          />
          <RowLink href={`${base}/huoltokirja`} title={fi.nav.maintenance} status={defectRowText(state.openDefects)} />
          {/* Kulut ovat vain omistajan: riviä ei näytetä vuokralaiselle. */}
          {isLandlord ? (
            <RowLink
              href={`${base}/kulut`}
              title={fi.nav.expenses}
              status={
                overview.expensesThisYear === null
                  ? undefined
                  : overview.expensesThisYear > 0
                    ? `Vuonna ${state.today.slice(0, 4)} yhteensä ${formatEuro(overview.expensesThisYear)}`
                    : `Ei kuluja vuonna ${state.today.slice(0, 4)}`
              }
            />
          ) : null}
        </Group>
      ) : null}

      <section aria-labelledby="perustiedot" className="mt-8">
        <h2 id="perustiedot" className="text-lg">
          Perustiedot
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <div>
            <dt className="text-sm text-ink/60">{fi.tenancy.startDate}</dt>
            <dd className="mt-0.5">{formatDate(tenancy.startDate)}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink/60">{tenancy.endDate ? fi.tenancy.endDate : "Kesto"}</dt>
            <dd className="mt-0.5">{tenancy.endDate ? formatDate(tenancy.endDate) : fi.tenancy.openEnded}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink/60">{fi.tenancy.rent}</dt>
            <dd className="mt-0.5">
              {tenancy.rentAmount} €/kk
              {tenancy.rentDueDay ? ` · eräpäivä ${tenancy.rentDueDay}.` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink/60">{fi.tenancy.deposit}</dt>
            <dd className="mt-0.5">{tenancy.depositAmount} €</dd>
          </div>
        </dl>
      </section>

      {signed ? (
        <Group id="paattyminen-ryhma" title={fi.nav.ending} quiet>
          <RowLink
            href={`${base}/paattyminen`}
            title="Irtisanominen ja vakuus"
            status={afterActive ? fi.tenancyStatus[tenancy.status] : "Kun vuokrasuhde päättyy"}
            quiet
          />
          {afterActive ? <RowLink href={`${base}/loppukatselmus`} title="Loppukatselmus" quiet /> : null}
          {tenancy.status === "ended" || tenancy.status === "certified" ? (
            <RowLink href={`${base}/todistukset`} title="Arviot ja todistukset" quiet />
          ) : null}
        </Group>
      ) : null}

      <div className="mt-10">
        <EndOfTenancyNotice />
      </div>

      {deletionFacts ? (
        <DeleteTenancy
          tenancyId={tenancy.id}
          blockedReason={deletionBlocker ? TENANCY_DELETION_MESSAGES[deletionBlocker] : null}
        />
      ) : null}

      <p className="mt-10 text-sm">
        <Link href="/vuokrasuhteet" className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
