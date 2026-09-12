import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { listProperties } from "@/lib/db/properties";
import { formatAddress } from "@/lib/property/schema";
import { AppShell } from "@/components/AppShell";
import { ReceiptCapture } from "@/components/ReceiptCapture";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Kuvaa kuitti",
  robots: { index: false, follow: false },
};

/**
 * Kuitin kuvaus (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * OMA SIVUNSA, EI ASUNNON ALLA
 *
 * Kuitti on kädessä kaupan ovella, eikä silloin muisteta minkä asunnon alta
 * kuvaus löytyy. Siksi tämä on yksi paikka, josta kuvaus alkaa aina, ja
 * asunto valitaan vasta kuvan jälkeen — jos asuntoja on enemmän kuin yksi.
 *
 * Yhden asunnon omistajalta ei kysytä mitään: valintalista, jossa on yksi
 * vaihtoehto, on kysymys jolla ei ole vastausta.
 * ===========================================================================
 */
export default async function ReceiptPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const properties = await listProperties(user.id);

  return (
    <AppShell>
      <h1 className="text-2xl">Kuvaa kuitti</h1>

      {properties.length === 0 ? (
        <>
          <p className="mt-3 text-ink/70">
            Kulut kirjataan asunnolle, joten lisää ensin asunto.
          </p>
          <Link
            href="/asunnot/uusi"
            className="mt-5 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper"
          >
            Lisää asunto
          </Link>
        </>
      ) : (
        <>
          <p className="mt-3 text-ink/70">
            Kuvaa kuitti, niin luen siitä summan ja päivän valmiiksi. Tarkistat luvut ennen
            tallennusta — luettu summa on ehdotus, ei totuus.
          </p>

          <p className="mt-3 text-sm text-ink/70">
            Kulut ja kuitit näkyvät vain sinulle. Vuokralainen ei näe niitä missään.
          </p>

          <ReceiptCapture
            properties={properties.map((property) => ({
              id: property.id,
              label: property.name ?? formatAddress(property),
            }))}
          />
        </>
      )}

      <p className="mt-10 text-sm">
        <Link href="/asunnot" className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
