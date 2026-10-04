"use client";

import { useEffect } from "react";
import { sans } from "@/lib/fonts";
import "./globals.css";

/**
 * Viimeinen virhesivu: näytetään, kun sivu kaatuu niin, ettei edes
 * pääasettelu piirry. Korvaa Next.js:n englanninkielisen oletussivun.
 *
 * Virhe ilmoitetaan Sentryyn vain, jos `NEXT_PUBLIC_SENTRY_DSN` on asetettu
 * (DECISIONS.md 2026-10-04). Käyttäjälle ei näytetä virheen sisältöä: se voi
 * kertoa sisäisestä rakenteesta tai sisältää toisen osapuolen tietoja.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    import("@sentry/nextjs")
      .then(({ captureException }) => captureException(error))
      .catch(() => {});
  }, [error]);

  return (
    <html lang="fi" className={`${sans.variable} h-full`}>
      <body className="min-h-full bg-cloud text-ink antialiased">
        <main className="mx-auto flex min-h-dvh max-w-[var(--container-content)] flex-col justify-center px-6 py-12">
          <h1 className="text-2xl">Jokin meni vikaan</h1>
          <p className="mt-3 text-ink/70">
            Sivu ei latautunut. Yritä uudelleen. Jos vika toistuu, palaa hetken kuluttua.
          </p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper"
            >
              Yritä uudelleen
            </button>
            {/* Tavallinen linkki eikä Next.js:n Link: koko sovellus ladataan alusta. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="inline-flex min-h-[var(--size-touch)] items-center px-2 text-sm font-medium text-ink underline">
              Etusivulle
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
