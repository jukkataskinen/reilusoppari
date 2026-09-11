/**
 * Asiakirjan renderöinti PDF:ksi (DECISIONS.md 2026-09-11: Reilusoppari tekee
 * PDF:nsä itse, eSinetti vain allekirjoittaa ja sinetöi).
 *
 * ===========================================================================
 * DETERMINISMI ON TÄSSÄ TARKOITUS, EI SIVUTUOTE
 *
 * Asiakirjasta lasketaan SHA-256, ja se tiiviste päätyy pöytäkirjaan,
 * webhookiin ja lopulta todistukseen. Jos sama sisältö tuottaisi eri tavut
 * joka kerta, tiiviste ei tarkoittaisi mitään: esikatselun ja
 * allekirjoitettavan asiakirjan vertaaminen olisi mahdotonta.
 *
 * PDF:ään päätyy oletuksena luontiaika, joka muuttuu joka ajolla. Siksi
 * `creationDate` ja `modificationDate` annetaan aina eksplisiittisesti.
 * Kutsuja antaa `documentDate`n — yleensä sopimuksen päiväys tai
 * katselmuksen lukitusaika — eikä kellonaikaa oteta koneelta.
 * ===========================================================================
 */

import { createHash } from "node:crypto";
import { cloneElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { registerDocumentFonts } from "./fonts";

export interface RenderedDocument {
  bytes: Uint8Array;
  sha256: string;
  sizeBytes: number;
}

export interface RenderOptions {
  /**
   * Asiakirjan päiväys. Määrää PDF:n aikaleimat, joten sama syöte ja sama
   * päiväys tuottavat samat tavut. Anna sopimuksen päiväys tai katselmuksen
   * lukitusaika — älä `new Date()`.
   */
  documentDate: Date;
}

/**
 * Renderöi asiakirjan ja laskee sen tiivisteen.
 *
 * Fontit rekisteröidään tässä eikä moduulin latauksessa: rekisteröinti lukee
 * tiedostoja levyltä, eikä sitä pidä tehdä vain siksi, että joku importtaa
 * tämän moduulin.
 */
export async function renderDocumentPdf(
  element: ReactElement<DocumentProps>,
  options: RenderOptions,
): Promise<RenderedDocument> {
  registerDocumentFonts();

  // Aikaleimat asetetaan tässä eikä jätetä kutsujan muistettavaksi: yksi
  // unohdus tekisi juuri sen asiakirjan tiivisteestä epävakaan, eikä sitä
  // huomaisi ennen kuin esikatselun ja allekirjoitetun asiakirjan tiivisteet
  // eroaisivat tuotannossa.
  const dated = cloneElement(element, {
    creationDate: options.documentDate,
    modificationDate: options.documentDate,
  });

  const bytes = normalizeFileId(await renderToBuffer(dated));

  return {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.length,
  };
}

/** `/ID [<32 heksaa> <32 heksaa>]` PDF:n trailerissa. */
const ID_MARKER = "/ID [<";
const ID_HEX_LENGTH = 32;
/** Ensimmäisen ja toisen tunnisteen välissä on `> <`. */
const ID_SEPARATOR_LENGTH = 3;

/**
 * Korvaa PDF:n satunnaisen tiedostotunnisteen sisällöstä johdetulla.
 *
 * ===========================================================================
 * MIKSI TÄMÄ ON TARPEEN
 *
 * PDF:n trailerissa on `/ID`, jonka pdfkit arpoo joka ajolla. Se on ainoa
 * kohta, jossa kahden identtisen renderöinnin tavut eroavat — kaikki muu on
 * jo vakaata. Ilman tätä asiakirjan SHA-256 muuttuisi joka kerta, eikä
 * esikatselun ja allekirjoitettavan asiakirjan vertaaminen tiivisteellä
 * tarkoittaisi mitään.
 *
 * Tunniste johdetaan asiakirjan omasta sisällöstä: tunnisteen paikka
 * nollataan, lasketaan tiiviste, ja tiivisteen alku kirjoitetaan tunnisteeksi.
 * Tämä on PDF-standardin hengen mukaista — `/ID` on tiedoston tunniste, ja
 * sisällöstä johdettu tunniste on nimenomaan sitä.
 *
 * Molemmat tunnisteet saavat saman arvon. Ne eroaisivat vain, jos tiedostoa
 * olisi päivitetty alkuperäisen luonnin jälkeen; näitä asiakirjoja ei
 * päivitetä, vaan uusi versio on uusi asiakirja.
 * ===========================================================================
 */
export function normalizeFileId(input: Buffer): Uint8Array {
  const buffer = Buffer.from(input);

  const marker = buffer.lastIndexOf(ID_MARKER, buffer.length, "latin1");
  if (marker === -1) return new Uint8Array(buffer);

  const first = marker + ID_MARKER.length;
  const second = first + ID_HEX_LENGTH + ID_SEPARATOR_LENGTH;
  if (second + ID_HEX_LENGTH > buffer.length) return new Uint8Array(buffer);

  const zeros = "0".repeat(ID_HEX_LENGTH);
  buffer.write(zeros, first, "latin1");
  buffer.write(zeros, second, "latin1");

  const digest = createHash("sha256").update(buffer).digest("hex").slice(0, ID_HEX_LENGTH);
  buffer.write(digest, first, "latin1");
  buffer.write(digest, second, "latin1");

  return new Uint8Array(buffer);
}

/** Tiiviste valmiista tavuista. Sama laskenta kuin eSinetissä. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
