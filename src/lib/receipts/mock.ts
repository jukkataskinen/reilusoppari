/**
 * Kuitin luvun mock.
 *
 * ===========================================================================
 * MOCK EI KEKSI SUMMIA
 *
 * Se palauttaa tyhjän luennan: kaikki kentät `null`, aivan kuin kuitista ei
 * olisi saatu luettua mitään. Vaihtoehto — keksiä uskottavan näköinen summa
 * — olisi vaarallinen: kehityksessä lomake näyttäisi esitäytetyltä ja
 * toiminto vaikuttaisi valmiilta, eikä kukaan huomaisi, ettei sitä ole
 * koskaan kokeiltu oikealla kuitilla.
 *
 * Tyhjä luenta on myös se polku, joka oikeasti tapahtuu tuotannossa aina
 * välillä: huono valaistus, rypistynyt kuitti. Se kannattaa nähdä
 * kehityksessä usein.
 * ===========================================================================
 */

import { EMPTY_READING } from "./parse";
import type { ReadReceiptInput, ReadReceiptResult, ReceiptReader } from "./types";

export class MockReceiptReader implements ReceiptReader {
  /** Testien luettavissa: montako kuvaa on luettu ja minkä kokoisia. */
  readonly reads: Array<{ bytes: number; mediaType: string }> = [];

  async read(input: ReadReceiptInput): Promise<ReadReceiptResult> {
    this.reads.push({ bytes: input.imageBase64.length, mediaType: input.mediaType });

    return {
      ok: true,
      reading: EMPTY_READING,
      raw: "",
    };
  }
}
