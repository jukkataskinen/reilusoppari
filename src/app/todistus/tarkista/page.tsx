import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { VerifyForm } from "@/components/VerifyForm";

export const metadata: Metadata = {
  title: "Tarkista todistuksen aitous",
};

/**
 * Asiakirjan aitouden tarkistus (CLAUDE.md kohta 2).
 *
 * ===========================================================================
 * TARKISTUS EI VAADI LUOTTAMUSTA MEIHIN
 *
 * Tiiviste lasketaan asiakirjasta, ja eSinetti kertoo, onko se sinetöity ja
 * milloin. Jos joku muuttaisi asiakirjaa yhdenkin tavun, tiiviste ei enää
 * täsmäisi.
 *
 * Sivu on julkinen ja kirjautumaton: sen tarkoitus on olla käytettävissä
 * sille, joka ei ole palvelun käyttäjä eikä halua olla.
 * ===========================================================================
 */
export default function VerifyPage() {
  return (
    <AppShell nav={false} signedIn={false}>
      <h1 className="text-2xl">Tarkista todistuksen aitous</h1>
      <p className="mt-2 text-ink/70">
        Syötä asiakirjan tiiviste, niin kerromme onko se sinetöity Reilusopparissa ja milloin.
        Tarkistus ei paljasta asiakirjan sisältöä.
      </p>

      <VerifyForm />

      <div className="mt-8 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <p className="font-medium">Mistä tiiviste löytyy?</p>
        <p className="mt-2 text-sm text-ink/70">
          Jos sait todistuksen jakolinkillä, tiiviste lukee linkin sivulla. Voit myös laskea sen
          itse tallentamastasi tiedostosta — se on tiedoston SHA-256-tiiviste, eikä sen
          laskemiseen tarvita tätä palvelua.
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
