import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getEndingState } from "@/lib/db/ending";
import { AppShell } from "@/components/AppShell";
import { EndingControls } from "@/components/EndingControls";
import { EndOfTenancyNotice } from "@/components/EndOfTenancyNotice";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Vuokrasuhteen päättyminen",
  robots: { index: false, follow: false },
};

function päivä(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${Number(day)}.${Number(month)}.${year}`;
}

/**
 * Vuokrasuhteen päättyminen (CLAUDE.md 5.8).
 *
 * ===========================================================================
 * SAMA SIVU KOKO PÄÄTTYMISEN AJAN
 *
 * Irtisanominen, loppukatselmus, vakuuden palautus ja todistukset ovat saman
 * polun vaiheita, ja ne näkyvät tällä sivulla siinä järjestyksessä kuin ne
 * tapahtuvat. Erillisinä sivuina kukaan ei tietäisi, mitä on jo tehty ja mitä
 * on jäljellä.
 * ===========================================================================
 */
export default async function EndingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const state = await getEndingState(user.id, id);
  if (!state) notFound();

  const given = state.noticeGivenAt !== null;

  return (
    <AppShell>
      <h1 className="text-2xl">Vuokrasuhteen päättyminen</h1>

      {given ? (
        <>
          <p className="mt-2 text-ink/70">
            {state.noticeBy === "landlord" ? "Vuokranantaja" : "Vuokralainen"} on irtisanonut
            vuokrasuhteen {päivä(state.noticeGivenAt!)}. Se päättyy{" "}
            <span className="font-medium">
              {state.noticeEndsAt ? päivä(state.noticeEndsAt) : "sovittuna päivänä"}
            </span>
            .
          </p>

          <ol className="mt-6 flex flex-col gap-3">
            <li className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
              <p className="font-medium">1. Loppukatselmus</p>
              <p className="mt-2 text-sm text-ink/70">
                Samat tilat kuin alussa, alkukuvat rinnalla. Kumpikin kuvaa oman näkemyksensä.
              </p>
              <Link
                href={`/vuokrasuhteet/${id}/loppukatselmus`}
                className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
              >
                Avaa loppukatselmus
              </Link>
            </li>

            <li className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
              <p className="font-medium">2. Vakuuden palautus</p>
              {state.depositReturnedAt ? (
                <p className="mt-2 text-sm text-ink/70">
                  Kirjattu {päivä(state.depositReturnedAt)}
                  {state.depositReturnedAmount !== null
                    ? `, ${state.depositReturnedAmount} €`
                    : ""}
                  .
                </p>
              ) : (
                <p className="mt-2 text-sm text-ink/70">
                  {state.depositAmount
                    ? `Vakuus on ${state.depositAmount} €. Vuokranantaja kirjaa palautuksen, kun se on tehty.`
                    : "Vakuutta ei ole."}
                </p>
              )}
            </li>

            <li className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
              <p className="font-medium">3. Arviot ja todistukset</p>
              <p className="mt-2 text-sm text-ink/70">
                Loppukatselmuksen allekirjoituksen jälkeen kumpikin antaa toisestaan arvion ja saa
                oman vuokratodistuksensa.
              </p>
            </li>
          </ol>
        </>
      ) : (
        <>
          <p className="mt-2 text-ink/70">
            Kumpi tahansa teistä voi irtisanoa toistaiseksi voimassa olevan sopimuksen. Sovellus
            laskee päättymispäivän lain mukaan ja näyttää sen ennen kuin mitään kirjataan.
          </p>

          <div className="mt-6">
            <EndOfTenancyNotice />
          </div>
        </>
      )}

      {given ? null : (
        <EndingControls
          tenancyId={id}
          isLandlord={state.isLandlord}
          canGiveNotice={state.decision.allowed}
          blockedMessage={state.decision.allowed ? null : state.decision.message}
          endsAt={state.decision.allowed ? state.decision.endsAt : null}
          months={state.decision.allowed ? state.decision.months : null}
          depositAmount={state.depositAmount}
          depositReturnedAt={state.depositReturnedAt}
        />
      )}

      {given ? (
        <EndingControls
          tenancyId={id}
          isLandlord={state.isLandlord}
          canGiveNotice={false}
          blockedMessage={null}
          endsAt={null}
          months={null}
          depositAmount={state.depositAmount}
          depositReturnedAt={state.depositReturnedAt}
        />
      ) : null}

      <p className="mt-10 text-sm">
        <Link href={`/vuokrasuhteet/${id}`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
