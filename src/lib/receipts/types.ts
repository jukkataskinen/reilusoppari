/**
 * Kuitin luvun rajapinta.
 *
 * Sama kuvio kuin `lib/esinetti/` ja `lib/billing/`: kapea rajapinta, oikea
 * toteutus ja mock. Avain puuttuu → mock, avain on → oikea. Kolmas kerta
 * samalla kaavalla, jotta kaikki ulkoiset palvelut käyttäytyvät tässä
 * repossa samalla tavalla.
 */

import type { ReceiptReading } from "./parse";

export interface ReadReceiptInput {
  /** Kuvan tavut base64:na, ilman data-URI-etuliitettä. */
  imageBase64: string;
  /** `image/jpeg` tai `image/png`. */
  mediaType: string;
}

export type ReadReceiptResult =
  | { ok: true; reading: ReceiptReading; raw: string }
  | { ok: false; status: number; message: string };

export interface ReceiptReader {
  read(input: ReadReceiptInput): Promise<ReadReceiptResult>;
}
