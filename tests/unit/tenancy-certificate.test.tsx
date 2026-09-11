import { describe, expect, it } from "vitest";
import {
  TenancyCertificate,
  buildStatRows,
  formatDuration,
  type CertificateData,
} from "@/documents/TenancyCertificate";
import { renderDocumentPdf } from "@/documents/render";
import { colorPixels, inkedPixels, rasterizePage } from "../rasterize";

/**
 * Vuokratodistuksen testit.
 *
 * Tärkein on viimeinen ryhmä: puuttuva suositus ei saa näkyä todistuksesta
 * mitenkään (DECISIONS.md 2026-09-10). Se on helppo rikkoa vahingossa —
 * riittää, että joku lisää otsikon tai välin suositusosion ympärille.
 */

const DATA: CertificateData = {
  for: "tenant",
  subjectName: "Maija Meikäläinen",
  issuerName: "Matti Virtanen, vuokranantaja",
  property: { street: "Mäkitie 12 A 4", postalCode: "40100", city: "Jyväskylä" },
  startDate: "2023-09-01",
  endDate: "2026-08-31",
  rating: "recommend",
  comment: "Luotettava ja mukava vuokralainen.",
  reply: null,
  stats: { months: 36, rentConfirmedOnTime: 36, rentPeriods: 36, depositReturnedFull: true },
  verifyUrl: "https://reilusoppari.fi/todistus/8f2a1c7d9e",
  sealedDate: "2026-09-08",
};

describe("keston muotoilu", () => {
  it("taipuu oikein", () => {
    expect(formatDuration(1)).toBe("1 kuukausi");
    expect(formatDuration(8)).toBe("8 kuukautta");
    expect(formatDuration(12)).toBe("1 vuosi");
    expect(formatDuration(36)).toBe("3 vuotta");
    expect(formatDuration(14)).toBe("1 vuosi 2 kuukautta");
    expect(formatDuration(25)).toBe("2 vuotta 1 kuukausi");
  });
});

describe("tilastorivit", () => {
  it("vuokralaisen todistuksessa kerrotaan kuittaukset, ei vikoja", () => {
    const rows = buildStatRows(DATA);
    expect(rows.map((r) => r.label)).toEqual(["Vuokrasuhde", "Vuokrat", "Vakuus"]);
    expect(rows[1].value).toBe("Kuitattu ajallaan 36 / 36");
    // Lähde sanotaan ääneen: nämä eivät ole pankin vahvistamia maksuja.
    expect(rows[1].detail).toBe("Vuokranantajan omat kuittaukset");
  });

  it("vuokranantajan todistuksessa kerrotaan viat, ei kuittauksia", () => {
    const rows = buildStatRows({
      ...DATA,
      for: "landlord",
      stats: { months: 36, defectsReported: 3, defectsResolved: 3, depositReturnedFull: true },
    });
    expect(rows.map((r) => r.label)).toEqual(["Vuokrasuhde", "Viat", "Vakuus"]);
  });

  it("ei käytä luottotietosanastoa", () => {
    // CLAUDE.md kohta 2: vuokratodistus, ei luottotieto/maksuhäiriö/maksumoraali.
    const teksti = buildStatRows(DATA)
      .flatMap((r) => [r.label, r.value, r.detail ?? ""])
      .join(" ")
      .toLowerCase();

    for (const kielletty of ["luottotieto", "maksuhäiriö", "maksumoraali", "perintä"]) {
      expect(teksti).not.toContain(kielletty);
    }
  });

  it("puuttuva tilasto jätetään pois eikä näytetä nollana", () => {
    const rows = buildStatRows({ ...DATA, stats: { months: 12 } });
    expect(rows.map((r) => r.label)).toEqual(["Vuokrasuhde"]);
  });
});

describe("todistus mahtuu yhdelle sivulle", () => {
  it("suosituksen kanssa ja ilman", async () => {
    const suosituksella = await renderDocumentPdf(<TenancyCertificate data={DATA} />);
    const ilman = await renderDocumentPdf(
      <TenancyCertificate data={{ ...DATA, rating: null, comment: null }} />,
    );

    // Todistus näytetään yhdellä silmäyksellä; toiselle sivulle valuminen
    // tarkoitti aiemmin kahta tyhjää sivua eikä vain pidempää asiakirjaa.
    for (const result of [suosituksella, ilman]) {
      const page = await rasterizePage(result.bytes, 1);
      expect(inkedPixels(page, { x0: 0, y0: 0, x1: page.width, y1: page.height })).toBeGreaterThan(
        5000,
      );
    }
  }, 30_000);
});

describe("puuttuva suositus ei näy todistuksessa", () => {
  it("ei jätä tyhjää tilaa eikä paikanvaraajaa", async () => {
    const ilman = await renderDocumentPdf(
      <TenancyCertificate data={{ ...DATA, rating: null, comment: null }} />,
    );
    const page = await rasterizePage(ilman.bytes, 1);

    /**
     * Tilastopaneelin alapuolella ei saa olla YHTÄÄN paneelin taustaväriä.
     *
     * Tyhjän tilan mittaaminen ei kelpaisi: ilman suositusta seuraava sisältö
     * siirtyy ylös ja täyttää saman kohdan. Juuri se on tarkoituskin. Siksi
     * testi etsii paneelin taustaväriä, jota siellä ei ole jos paneelia ei ole.
     */
    const alue = { x0: 0, y0: 500, x1: page.width, y1: 700 };
    expect(colorPixels(page, alue, "#eaf1fb")).toBe(0);
  }, 30_000);

  it("suosituksen kanssa samassa kohdassa on paneeli", async () => {
    const kanssa = await renderDocumentPdf(<TenancyCertificate data={DATA} />);
    const page = await rasterizePage(kanssa.bytes, 1);

    const alue = { x0: 0, y0: 500, x1: page.width, y1: 700 };
    expect(colorPixels(page, alue, "#eaf1fb")).toBeGreaterThan(10_000);
  }, 30_000);

  it("todistus syntyy aina, myös ilman suositusta ja kommenttia", async () => {
    // Vastaanottaja ei voi estää todistuksen syntymistä (CLAUDE.md 5.8).
    const result = await renderDocumentPdf(
      <TenancyCertificate data={{ ...DATA, rating: null, comment: null, reply: null }} />,
    );
    expect(Buffer.from(result.bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);
});
