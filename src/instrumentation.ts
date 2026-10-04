import type { Instrumentation } from "next";

/**
 * Palvelimen ja Edgen virheseuranta (DECISIONS.md 2026-10-04).
 *
 * Sentry ladataan vain, jos `SENTRY_DSN` on asetettu. Ilman sitä tämä
 * tiedosto ei tuo Sentryä lainkaan eikä ota yhteyttä mihinkään.
 *
 * Virheet tulevat Next.js:n `onRequestError`-koukusta: se kattaa sivut,
 * reitit, server actionit ja middlewaren ilman, että koodia kääritään.
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  const [Sentry, { sentryOptions }] = await Promise.all([
    import("@sentry/nextjs"),
    import("@/lib/sentry/options"),
  ]);
  Sentry.init(sentryOptions(dsn, process.env.VERCEL_ENV));
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
