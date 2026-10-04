/**
 * Selaimen virheseuranta (DECISIONS.md 2026-10-04).
 *
 * `NEXT_PUBLIC_SENTRY_DSN` kirjoitetaan käännöksessä koodiin. Kun se puuttuu,
 * ehto on aina epätosi ja Next.js jättää Sentryn kokonaan pois selaimeen
 * ladattavasta koodista. DSN on julkinen tunniste, ei salaisuus.
 *
 * Ei session replayta eikä suorituskykyseurantaa: vain virheet.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  void Promise.all([import("@sentry/nextjs"), import("@/lib/sentry/options")])
    .then(([{ init }, { sentryOptions }]) => {
      init(sentryOptions(dsn, process.env.NEXT_PUBLIC_VERCEL_ENV));
    })
    // Virheseurannan latautumattomuus ei saa näkyä käyttäjälle.
    .catch(() => {});
}
