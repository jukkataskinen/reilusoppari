import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { acceptInvite, findTenancyByInvite } from "@/lib/db/tenancies";
import { AppShell } from "@/components/AppShell";
import { EndOfTenancyNotice } from "@/components/EndOfTenancyNotice";
import { fi } from "@/i18n/fi";
import {
  checkLinkRateLimit,
  KUTSULINKKIRAJA,
  LINKKIRAJA_VIESTI,
} from "@/lib/security/link-rate-limit";

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

  // Raja ennen tunnistehakua: juuri haku on se, mitä rajalla suojataan.
  const { allowed } = await checkLinkRateLimit(await headers(), KUTSULINKKIRAJA);
  if (!allowed) {
    return (
      <AppShell nav={false} signedIn={false}>
        <div className="py-10">
          <h1 className="text-2xl">Odota hetki</h1>
          <p className="mt-3 text-ink/70">{LINKKIRAJA_VIESTI}</p>
        </div>
      </AppShell>
    );
  }

  const preview = await findTenancyByInvite(token);

  if (!preview) {
    return (
      <AppShell nav={false} signedIn={false}>
        <div className="py-10">
          <h1 className="text-2xl">Kutsu ei ole voimassa</h1>
          <p className="mt-3 text-ink/70">{fi.invite.expired}</p>
        </div>
      </AppShell>
    );
  }

  const user = await getCurrentUser();

  if (user) {
    const result = await acceptInvite(token, user.id, user.email);

    if (result.ok) {
      redirect(`/vuokrasuhteet/${result.tenancyId}`);
    }

    /*
      Vuokranantaja avasi oman vuokrasuhteensa kutsun. Hänelle ei kerrota
      "väärästä tilistä" vaan siitä, mitä oikeasti tapahtui ja mitä tehdä:
      kutsu on todennäköisesti mennyt hänen omaan osoitteeseensa vahingossa.
    */
    /*
      Kutsu on toiselle osoitteelle, mutta se avattiin selaimessa, jossa
      vuokranantaja on kirjautuneena (Jukka 10.10.2026: testasi kutsua omalla
      koneellaan). Silloin kyse ei ole virheellisestä osoitteesta, vaan väärästä
      kirjautumisesta: neuvotaan kirjautumaan ulos ja avaamaan linkki uudelleen.
    */
    const ownEmail = (user.email ?? "").trim().toLowerCase();
    if (
      result.reason === "own_tenancy" &&
      preview.inviteEmail.trim().toLowerCase() !== ownEmail
    ) {
      return (
        <AppShell nav={false}>
          <div className="py-10">
            <h1 className="text-2xl">Olet kirjautuneena vuokranantajana</h1>
            <p className="mt-3 text-ink/70">
              Kutsu on lähetetty osoitteeseen {preview.inviteEmail}, mutta tässä selaimessa olet
              kirjautuneena tämän vuokrasuhteen vuokranantajana.
            </p>
            <p className="mt-3 text-ink/70">
              Kirjaudu ulos ja avaa kutsulinkki sähköpostista uudelleen. Voit myös avata linkin
              selaimen yksityisessä ikkunassa.
            </p>
            <p className="mt-6">
              <a
                href="/auth/logout"
                className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper"
              >
                Kirjaudu ulos
              </a>
            </p>
          </div>
        </AppShell>
      );
    }

    if (result.reason === "own_tenancy") {
      return (
        <AppShell nav={false}>
          <div className="py-10">
            <h1 className="text-2xl">Tämä on oma vuokrasuhteesi</h1>
            <p className="mt-3 text-ink/70">
              Et voi liittyä omaan vuokrasuhteeseesi vuokralaisena. Jos kutsu tuli omaan
              sähköpostiisi, vuokralaisen osoitteeksi on kirjoitettu sinun osoitteesi.
            </p>
            <p className="mt-3 text-ink/70">
              Korjaa osoite vuokrasuhteen sivulla: valitse vuokralaisen kohdalta Korjaa sähköposti
              ja kirjoita vuokralaisen oma osoite. Kutsu lähtee silloin hänelle.
            </p>
            <p className="mt-6">
              <Link
                href={`/vuokrasuhteet/${preview.tenancyId}`}
                className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper"
              >
                Avaa vuokrasuhde
              </Link>
            </p>
          </div>
        </AppShell>
      );
    }

    return (
      <AppShell nav={false}>
        <div className="py-10">
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
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell nav={false} signedIn={false}>
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
    </AppShell>
  );
}
