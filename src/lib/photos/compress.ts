/**
 * Kuvan pienennys selaimessa ennen lähetystä (CLAUDE.md kohta 2).
 *
 * ===========================================================================
 * MIKSI PAKATAAN ASIAKASPÄÄSSÄ
 *
 * Puhelimen kamera tuottaa 3–8 megatavun kuvia. Niiden lähettäminen asunnossa
 * mobiiliverkossa kestää kauan, ja katselmuksessa otetaan kymmeniä kuvia
 * peräkkäin. 2000 pikselin pitkä sivu riittää siihen, mihin kuvaa käytetään:
 * sen näkee, onko lattiassa naarmu.
 *
 * Canvasin läpi piirtäminen pudottaa samalla EXIF:n. Se on hyödyllinen
 * sivuvaikutus muttei se, mihin luotetaan — palvelin poistaa metatiedot
 * uudelleen (`strip-metadata.ts`), koska tämän koodin voi ohittaa.
 *
 * HEIC
 *
 * iPhone tallentaa HEIC-muodossa. Selain osaa purkaa sen näytölle, joten
 * canvas saa siitä pikselit ja tuloksena on JPEG. Palvelimelle ei siis päädy
 * muotoa, jota se ei osaa käsitellä.
 * ===========================================================================
 */

export const MAX_EDGE = 2000;
export const JPEG_QUALITY = 0.82;

export interface CompressedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

/** Mitat, jotka mahtuvat `MAX_EDGE`-neliöön kuvasuhde säilyttäen. */
export function scaledSize(
  width: number,
  height: number,
  maxEdge = MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };

  const ratio = maxEdge / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

/**
 * Pienentää kuvan ja muuntaa sen JPEG:ksi.
 *
 * Heittää, jos tiedostoa ei saa auki kuvana. Sitä ei niellä: käyttäjän on
 * tiedettävä, ettei kuva mennyt perille — hiljainen epäonnistuminen
 * katselmuksessa tarkoittaa puuttuvaa todistetta.
 */
export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  const bitmap = await createImageBitmap(file);

  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Selain ei osaa käsitellä kuvaa.");

    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );

    if (!blob) throw new Error("Kuvan pakkaus epäonnistui.");
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
