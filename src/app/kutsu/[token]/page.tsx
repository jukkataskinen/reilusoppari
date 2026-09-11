import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { acceptInvite, findTenancyByInvite } from "@/lib/db/tenancies";
import { EndOfTenancyNotice } from "@/components/EndOfTenancyNotice";
import { fi } from "@/i18n/fi";

/**
 * Kutsulinkki (CLAUDE.md 5.2).
 *
 * ===========================================================================
 * TÄMÄ SIVU ON TARKOITUKSELLA JULKINEN
 *
 * Vuokralaisella ei ole vielä tiliä, joten kutsun on avauduttava ilman
 * kirjautumista. Linkin tunniste on se, mikä antaa pääsyn — ja se on
 * 256-bittinen satunnaisluku, jota ei säilytetä selkokielisenä missään.
 *
 * Sivu näyttää vain sen, mitä kutsutun kuuluu nähdä ennen kirjautumista:
 * asunnon osoite ja sopimuksen perusluvut. Ei kuvia, ei toisen vuokralaisen
 * tietoja, ei vuokranantajan yhteystietoja.
 *
 * KIRJAUTUNEELLE KUTSU LUNASTETAAN HETI
 *
 * Jos käyttäjä on jo kirjautunut, liittyminen tapahtuu heti eikä erillistä
 * vahvistusnappia ole: hän on juuri avannut linkin, joka on osoitettu
 * hänelle, eikä toista tulkintaa ole.
 * ===========================================================================
 */

export const metadata: Metadata = {
  title: fi.invite.title,
  robots: { index: false, follow: false },
};

function formatDate(value: string | null): string {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${Number(day)}.${Number(month)}.${year}`;
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await findTenancyByInvite(token);

  if (!preview) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[var(--container-content)] flex-col justify-center px-6 py-12">
        <h1 className="text-2xl">Kutsu ei ole voimassa</h1>
        <p className="mt-3 text-ink/70">{fi.invite.expired}</p>
      </main>
    );
  }

  const user = await getCurrentUser();

  if (user) {
    const result = await acceptInvite(token, user.id, user.email);

    if (result.ok) {
      redirect(`/vuokrasuhteet/${result.tenancyId}`);
    }

    return (
      <main className="mx-auto flex min-h-dvh max-w-[var(--container-content)] flex-col justify-center px-6 py-12">
        <h1 className="text-2xl">Kutsu on toiselle osoitteelle</h1>
        <p className="mt-3 text-ink/70">
          {result.reason === "wrong_account" ? fi.invite.wrongAccount : fi.invite.expired}
        </p>
        <p className="mt-3 text-sm text-ink/60">
          Kutsu on lähetetty osoitteeseen {preview.inviteEmail}. Olet kirjautunut osoitteella{" "}
          {user.email}.
        </p>
        <p className="mt-6">
          <a href="/auth/logout" className="underline underline-offset-4">
            Kirjaudu ulos ja yritä toisella osoitteella
          </a>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-[var(--container-content)] px-6 py-10">
      <h1 className="text-2xl">{fi.invite.title}</h1>
      <p className="mt-2 text-ink/70">
        {preview.landlordName ? `${preview.landlordName} kutsui sinut` : "Sinut on kutsuttu"}{" "}
        vuokralaiseksi. Tässä ovat pääkohdat — koko sopimuksen näet kirjautumisen jälkeen.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-4 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <div className="col-span-2">
          <dt className="text-sm text-ink/60">Koti</dt>
          <dd className="mt-0.5 font-medium">{preview.propertyAddress}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink/60">{fi.tenancy.startDate}</dt>
          <dd className="mt-0.5">{formatDate(preview.startDate)}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink/60">{fi.tenancy.rent}</dt>
          <dd className="mt-0.5">
            {preview.rentAmount} €/kk
            {preview.rentDueDay ? ` · eräpäivä ${preview.rentDueDay}.` : ""}
          </dd>
        </div>
        {preview.endDate ? (
          <div>
            <dt className="text-sm text-ink/60">{fi.tenancy.endDate}</dt>
            <dd className="mt-0.5">{formatDate(preview.endDate)}</dd>
          </div>
        ) : null}
        {preview.depositAmount ? (
          <div>
            <dt className="text-sm text-ink/60">{fi.tenancy.deposit}</dt>
            <dd className="mt-0.5">{preview.depositAmount} €</dd>
          </div>
        ) : null}
      </dl>

      {/* Sama ilmoitus kuin vuokranantajalle luontinäkymässä (DECISIONS.md). */}
      <div className="mt-6">
        <EndOfTenancyNotice />
      </div>

      <div className="mt-8">
        <a
          href={`/auth/login?returnTo=${encodeURIComponent(`/kutsu/${token}`)}`}
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-6 font-medium text-paper"
        >
          {fi.invite.signIn}
        </a>
        <p className="mt-3 text-sm text-ink/60">
          Kirjaudu osoitteella {preview.inviteEmail}. Saat sähköpostiisi kertakäyttöisen koodin —
          salasanaa ei tarvita.
        </p>
      </div>

      <p className="mt-10 text-sm">
        <Link href="https://www.reilusoppari.fi" className="underline underline-offset-4">
          Mikä Reilusoppari on?
        </Link>
      </p>
    </main>
  );
}
