import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { listProperties } from "@/lib/db/properties";
import { listTenancies } from "@/lib/db/tenancies";
import { AppShell } from "@/components/AppShell";
import { fi } from "@/i18n/fi";

/**
 * Aloitussivu.
 *
 * Kirjautumattomalle kirjautumiskutsu ilman navigaatiota — hänellä ei ole
 * vielä mitään mihin navigoida. Kirjautuneelle lyhyt tilannekuva ja tie
 * eteenpäin sen mukaan, mitä hänellä jo on.
 */
export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <AppShell nav={false} signedIn={false}>
        <div className="py-10">
          {/* Merkki on jo ylätunnisteessa — kahdesti se olisi kohinaa. */}
          <h1 className="text-3xl">Vuokrasuhteen yhteinen työkalu</h1>
          <p className="mt-3 text-ink/70">
            Sopimus, kuvat ja kuittaukset samassa paikassa — molemmille osapuolille samoina.
          </p>

          <a
            href="/auth/login"
            className="mt-8 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-6 font-medium text-paper"
          >
            Kirjaudu
          </a>
          <p className="mt-3 text-sm text-ink/60">
            Saat sähköpostiisi kertakäyttöisen koodin. Salasanaa ei tarvita.
          </p>

          <p className="mt-12 text-sm text-ink/60">
            Lue lisää osoitteessa{" "}
            <Link href="https://www.reilusoppari.fi" className="underline underline-offset-4">
              reilusoppari.fi
            </Link>
          </p>
        </div>
      </AppShell>
    );
  }

  const [properties, tenancies] = await Promise.all([
    listProperties(user.id),
    listTenancies(user.id),
  ]);

  const isNew = properties.length === 0 && tenancies.length === 0;

  return (
    <AppShell>
      <h1 className="text-2xl">Hei</h1>
      <p className="mt-2 text-ink/70">{user.email}</p>

      {isNew ? (
        <div className="mt-8 rounded-[var(--radius-panel)] border border-line bg-paper p-6">
          <p className="font-medium">Aloita lisäämällä asunto</p>
          <p className="mt-2 text-ink/70">
            Asunnolle syntyy samalla valmis lista katselmuksen kohdista. Sen jälkeen voit luoda
            vuokrasuhteen ja kutsua vuokralaisen.
          </p>
          <Link
            href="/asunnot/uusi"
            className="mt-5 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-6 font-medium text-paper"
          >
            Lisää asunto
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link
            href="/asunnot"
            className="rounded-[var(--radius-panel)] border border-line bg-paper p-5"
          >
            <p className="text-sm text-ink/60">{fi.nav.properties}</p>
            <p className="mt-1 text-2xl font-bold">{properties.length}</p>
          </Link>
          <Link
            href="/vuokrasuhteet"
            className="rounded-[var(--radius-panel)] border border-line bg-paper p-5"
          >
            <p className="text-sm text-ink/60">{fi.nav.tenancies}</p>
            <p className="mt-1 text-2xl font-bold">{tenancies.length}</p>
          </Link>
        </div>
      )}
    </AppShell>
  );
}
