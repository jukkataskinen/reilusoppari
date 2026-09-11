import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getOwnPartyDefaults } from "@/lib/tenancy/party-details";
import { PartyDetailsForm } from "@/components/PartyDetailsForm";
import { AppShell } from "@/components/AppShell";
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

      <p className="mt-10 text-sm">
        <Link href="/" className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
