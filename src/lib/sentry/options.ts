/**
 * Yhteiset Sentry-asetukset palvelimelle, Edgelle ja selaimelle
 * (DECISIONS.md 2026-10-04).
 *
 * Sentry käynnistetään vain, kun DSN on asetettu (`SENTRY_DSN` palvelimella,
 * `NEXT_PUBLIC_SENTRY_DSN` selaimessa). Ilman sitä mitään ei ladata eikä
 * lähetetä: tämä tiedosto ei edes tuo Sentryä, jotta sen voi lukea ilman
 * sivuvaikutuksia.
 */

import { scrubEvent } from "./scrub";

export function sentryOptions(dsn: string, environment: string | undefined) {
  return {
    dsn,
    environment: environment || "development",
    // Ei IP-osoitetta, evästeitä eikä käyttäjää automaattisesti.
    sendDefaultPii: false,
    // Vain virheet. Suorituskykyseuranta lähettäisi jokaisen sivun polun ja
    // keston, eikä sitä tarvita vian korjaamiseen.
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  };
}

/** Sentryn ingest-alkuperä CSP:tä varten, tai null jos DSN puuttuu tai on rikki. */
export function sentryIngestOrigin(dsn: string | undefined): string | null {
  const value = dsn?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}
