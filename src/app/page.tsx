import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { fi } from "@/i18n/fi";

/**
 * Aloitussivu. Kirjautumattomalle kirjautumislinkki, kirjautuneelle lyhyt
 * tilannekuva. Korvataan asuntolistalla, kun se on valmis (PLAN.md vaihe 0).
 */
export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex min-h-dvh max-w-[var(--container-content)] flex-col justify-center px-6 py-12">
      <h1 className="text-3xl">{fi.app.name}</h1>
      <p className="mt-3 text-ink/70">{fi.app.tagline}</p>

      {user ? (
        <div className="mt-8 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <p className="text-sm text-ink/70">Kirjautunut</p>
          <p className="mt-1 font-medium">{user.email}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/asunnot"
              className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper"
            >
              {fi.nav.properties}
            </Link>
            <a
              href="/auth/logout"
              className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
            >
              Kirjaudu ulos
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-8">
          <a
            href="/auth/login"
            className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-6 font-medium text-paper"
          >
            Kirjaudu
          </a>
          <p className="mt-3 text-sm text-ink/60">
            Saat sähköpostiisi kertakäyttöisen koodin. Salasanaa ei tarvita.
          </p>
        </div>
      )}

      <p className="mt-10 text-sm text-ink/60">
        Sovellus on rakenteilla. Julkinen sivusto on osoitteessa{" "}
        <Link href="https://www.reilusoppari.fi" className="underline underline-offset-4">
          reilusoppari.fi
        </Link>
        .
      </p>
    </main>
  );
}
