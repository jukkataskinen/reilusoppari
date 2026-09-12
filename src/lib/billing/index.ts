/**
 * Laskutuksen julkisivu. Sovelluskoodi tuo kaiken tästä eikä koskaan
 * `http-client`- tai `mock`-moduulista suoraan.
 *
 * Valinta tehdään samalla säännöllä kuin eSinetissä: `STRIPE_SECRET_KEY`
 * puuttuu → mock, avain on → oikea. Erillinen mock-lippu voisi jäädä päälle
 * tuotantoon, ja silloin jokainen vuokrasuhde olisi ilmainen ilman että
 * kukaan huomaa.
 */

import { StripeHttpClient } from "./http-client";
import { BillingMockClient } from "./mock";
import type { BillingClient } from "./types";

let cached: BillingClient | null = null;
let cachedIsMock = false;

function readKey(): string | null {
  return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

export function hasBillingCredentials(): boolean {
  return readKey() !== null;
}

/** Laskutus-client. Sama olio koko prosessin ajan, jotta mockin tila säilyy. */
export function getBillingClient(): BillingClient {
  if (cached) return cached;

  const key = readKey();
  if (key) {
    cached = new StripeHttpClient(key);
    cachedIsMock = false;
  } else {
    cached = new BillingMockClient();
    cachedIsMock = true;
    console.warn("[laskutus] STRIPE_SECRET_KEY puuttuu — käytössä on mock, ei oikea maksu.");
  }

  return cached;
}

export function isUsingMockBilling(): boolean {
  if (!cached) getBillingClient();
  return cachedIsMock;
}

/**
 * Kaataa, jos tuotannossa ollaan mockin varassa.
 *
 * Kutsu tämä siellä, missä oikeasti veloitetaan — ei moduulin latauksessa,
 * koska silloin `npm run build` kaatuisi koneella jolla avainta ei ole.
 */
export function assertRealBilling(): void {
  if (process.env.NODE_ENV === "production" && !hasBillingCredentials()) {
    throw new Error("Stripe-yhteyttä ei ole määritetty. Maksua ei voi tehdä mockilla tuotannossa.");
  }
}

/** Testien käyttöön: pakottaa clientin luotavaksi uudelleen ympäristön muututtua. */
export function resetBillingClientForTests(): void {
  cached = null;
  cachedIsMock = false;
}

export { BillingMockClient } from "./mock";
export {
  parseBillingEvent,
  TOLERANCE_SECONDS,
  verifyWebhookSignature,
} from "./webhook";
export type {
  BillingClient,
  BillingEvent,
  BillingProduct,
  CheckoutInput,
  CheckoutSession,
  PortalSession,
} from "./types";
