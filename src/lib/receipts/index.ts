/**
 * Kuitin luvun julkisivu. Sovelluskoodi tuo kaiken tästä.
 *
 * Valinta samalla säännöllä kuin eSinetissä ja laskutuksessa:
 * `ANTHROPIC_API_KEY` puuttuu → mock, avain on → oikea. Erillinen
 * mock-lippu voisi jäädä päälle tuotantoon, ja silloin jokainen kuitti
 * näyttäisi lukukelvottomalta ilman että kukaan ymmärtäisi miksi.
 *
 * TÄMÄ EI KAADA TUOTANTOA, TOISIN KUIN MUUT
 *
 * `assertRealEsinetti` ja `assertRealBilling` kaatavat, jos avain puuttuu
 * tuotannossa: allekirjoitus ilman eSinettiä ja maksu ilman Stripeä olisivat
 * valheita. Kuitin luku on eri asia — se on apu, jonka puuttuessa käyttäjä
 * kirjoittaa summan itse. Toiminto, joka on hieman vaivalloisempi, on
 * parempi kuin kaatunut sivu.
 */

import { AnthropicReceiptReader } from "./anthropic";
import { MockReceiptReader } from "./mock";
import type { ReceiptReader } from "./types";

let cached: ReceiptReader | null = null;
let cachedIsMock = false;

function readKey(): string | null {
  // EI `NEXT_PUBLIC_`-etuliitettä: se veisi avaimen selaimeen.
  return process.env.ANTHROPIC_API_KEY?.trim() || null;
}

export function hasReceiptReading(): boolean {
  return readKey() !== null;
}

export function getReceiptReader(): ReceiptReader {
  if (cached) return cached;

  const key = readKey();
  if (key) {
    cached = new AnthropicReceiptReader(key);
    cachedIsMock = false;
  } else {
    cached = new MockReceiptReader();
    cachedIsMock = true;
    console.warn("[kuitti] ANTHROPIC_API_KEY puuttuu — kuitin lukua ei tehdä.");
  }

  return cached;
}

export function isUsingMockReceiptReader(): boolean {
  if (!cached) getReceiptReader();
  return cachedIsMock;
}

/** Testien käyttöön: pakottaa lukijan luotavaksi uudelleen ympäristön muututtua. */
export function resetReceiptReaderForTests(): void {
  cached = null;
  cachedIsMock = false;
}

export { MockReceiptReader } from "./mock";
export {
  EMPTY_READING,
  extractJson,
  hasContent,
  parseReceipt,
  RECEIPT_PROMPT,
  type ReceiptReading,
} from "./parse";
export type { ReadReceiptInput, ReadReceiptResult, ReceiptReader } from "./types";
