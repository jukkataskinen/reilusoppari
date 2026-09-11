/**
 * Pienin mahdollinen aito PDF mock-toteutusta varten.
 *
 * ===========================================================================
 * MIKSI OIKEA PDF EIKÄ PLACEHOLDER-TAVUJA
 *
 * Vaiheen 0 DoD on "mock-render palauttaa PDF:n". Jos mock palauttaisi
 * mielivaltaisia tavuja, esikatselu näyttäisi rikkinäiseltä ja e2e-testi
 * todistaisi vain, että jotain tuli. Tämä tuottaa tiedoston, jonka selain ja
 * `pdf`-työkalut oikeasti avaavat — silloin esikatselunäkymää voi kehittää
 * ilman eSinetti-tunnuksia.
 *
 * Tämä EI ole asiakirjageneraattori. Oikeat asiakirjat syntyvät eSinetin
 * `/documents/render`-kutsulla `templates/`-pohjista; tämä on vain mockin
 * sisuskalu, eikä sitä saa kutsua sovelluskoodista.
 * ===========================================================================
 */

/** A4 pisteinä. */
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 56;
const FONT_SIZE = 11;
const LEADING = 15;

/**
 * Merkit, joita PDF:n WinAnsiEncoding ei tunne Latin-1:n mukaisesti.
 * Suomenkielisessä tekstissä esiintyy ajatusviivaa ja euroa, joten ne
 * kartoitetaan käsin — muuten ne muuttuisivat kysymysmerkeiksi.
 */
const WINANSI_EXTRAS: Record<string, number> = {
  "€": 0x80, // €
  "‚": 0x82,
  "…": 0x85, // …
  "‘": 0x91,
  "’": 0x92, // '
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96, // –
  "—": 0x97, // —
};

/** Merkkijono PDF:n literaaliksi: sulut ja kenoviiva pakoon, ei-ASCII oktaaliksi. */
function escapePdfText(value: string): string {
  let out = "";
  for (const ch of value) {
    if (ch === "(" || ch === ")" || ch === "\\") {
      out += "\\" + ch;
      continue;
    }
    const extra = WINANSI_EXTRAS[ch];
    if (extra !== undefined) {
      out += "\\" + extra.toString(8).padStart(3, "0");
      continue;
    }
    const code = ch.codePointAt(0) ?? 63;
    if (code === 9) out += "    ";
    else if (code < 32) out += " ";
    else if (code < 127) out += ch;
    else if (code < 256) out += "\\" + code.toString(8).padStart(3, "0");
    else out += "?";
  }
  return out;
}

/** Katkaisee rivin sivun leveyteen. Leveysarvio riittää mockille: Helvetica ≈ 0,5 × fonttikoko per merkki. */
function wrap(line: string, maxChars: number): string[] {
  if (line.length <= maxChars) return [line];
  const words = line.split(" ");
  const rows: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && (current + " " + word).length > maxChars) {
      rows.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) rows.push(current);
  return rows;
}

export interface MockPdfInput {
  title: string;
  /** Rivit leipätekstinä. Tyhjä merkkijono on tyhjä rivi. */
  lines: string[];
}

/**
 * Rakentaa yksisivuisen PDF:n. Deterministinen: sama syöte → samat tavut,
 * joten SHA-256 on vakaa eivätkä testit vilku.
 */
export function buildMockPdf(input: MockPdfInput): Uint8Array {
  const maxChars = Math.floor((PAGE_WIDTH - 2 * MARGIN) / (FONT_SIZE * 0.5));
  const body: string[] = [];
  for (const line of input.lines) {
    if (line === "") body.push("");
    else body.push(...wrap(line, maxChars));
  }

  const ops: string[] = ["BT", "/F1 16 Tf", MARGIN + " " + (PAGE_HEIGHT - MARGIN) + " Td"];
  ops.push("(" + escapePdfText(input.title) + ") Tj");
  ops.push("/F1 " + FONT_SIZE + " Tf", LEADING + " TL", "0 -" + LEADING * 2 + " Td");
  for (const line of body) {
    ops.push("(" + escapePdfText(line) + ") Tj", "T*");
  }
  ops.push("ET");
  const content = ops.join("\n");

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " +
      PAGE_WIDTH +
      " " +
      PAGE_HEIGHT +
      "] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    "<< /Length " + Buffer.byteLength(content, "latin1") + " >>\nstream\n" + content + "\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += index + 1 + " 0 obj\n" + obj + "\nendobj\n";
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += "xref\n0 " + (objects.length + 1) + "\n";
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets) {
    pdf += String(offset).padStart(10, "0") + " 00000 n \n";
  }
  pdf +=
    "trailer\n<< /Size " +
    (objects.length + 1) +
    " /Root 1 0 R >>\nstartxref\n" +
    xrefOffset +
    "\n%%EOF\n";

  return Uint8Array.from(Buffer.from(pdf, "latin1"));
}
