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

  const bytes = new Uint8Array(await renderToBuffer(dated));

  return {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.length,
  };
}

/** Tiiviste valmiista tavuista. Sama laskenta kuin eSinetissä. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
