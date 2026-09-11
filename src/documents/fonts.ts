/**
 * Asiakirjojen fontit.
 *
 * Plus Jakarta Sans, sama kuin sovelluksessa ja sivustolla. React-PDF ei lue
 * woff2-muotoa eikä osaa muuttuvia fontteja, joten leikkaukset ovat erillisiä
 * staattisia TTF-tiedostoja (`fonts/`, muunnettu `@fontsource`-paketista).
 */

import path from "node:path";
import { Font } from "@react-pdf/renderer";

let registered = false;

export function registerDocumentFonts(): void {
  if (registered) return;

  /**
   * Tavutus pois päältä.
   *
   * React-PDF tavuttaa oletuksena englannin säännöillä, ja suomenkielisessä
   * tekstissä tulos on väärä: "vi-imeistään", "sovi-tussa", "ilmoit-taa".
   * Väärin tavutettu sana on asiakirjassa pahempi kuin hieman epätasainen
   * oikea reuna — ja tämä on asiakirja, jonka kaksi ihmistä lukee ja
   * allekirjoittaa.
   *
   * Suomen tavutussanakirjaa ei ole saatavilla, joten oikea valinta on olla
   * tavuttamatta lainkaan.
   */
  Font.registerHyphenationCallback((word) => [word]);
  const dir = path.join(process.cwd(), "src/documents/fonts");
  Font.register({
    family: "Jakarta",
    fonts: [
      { src: path.join(dir, "plus-jakarta-sans-400.ttf"), fontWeight: 400 },
      { src: path.join(dir, "plus-jakarta-sans-600.ttf"), fontWeight: 600 },
      { src: path.join(dir, "plus-jakarta-sans-700.ttf"), fontWeight: 700 },
    ],
  });
  registered = true;
}
