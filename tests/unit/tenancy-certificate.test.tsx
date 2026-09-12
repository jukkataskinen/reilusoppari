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
  stats: {
    months: 36,
    rentPeriods: 36,
    rentOnTime: 34,
    rentSlightlyLate: 2,
    rentDelayed: 0,
    depositReturnedFull: true,
  },
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
    /*
      Kolme lukua, ei yhtä. "34/36 ajallaan" kertoo vähemmän kuin se, oliko
      kaksi muuta viikon myöhässä vai maksamatta (Jukan linjaus 2026-09-12).
    */
    expect(rows[1].value).toBe("36 kuukaudesta 34 ajallaan, 2 vähän myöhässä");
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
  /**
   * Paneelin taustavärin kokonaispinta-ala ensimmäisellä sivulla.
   *
   * ===========================================================================
   * MIKSI PINTA-ALA EIKÄ SIJAINTI
   *
   * Testi mittasi ensin kiinteää kaistaa sivulla (y 500–700) ja odotti siitä
   * nollaa. Se hajosi heti kun tilastorivi piteni ja sisältö siirtyi — vaikka
   * väite oli edelleen tosi. Kiinteä kaista mittaa taittoa, ei väitettä.
   *
   * Sijaintikaan ei kelpaa: asiakirjan pehmeät taustamuodot käyttävät samaa
   * sinistä, ja niitä on sivun ylä- ja alalaidassa riippumatta siitä, onko
   * suositusta.
   *
   * Pinta-ala erottelee sen, mikä tässä merkitsee. Jos suositus puuttuu,
   * KOKO paneeli puuttuu — ei tyhjää paneelia, ei paikanvaraajaa. Ero on
   * silloin paneelin kokoinen.
   * ===========================================================================
   */
  async function panelArea(bytes: Uint8Array): Promise<number> {
    const page = await rasterizePage(bytes, 1);
    return colorPixels(page, { x0: 0, y0: 0, x1: page.width, y1: page.height }, "#eaf1fb");
  }

  it("koko paneeli puuttuu, ei vain sen teksti", async () => {
    const [kanssa, ilman] = await Promise.all([
      renderDocumentPdf(<TenancyCertificate data={DATA} />),
      renderDocumentPdf(<TenancyCertificate data={{ ...DATA, rating: null, comment: null }} />),
    ]);

    const ero = (await panelArea(kanssa.bytes)) - (await panelArea(ilman.bytes));

    // Tyhjä paneeli tai paikanvaraaja veisi saman tilan, jolloin ero olisi
    // pieni. Kokonaisen paneelin verran on kymmeniätuhansia pikseleitä.
    expect(ero).toBeGreaterThan(40_000);
  }, 60_000);

  it("suosituksen kanssa paneeli on olemassa", async () => {
    const kanssa = await renderDocumentPdf(<TenancyCertificate data={DATA} />);
    expect(await panelArea(kanssa.bytes)).toBeGreaterThan(100_000);
  }, 30_000);

  it("todistus syntyy aina, myös ilman suositusta ja kommenttia", async () => {
    // Vastaanottaja ei voi estää todistuksen syntymistä (CLAUDE.md 5.8).
    const result = await renderDocumentPdf(
      <TenancyCertificate data={{ ...DATA, rating: null, comment: null, reply: null }} />,
    );
    expect(Buffer.from(result.bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);
});
