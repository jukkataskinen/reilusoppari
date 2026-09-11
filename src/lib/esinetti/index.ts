/**
 * eSinetti-liitännän julkisivu. Sovelluskoodi tuo kaiken tästä eikä koskaan
 * `http-client`- tai `mock`-moduulista suoraan.
 *
 * ===========================================================================
 * KUMPI CLIENT ON KÄYTÖSSÄ
 *
 * `ESINETTI_API_KEY` puuttuu → mock. Avain on → oikea.
 *
 * Valinta on tarkoituksella tämä päin. Kehityskoneella ja CI:ssä avainta ei
 * ole, joten ne käyttävät mockia ilman erillistä lippua; tuotannossa avain
 * on, joten oikea client valikoituu itsestään. Erillinen `ESINETTI_MOCK=1`
 * -lippu olisi ollut vaarallisempi: se voisi jäädä päälle tuotantoon, ja
 * silloin allekirjoitukset näyttäisivät onnistuvan ilman että kukaan
 * allekirjoittaa mitään.
 *
 * Tuotannossa mockiin putoaminen ei jää huomaamatta: `assertRealEsinetti()`
 * kaataa käynnistyksen, jos avain puuttuu mutta ollaan tuotannossa.
 * ===========================================================================
 */

import { EsinettiHttpClient } from "./http-client";
import { EsinettiMockClient } from "./mock";
import type { EsinettiClient } from "./types";

let cached: EsinettiClient | null = null;
let cachedIsMock = false;

function readConfig(): { apiUrl: string; apiKey: string } | null {
  const apiKey = process.env.ESINETTI_API_KEY?.trim();
  if (!apiKey) return null;
  const apiUrl = process.env.ESINETTI_API_URL?.trim() || "https://esinetti.fi/api/v1";
  return { apiUrl, apiKey };
}

/** Onko oikea eSinetti-yhteys konfiguroitu? */
export function hasEsinettiCredentials(): boolean {
  return readConfig() !== null;
}

/**
 * eSinetti-client. Sama olio koko prosessin ajan, jotta mockin muistissa
 * oleva tila säilyy pyyntöjen välillä.
 */
export function getEsinettiClient(): EsinettiClient {
  if (cached) return cached;

  const config = readConfig();
  if (config) {
    cached = new EsinettiHttpClient(config);
    cachedIsMock = false;
  } else {
    cached = new EsinettiMockClient();
    cachedIsMock = true;
    console.warn("[esinetti] ESINETTI_API_KEY puuttuu — käytössä on mock, ei oikea allekirjoitus.");
  }

  return cached;
}

/** Onko käytössä mock? Käyttöliittymä voi näyttää varoitusnauhan kehitysympäristössä. */
export function isUsingMockEsinetti(): boolean {
  if (!cached) getEsinettiClient();
  return cachedIsMock;
}

/**
 * Kaataa, jos tuotannossa ollaan mockin varassa.
 *
 * Kutsu tämä siellä, missä oikeasti allekirjoitetaan — ei moduulin latauksessa,
 * koska silloin `npm run build` kaatuisi koneella jolla avainta ei ole.
 */
export function assertRealEsinetti(): void {
  if (process.env.NODE_ENV === "production" && !hasEsinettiCredentials()) {
    throw new Error(
      "eSinetti-yhteyttä ei ole määritetty. Allekirjoitusta ei voi tehdä mockilla tuotannossa.",
    );
  }
}

/** Testien käyttöön: pakottaa clientin luotavaksi uudelleen ympäristön muututtua. */
export function resetEsinettiClientForTests(): void {
  cached = null;
  cachedIsMock = false;
}

export { EsinettiError, isEsinettiError, type EsinettiErrorCode } from "./errors";
export {
  buildExternalRef,
  isKnownWebhookEvent,
  parseExternalRef,
  parseWebhookPayload,
  verifyWebhookSignature,
  WEBHOOK_EVENTS,
  type WebhookEvent,
  type WebhookEventName,
} from "./webhook";
export type {
  CreateRoundInput,
  EsinettiClient,
  Round,
  RoundDocument,
  RoundDocumentInput,
  RoundSigner,
  RoundSignerState,
  RoundStatus,
  SealDocumentInput,
  SealDocumentResult,
  SignerStatus,
  VerifyResult,
} from "./types";
