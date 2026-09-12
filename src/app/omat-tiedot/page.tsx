import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getOwnPartyDefaults } from "@/lib/tenancy/party-details";
import { PartyDetailsForm } from "@/components/PartyDetailsForm";
import { AppShell } from "@/components/AppShell";
import { PushToggle } from "@/components/PushToggle";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Omat tiedot",
  robots: { index: false, follow: false },
};

/**
 * Omat perustiedot (Jukan pyyntö 2026-09-11).
 *
 * ===========================================================================
 * NÄMÄ EIVÄT OLE MINKÄÄN SOPIMUKSEN SISÄLTÖÄ
 *
 * Vuokranantajan tiedot pysyvät samoina vuokrasuhteesta toiseen, joten ne
 * kirjoitetaan kerran ja kopioidaan jokaisen uuden vuokrasuhteen
 * osapuoliriville. Kopio on tarkoituksella kopio: jos näitä muuttaa
 * myöhemmin, jo allekirjoitetut sopimukset eivät muutu takautuvasti.
 * ===========================================================================
 */
export default async function OwnDetailsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const details = await getOwnPartyDefaults(user.id);

  return (
    <AppShell>
      <h1 className="text-2xl">Omat tiedot</h1>
      <p className="mt-2 text-ink/70">
        Nämä tiedot kopioituvat valmiiksi jokaiseen uuteen vuokrasuhteeseen, jotta niitä ei
        tarvitse kirjoittaa joka kerta uudelleen.
      </p>

      <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <PartyDetailsForm details={details} nameLabel="Nimesi" />
      </div>

      <PushToggle />

      <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <p className="font-medium">Miten henkilötunnusta käsitellään</p>
        <p className="mt-2 text-sm text-ink/70">
          Se tallennetaan salattuna, eikä sitä näytetä kokonaisena missään näkymässä. Sopimukseen
          se tulostuu kokonaisena — juuri siksi sitä kysytään: ilman sitä osapuolet eivät ole
          yksiselitteisesti yksilöitävissä, jos sopimuksesta tulee erimielisyyttä. Sen näkevät vain
          saman vuokrasuhteen osapuolet.
        </p>
        <p className="mt-3 text-sm">
          <Link
            href="https://www.reilusoppari.fi/tietosuoja"
            className="underline underline-offset-4"
          >
            Tietosuojaseloste
          </Link>
        </p>
      </div>

      <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <p className="font-medium">Laskutus</p>
        <p className="mt-2 text-sm text-ink/70">
          Mitä seuraava vuokrasuhde maksaa, suositteluetusi ja salkkuhinta viidelle tai
          useammalle asunnolle. Vuokralainen ei maksa koskaan mitään.
        </p>
        <p className="mt-3 text-sm">
          <Link href="/laskutus" className="underline underline-offset-4">
            Laskutuksen tilanne
          </Link>
        </p>
      </div>

      {/*
        Omien tietojen vienti on tietosuoja-asetuksen oikeus (art. 20) ja
        CLAUDE.md:n lupaus. Se on tällä sivulla eikä asetuksissa, koska tämä
        on se sivu, jolta omia tietoja katsotaan.
      */}
      <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <p className="font-medium">Vie omat tietosi</p>
        <p className="mt-2 text-sm text-ink/70">
          Saat zip-paketin, jossa on vuokrasuhteesi, vuokrahistoria, huoltokirja,
          katselmusten kuvat ja allekirjoitetut asiakirjat. Kokoaminen voi kestää hetken, jos
          kuvia on paljon.
        </p>
        <p className="mt-2 text-sm text-ink/70">
          Henkilötunnus on paketissa peitettynä. Kokonaisena se on vuokrasopimuksessa, joka on
          paketissa mukana.
        </p>
        <a
          href="/api/omat-tiedot/vienti"
          className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
        >
          Lataa tietoni
        </a>
      </div>

      {/*
        Suosittelu on täällä eikä päänavigaatiossa: se on etu, ei työkalu,
        eikä sen kuulu kilpailla huomiosta asuntojen ja vuokrasuhteiden
        kanssa. Kuka etsii sitä, löytää sen omista tiedoistaan.
      */}
      <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <p className="font-medium">Tuo kaveri</p>
        <p className="mt-2 text-sm text-ink/70">
          Kun tuomasi vuokranantaja lähettää ensimmäisen sopimuksensa allekirjoitettavaksi,
          saatte molemmat yhden vuokrasuhteen veloituksetta.
        </p>
        <p className="mt-3 text-sm">
          <Link href="/suosittele" className="underline underline-offset-4">
            Oma suositteluosoitteesi
          </Link>
        </p>
      </div>

      <p className="mt-10 text-sm">
        <Link href="/" className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
