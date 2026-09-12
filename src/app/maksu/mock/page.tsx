import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isUsingMockBilling } from "@/lib/billing";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Harjoittelutila",
  robots: { index: false, follow: false },
};

/**
 * Mock-maksun välisivu.
 *
 * ===========================================================================
 * MIKSI TÄMÄ SIVU ON OLEMASSA
 *
 * Mock voisi ohjata suoraan onnistumisosoitteeseen, ja maksupolku näyttäisi
 * kehityksessä toimivan täydellisesti. Juuri se olisi vaarallista: kukaan ei
 * huomaisi, ettei polkua ole koskaan kokeiltu oikeasti, ja ensimmäinen
 * maksuyritys tuotannossa olisi myös ensimmäinen testi.
 *
 * Siksi tässä välissä on sivu, joka sanoo suoraan mitä EI tapahtunut.
 *
 * TÄMÄ SIVU EI MERKITSE MITÄÄN MAKSETUKSI
 *
 * Mockissa vuokrasuhde jää maksamattomaksi, koska webhookia ei tule.
 * Kehityksessä maksun voi merkitä käsin tietokantaan. Jos tämä sivu
 * merkitsisi maksun, se olisi reitti, joka myöntää käyttöoikeuden ilman
 * maksua — ja sellainen reitti ei saa olla olemassa edes mockissa.
 * ===========================================================================
 */
export default async function MockPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ paluu?: string; istunto?: string; portaali?: string }>;
}) {
  // Oikeassa ympäristössä tätä sivua ei ole. Muuten se olisi hämmentävä
  // löydös tuotannossa.
  if (!isUsingMockBilling()) notFound();

  const { paluu, istunto, portaali } = await searchParams;

  /*
    Paluuosoite tarkistetaan omaksi poluksi.

    Avoin uudelleenohjaus on haavoittuvuus myös harjoittelutilassa: osoite
    tulee kyselyparametrista, ja ilman tarkistusta tästä sivusta tulisi
    linkki, joka vie mille tahansa sivustolle Reilusopparin osoitteen alta.
  */
  const safeReturn = paluu && isOwnPath(paluu) ? paluu : "/vuokrasuhteet";

  return (
    <AppShell>
      <h1 className="text-2xl">Harjoittelutila</h1>

      <div className="mt-6 rounded-[var(--radius-panel)] border border-coral bg-paper p-5">
        <p className="font-medium">Mitään ei veloitettu</p>
        <p className="mt-2 text-sm text-ink/70">
          Stripe-yhteyttä ei ole määritetty tässä ympäristössä, joten maksusivua ei avattu eikä
          korttia veloitettu. {portaali ? "Asiakasportaalia ei myöskään ole." : null}
        </p>
        <p className="mt-3 text-sm text-ink/70">
          Vuokrasuhde jää maksamattomaksi: käyttöoikeus myönnetään vasta Stripen webhookista, ja
          sitä ei tässä tule. Se on tarkoitus — reitti, joka myöntäisi käyttöoikeuden ilman
          maksua, ei saa olla olemassa edes harjoittelutilassa.
        </p>
        {istunto ? (
          <p className="mt-3 font-mono text-xs text-ink/50">{istunto}</p>
        ) : null}
      </div>

      <Link
        href={safeReturn}
        className="mt-6 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
      >
        Takaisin
      </Link>
    </AppShell>
  );
}

/** Onko osoite oman sovelluksen polku eikä ulkopuolinen? */
function isOwnPath(value: string): boolean {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (value.startsWith("/") && !value.startsWith("//")) return true;

  if (!appUrl) return false;
  try {
    return new URL(value).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}
