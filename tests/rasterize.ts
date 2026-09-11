/**
 * PDF:n sivu pikseleiksi testejä varten.
 *
 * Tarpeen siksi, että asiakirjan sisältö voi olla PDF:n sisältövirrassa
 * mutta silti näkymättä sivulla — juuri niin kävi alatunnisteelle
 * (`components.tsx`). Tekstihaku ei olisi huomannut sitä, pikselit
 * huomaavat.
 */
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

export interface RasterPage {
  width: number;
  height: number;
  /** RGBA-tavut riveittäin. */
  data: Uint8ClampedArray;
}

export async function rasterizePage(
  bytes: Uint8Array,
  pageNumber: number,
  dpi = 72,
): Promise<RasterPage> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: dpi / 72 });

  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  /**
   * Tyyppimuunnos: pdf.js odottaa selaimen `CanvasRenderingContext2D`:tä ja
   * `HTMLCanvasElement`:iä, `@napi-rs/canvas` tarjoaa niiden Node-vastineet.
   * Piirtorajapinta on sama, mutta tyypit eivät tunne toisiaan. Muunnos on
   * rajattu tähän yhteen kutsuun eikä se piilota mitään muuta.
   */
  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
    canvas: canvas as unknown as HTMLCanvasElement,
  }).promise;

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: image.data };
}

/** Montako pikseliä alueella ei ole valkoista? */
export function inkedPixels(
  page: RasterPage,
  area: { x0: number; y0: number; x1: number; y1: number },
): number {
  let count = 0;
  for (let y = area.y0; y < area.y1; y += 1) {
    for (let x = area.x0; x < area.x1; x += 1) {
      const i = (y * page.width + x) * 4;
      if (page.data[i] + page.data[i + 1] + page.data[i + 2] < 735) count += 1;
    }
  }
  return count;
}

/**
 * Montako pikseliä alueella on kylläisen sinistä?
 *
 * Erottaa kuvituksen taustamuodoista: taustamuodot ovat hyvin haaleita
 * (#eaf1fb), kuvituksen korostusväri on kylläinen (#3d8bff). Tämä on se ero,
 * jolla testi näkee onko asiakirjassa kuvitusta vai pelkkä pehmeä tausta.
 */
export function saturatedPixels(
  page: RasterPage,
  area: { x0: number; y0: number; x1: number; y1: number },
): number {
  let count = 0;
  for (let y = area.y0; y < area.y1; y += 1) {
    for (let x = area.x0; x < area.x1; x += 1) {
      const i = (y * page.width + x) * 4;
      const [r, g, b] = [page.data[i], page.data[i + 1], page.data[i + 2]];
      if (b > 180 && b - r > 70 && b - g > 40) count += 1;
    }
  }
  return count;
}
