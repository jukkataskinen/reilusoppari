import { describe, expect, it } from "vitest";
import { Document, Page, Text } from "@react-pdf/renderer";
import { renderDocumentPdf } from "@/documents/render";
import { FONT_FAMILY, colors, type as typeScale } from "@/documents/theme";

/**
 * Renderöinnin perustestit.
 *
 * Tärkein on determinismi: asiakirjasta lasketaan tiiviste, joka päätyy
 * pöytäkirjaan ja todistukseen. Jos sama sisältö tuottaisi eri tavut joka
 * ajolla, tiiviste ei tarkoittaisi mitään — eikä sitä huomaisi mistään,
 * koska PDF näyttäisi joka kerta oikealta.
 */

const PAIVAYS = new Date("2026-10-01T00:00:00.000Z");

function sample(teksti = "Jyväskylä – vuokra 850 €/kk") {
  return (
    <Document title="Testi">
      <Page size="A4" style={{ fontFamily: FONT_FAMILY, padding: 40 }}>
        <Text style={{ fontSize: typeScale.title, fontWeight: 700, color: colors.ink }}>
          Vuokrasopimus
        </Text>
        <Text style={{ fontSize: typeScale.body, color: colors.inkSoft }}>{teksti}</Text>
      </Page>
    </Document>
  );
}

describe("asiakirjan renderöinti", () => {
  it("tuottaa aidon PDF:n ja sen tiivisteen", async () => {
    const result = await renderDocumentPdf(sample(), { documentDate: PAIVAYS });

    expect(Buffer.from(result.bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(result.sizeBytes).toBe(result.bytes.length);
    expect(result.sha256).toHaveLength(64);
  });

  it("sama sisältö ja päiväys tuottavat samat tavut", async () => {
    const first = await renderDocumentPdf(sample(), { documentDate: PAIVAYS });
    const second = await renderDocumentPdf(sample(), { documentDate: PAIVAYS });

    expect(second.sha256).toBe(first.sha256);
  });

  it("eri sisältö tuottaa eri tiivisteen", async () => {
    const a = await renderDocumentPdf(sample("Vuokra 850 €/kk"), { documentDate: PAIVAYS });
    const b = await renderDocumentPdf(sample("Vuokra 900 €/kk"), { documentDate: PAIVAYS });

    expect(b.sha256).not.toBe(a.sha256);
  });

  it("eri päiväys tuottaa eri tiivisteen", async () => {
    // Päiväys on osa asiakirjaa. Jos se ei näkyisi tiivisteessä, kaksi eri
    // päivänä tehtyä sopimusta olisivat tiivisteeltään samat.
    const a = await renderDocumentPdf(sample(), { documentDate: PAIVAYS });
    const b = await renderDocumentPdf(sample(), {
      documentDate: new Date("2026-10-02T00:00:00.000Z"),
    });

    expect(b.sha256).not.toBe(a.sha256);
  });

  it("suomalaiset merkit säilyvät", async () => {
    const result = await renderDocumentPdf(sample("Mäkitie 12 A 4, 40100 Jyväskylä — ääkköset"), {
      documentDate: PAIVAYS,
    });
    // Fontti on upotettu, joten tekstiä ei voi etsiä raakatavuista. Riittää
    // että renderöinti ei kaadu eikä pudota merkkejä: puuttuva glyyfi
    // aiheuttaisi react-pdf:ssä virheen.
    expect(result.sizeBytes).toBeGreaterThan(2000);
  });
});
