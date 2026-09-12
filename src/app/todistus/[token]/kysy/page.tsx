import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { canOpenConversation } from "@/lib/certificates/contact";
import {
  hasConversation,
  openConversation,
  resolveShare,
} from "@/lib/db/certificate-contact";
import { isTenancyParty } from "@/lib/db/access";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Kysy lisää",
  robots: { index: false, follow: false },
};

/**
 * Keskustelun avaaminen jakolinkistä (CLAUDE.md 5.10).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: kuka tahansa, jolla on voimassa oleva jakolinkki.
 *    Keskustelun avaaminen vaatii lisäksi kirjautumisen ja vahvan
 *    tunnistautumisen.
 * 2. Henkilötieto: keskustelu koskee kolmatta osapuolta (vuokralaista).
 *    Juuri siksi tunnistautuminen vaaditaan.
 * 3. Syöte: jakolinkin tunniste polusta. Muoto tarkistetaan.
 * 4. IDOR: todistuksen id ei kulje osoitteessa lainkaan — se ratkaistaan
 *    jakolinkistä palvelimella.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: sama vastaus vanhentuneelle, mitätöidylle ja
 *    olemattomalle linkille.
 * 7. Lokitus: ei mitään.
 *
 * JÄRJESTYS ON TÄRKEÄ
 *
 * Puuttuvasta luvasta kerrotaan ENNEN tunnistautumista. Muuten ihminen
 * tunnistautuisi pankkitunnuksilla ja saisi vasta sen jälkeen kuulla, ettei
 * lupaa ole. Sääntö on `certificates/contact.ts`:ssä ja testattu.
 *
 * TUNNISTAUTUMINEN ON VIELÄ KESKEN
 *
 * eSinetillä ei ole erillistä tunnistuspäätepistettä — nykyinen vahva
 * tunnistautuminen tapahtuu allekirjoituskierroksen yhteydessä. Siihen asti
 * tämä sivu kertoo tunnistautumisen puuttuvan eikä avaa keskustelua.
 * Sääntö on jo paikallaan, joten päätepisteen valmistuttua tarvitaan vain
 * linkki tunnistautumiseen (BLOCKERS.md).
 * ===========================================================================
 */
export default async function AskPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = await resolveShare(token);

  if (!share) {
    return (
      <AppShell nav={false} signedIn={false}>
        <div className="py-10">
          <h1 className="text-2xl">Linkki ei ole voimassa</h1>
          <p className="mt-3 text-ink/70">
            Jakolinkki on vanhentunut tai se on mitätöity. Pyydä uusi linkki siltä, joka jakoi
            todistuksen.
          </p>
        </div>
      </AppShell>
    );
  }

  // Lupa tarkistetaan ennen kirjautumista: turha kirjautuminen on turha este.
  if (!share.permission.allowed) {
    return (
      <Estetty
        token={token}
        message={
          share.permission.revokedAt
            ? "Yhteydenottolupa on peruttu."
            : "Todistuksen antaja ei ole sallinut yhteydenottoa tästä vuokrasuhteesta."
        }
      />
    );
  }

  const user = await getCurrentUser();
  if (!user) redirect(`/auth/login?returnTo=${encodeURIComponent(`/todistus/${token}/kysy`)}`);

  const [existing, isParty] = await Promise.all([
    hasConversation(share.certificateId, user.id),
    isTenancyParty(user.id, share.tenancyId),
  ]);

  // Jo avattu keskustelu: suoraan siihen eikä virheilmoitusta.
  if (existing) redirect(`/keskustelut/${existing}`);

  const decision = canOpenConversation(share.permission, {
    identityVerified: user.identityVerifiedAt !== null,
    isOwnParty: isParty,
    hasOpenConversation: false,
  });

  if (!decision.allowed) {
    return <Estetty token={token} message={decision.message} identify={decision.reason === "not_identified"} />;
  }

  const opened = await openConversation({
    certificateId: share.certificateId,
    shareId: share.shareId,
    initiatorUserId: user.id,
    now: new Date(),
  });

  if (!opened.ok) return <Estetty token={token} message={opened.message} />;

  redirect(`/keskustelut/${opened.id}`);
}

function Estetty({
  token,
  message,
  identify = false,
}: {
  token: string;
  message: string;
  identify?: boolean;
}) {
  return (
    <AppShell nav={false} signedIn={false}>
      <div className="py-10">
        <h1 className="text-2xl">Keskustelua ei voi avata</h1>
        <p className="mt-3 text-ink/70">{message}</p>

        {identify ? (
          <p className="mt-4 text-sm text-ink/70">
            Tunnistautuminen pankkitunnuksilla ei ole vielä käytössä tässä ympäristössä. Se
            tehdään kerran, ja sen jälkeen sitä ei kysytä uudelleen.
          </p>
        ) : null}

        <p className="mt-8 text-sm">
          <Link href={`/todistus/${token}`} className="underline underline-offset-4">
            Takaisin todistukseen
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
