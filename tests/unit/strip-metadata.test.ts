import { describe, expect, it } from "vitest";
import {
  stripImageMetadata,
  UnsupportedImageError,
} from "@/lib/photos/strip-metadata";

/**
 * Kuvat rakennetaan tavu kerrallaan, ei tiedostoista.
 *
 * Testikuvatiedosto olisi läpinäkymätön: kukaan ei näkisi siitä, onko siinä
 * GPS-lohko vai ei. Tässä se on koodissa, joten testin väite on luettavissa.
 */

function jpeg(segments: Array<{ marker: number; payload: number[] }>): Uint8Array {
  const bytes: number[] = [0xff, 0xd8];

  for (const { marker, payload } of segments) {
    const length = payload.length + 2;
    bytes.push(0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload);
  }

  // SOS ja vähän "kuvadataa", jossa esiintyy tarkoituksella FF-tavuja.
  bytes.push(0xff, 0xda, 0x00, 0x03, 0x01, 0xff, 0x00, 0x12, 0x34, 0xff, 0xd9);
  return Uint8Array.from(bytes);
}

/** SOF0: korkeus ja leveys 16-bittisinä. */
function sof0(width: number, height: number): { marker: number; payload: number[] } {
  return {
    marker: 0xc0,
    payload: [0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0x01],
  };
}

/** APP1, jonka sisältö alkaa "Exif\0\0" ja sisältää GPS-merkkijonon. */
const EXIF_GPS = {
  marker: 0xe1,
  payload: [
    ...[0x45, 0x78, 0x69, 0x66, 0x00, 0x00],
    ...Array.from("GPSLatitude 60.1699", (c) => c.charCodeAt(0)),
  ],
};

const JFIF = { marker: 0xe0, payload: [0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01] };
const COMMENT = { marker: 0xfe, payload: Array.from("Otettu iPhonella", (c) => c.charCodeAt(0)) };

function png(chunks: Array<{ type: string; data: number[] }>): Uint8Array {
  const bytes: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  for (const { type, data } of chunks) {
    const length = data.length;
    bytes.push((length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff);
    bytes.push(...Array.from(type, (c) => c.charCodeAt(0)));
    bytes.push(...data);
    bytes.push(0, 0, 0, 0); // CRC: ei tarkisteta, koska lohkoja ei muuteta.
  }

  return Uint8Array.from(bytes);
}

function ihdr(width: number, height: number): { type: string; data: number[] } {
  return {
    type: "IHDR",
    data: [
      (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
      (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
      8, 2, 0, 0, 0,
    ],
  };
}

const teksti = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("JPEG", () => {
  it("poistaa EXIF:n ja sen mukana sijainnin", () => {
    // Kuva kodista, jossa on koordinaatit, on eri asia kuin kuva kodista.
    const alku = jpeg([JFIF, EXIF_GPS, sof0(2000, 1500)]);
    expect(teksti(alku)).toContain("GPSLatitude");

    const tulos = stripImageMetadata(alku);
    expect(teksti(tulos.bytes)).not.toContain("GPSLatitude");
    expect(teksti(tulos.bytes)).not.toContain("Exif");
    expect(tulos.removedSegments).toBe(1);
  });

  it("poistaa myös kommentin", () => {
    const tulos = stripImageMetadata(jpeg([JFIF, COMMENT, sof0(100, 100)]));
    expect(teksti(tulos.bytes)).not.toContain("iPhonella");
    expect(tulos.removedSegments).toBe(1);
  });

  it("säilyttää JFIF-lohkon ja kuvadatan", () => {
    // JFIF kertoo pikselitiheyden eikä kuvaajasta mitään.
    const tulos = stripImageMetadata(jpeg([JFIF, EXIF_GPS, sof0(100, 100)]));
    expect(teksti(tulos.bytes)).toContain("JFIF");

    // Kuvadata kopioidaan SOS:sta loppuun sellaisenaan, FF-tavut mukaan lukien.
    // Loppu on kuvadata ja EOI (FFD9). FF00 keskellä on dataa, ei merkki.
    expect(Array.from(tulos.bytes.slice(-6))).toEqual([0xff, 0x00, 0x12, 0x34, 0xff, 0xd9]);
  });

  it("lukee mitat kehysotsakkeesta", () => {
    const tulos = stripImageMetadata(jpeg([JFIF, sof0(2000, 1500)]));
    expect(tulos.width).toBe(2000);
    expect(tulos.height).toBe(1500);
  });

  it("ei muuta kuvaa, jossa ei ole metatietoja", () => {
    const alku = jpeg([JFIF, sof0(100, 100)]);
    const tulos = stripImageMetadata(alku);

    expect(tulos.removedSegments).toBe(0);
    expect(Array.from(tulos.bytes)).toEqual(Array.from(alku));
  });

  it("poistaa useita metalohkoja kerralla", () => {
    const xmp = { marker: 0xe2, payload: Array.from("XMP", (c) => c.charCodeAt(0)) };
    const tulos = stripImageMetadata(jpeg([JFIF, EXIF_GPS, xmp, COMMENT, sof0(10, 10)]));
    expect(tulos.removedSegments).toBe(3);
  });
});

describe("PNG", () => {
  it("poistaa tekstilohkot mutta säilyttää kuvan", () => {
    const alku = png([
      ihdr(800, 600),
      { type: "tEXt", data: Array.from("Comment\0Kotoa", (c) => c.charCodeAt(0)) },
      { type: "eXIf", data: Array.from("GPSLatitude", (c) => c.charCodeAt(0)) },
      { type: "IDAT", data: [1, 2, 3, 4] },
      { type: "IEND", data: [] },
    ]);

    const tulos = stripImageMetadata(alku);
    expect(teksti(tulos.bytes)).not.toContain("GPSLatitude");
    expect(teksti(tulos.bytes)).not.toContain("Kotoa");
    expect(teksti(tulos.bytes)).toContain("IDAT");
    expect(tulos.removedSegments).toBe(2);
  });

  it("lukee mitat IHDR-lohkosta", () => {
    const tulos = stripImageMetadata(
      png([ihdr(800, 600), { type: "IDAT", data: [1] }, { type: "IEND", data: [] }]),
    );
    expect(tulos.width).toBe(800);
    expect(tulos.height).toBe(600);
  });

  it("pudottaa tuntemattoman lohkotyypin", () => {
    // Sallittujen lista eikä kiellettyjen: tuntematon lohko on tuntematon.
    const tulos = stripImageMetadata(
      png([
        ihdr(10, 10),
        { type: "zZzZ", data: [9, 9, 9] },
        { type: "IDAT", data: [1] },
        { type: "IEND", data: [] },
      ]),
    );
    expect(tulos.removedSegments).toBe(1);
  });

  it("säilyttää väriprofiilin", () => {
    // Todistekuvassa väri on sisältöä: ilman profiilia se voi muuttua.
    const tulos = stripImageMetadata(
      png([
        ihdr(10, 10),
        { type: "sRGB", data: [0] },
        { type: "IDAT", data: [1] },
        { type: "IEND", data: [] },
      ]),
    );
    expect(teksti(tulos.bytes)).toContain("sRGB");
    expect(tulos.removedSegments).toBe(0);
  });
});

describe("muut muodot", () => {
  it("hylätään, eikä niitä tallenneta", () => {
    // Tuntemattoman tiedoston sisällöstä ei tiedetä mitään, eikä sitä voi
    // puhdistaa. Silloin sitä ei oteta vastaan.
    for (const roska of [
      new Uint8Array([0, 1, 2, 3]),
      new Uint8Array(Array.from("GIF89a", (c) => c.charCodeAt(0))),
      new Uint8Array(0),
    ]) {
      expect(() => stripImageMetadata(roska)).toThrow(UnsupportedImageError);
    }
  });
});
