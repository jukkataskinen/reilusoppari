/**
 * Kuvan metatietojen poisto palvelimella (CLAUDE.md kohta 6).
 *
 * ===========================================================================
 * MIKSI PALVELIN EIKÄ SELAIN
 *
 * Selain poistaa EXIF:n jo pakatessaan kuvan canvasin kautta, mutta siihen ei
 * voi luottaa: selaimessa ajettavan koodin voi ohittaa, ja kuvan voi lähettää
 * suoraan rajapintaan sellaisena kuin se on. Jos EXIF:n poisto olisi vain
 * siellä, sijaintitieto olisi tallessa aina kun joku niin haluaa.
 *
 * Erityisesti GPS. Kuva kodista, jossa on koordinaatit, on eri asia kuin kuva
 * kodista. Vuokralainen ei ole antanut kotinsa sijaintia vuokranantajalle
 * vain siksi, että hän kuvasi keittiön lattian.
 *
 * MIKSI ILMAN KIRJASTOA
 *
 * `sharp` osaisi tämän, mutta se on iso natiiviriippuvuus, ja sen mukana
 * tulisi kuvankäsittely jota ei tarvita. Tässä ei muokata kuvaa vaan
 * poistetaan tavuja: JPEG:stä APPn- ja COM-lohkot, PNG:stä kaikki
 * sivulohkot paitsi ne, joita ilman kuva ei näy oikein.
 *
 * Kuvapikselit eivät muutu lainkaan. Se on tarkoitus: tiiviste lasketaan
 * siitä tiedostosta, joka tallennetaan, ja sen on oltava sama asiakirjassa ja
 * levyllä.
 * ===========================================================================
 */

export type ImageFormat = "image/jpeg" | "image/png";

export interface StrippedImage {
  bytes: Uint8Array;
  format: ImageFormat;
  width: number | null;
  height: number | null;
  /** Poistettujen lohkojen määrä. Testit ja loki käyttävät tätä. */
  removedSegments: number;
}

export class UnsupportedImageError extends Error {
  constructor(message = "Tuntematon kuvamuoto.") {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

/** JPEG alkaa aina SOI-merkillä `FFD8`. */
function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length > 8 && PNG_SIGNATURE.every((expected, index) => bytes[index] === expected)
  );
}

/**
 * JPEG: pudotetaan APP1…APP15 (EXIF, XMP, IPTC, Photoshop) ja kommentit.
 *
 * APP0 (JFIF) jätetään: se kertoo pikselitiheyden, ei kuvaajasta mitään, ja
 * jotkin katseluohjelmat odottavat sitä. Ei myöskään APP2:n ICC-profiilia —
 * ilman sitä värit voivat muuttua, ja todistekuvassa väri on sisältöä.
 */
function stripJpeg(bytes: Uint8Array): StrippedImage {
  const out: number[] = [0xff, 0xd8];
  let index = 2;
  let removed = 0;
  let width: number | null = null;
  let height: number | null = null;

  while (index < bytes.length) {
    if (bytes[index] !== 0xff) {
      // Merkkien välissä ei kuuluisi olla mitään. Jos on, kuva on rikki tai
      // se ei ole JPEG — kopioidaan loput sellaisenaan eikä arvailla.
      for (let i = index; i < bytes.length; i += 1) out.push(bytes[i]);
      break;
    }

    const marker = bytes[index + 1];

    // SOS: tästä alkaa pakattu kuvadata, joka jatkuu tiedoston loppuun.
    // Sitä ei jäsennetä — siellä `FFxx` ei ole merkki vaan dataa.
    if (marker === 0xda) {
      for (let i = index; i < bytes.length; i += 1) out.push(bytes[i]);
      break;
    }

    const length = (bytes[index + 2] << 8) | bytes[index + 3];
    const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;

    // SOF0…SOF15 (paitsi DHT FFC4, JPG FFC8 ja DAC FFCC) kertovat mitat.
    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isFrameHeader) {
      height = (bytes[index + 5] << 8) | bytes[index + 6];
      width = (bytes[index + 7] << 8) | bytes[index + 8];
    }

    if (isMetadata) {
      removed += 1;
    } else {
      for (let i = index; i < index + 2 + length; i += 1) out.push(bytes[i]);
    }

    index += 2 + length;
  }

  return {
    bytes: Uint8Array.from(out),
    format: "image/jpeg",
    width,
    height,
    removedSegments: removed,
  };
}

/**
 * PNG: säilytetään vain ne lohkot, joita ilman kuva ei näy oikein.
 *
 * Sallittujen lista eikä kiellettyjen: uusi lohkotyyppi, jota tässä ei
 * tunneta, on tuntematon eikä siksi luotettava. Kiellettyjen lista päästäisi
 * sen läpi hiljaa.
 */
const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP"]);

function stripPng(bytes: Uint8Array): StrippedImage {
  const out: number[] = [...PNG_SIGNATURE];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let index = 8;
  let removed = 0;
  let width: number | null = null;
  let height: number | null = null;

  while (index + 8 <= bytes.length) {
    const length = view.getUint32(index);
    const type = String.fromCharCode(
      bytes[index + 4],
      bytes[index + 5],
      bytes[index + 6],
      bytes[index + 7],
    );

    const total = 12 + length;
    if (index + total > bytes.length) break;

    if (type === "IHDR") {
      width = view.getUint32(index + 8);
      height = view.getUint32(index + 12);
    }

    if (PNG_KEEP.has(type)) {
      for (let i = index; i < index + total; i += 1) out.push(bytes[i]);
    } else {
      removed += 1;
    }

    index += total;
    if (type === "IEND") break;
  }

  return {
    bytes: Uint8Array.from(out),
    format: "image/png",
    width,
    height,
    removedSegments: removed,
  };
}

/**
 * Poistaa metatiedot ja palauttaa tallennettavat tavut.
 *
 * Heittää, jos muoto ei ole JPEG tai PNG. Tuntematonta tiedostoa ei
 * tallenneta: sen sisällöstä ei tiedetä mitään, eikä sitä voi puhdistaa.
 */
export function stripImageMetadata(bytes: Uint8Array): StrippedImage {
  if (isJpeg(bytes)) return stripJpeg(bytes);
  if (isPng(bytes)) return stripPng(bytes);
  throw new UnsupportedImageError();
}
