/**
 * PDF:n sivu PNG-kuvaksi tarkastelua varten.
 *
 *   node scripts/pdf-to-png.mjs asiakirja.pdf ulos-perusnimi [dpi]
 *
 * Kehitystyökalu: asiakirjan ulkoasua ei voi arvioida lukematta sitä, eikä
 * PDF:ää voi katsoa päätteestä. Ei osa sovellusta.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const [, , input, outBase = "sivu", dpi = "110"] = process.argv;
const scale = Number(dpi) / 72;

const data = new Uint8Array(readFileSync(input));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

for (let n = 1; n <= doc.numPages; n += 1) {
  const page = await doc.getPage(n);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  const out = `${outBase}-${n}.png`;
  writeFileSync(out, canvas.toBuffer("image/png"));
  console.log(out, canvas.width + "x" + canvas.height);
}
