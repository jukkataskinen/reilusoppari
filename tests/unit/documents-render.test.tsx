import { describe, expect, it } from "vitest";
import { Page, Text } from "@react-pdf/renderer";
import { DocumentRoot } from "@/documents/components";
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

const PAIVAYS = "2026-10-01";

function sample(teksti = "Jyväskylä – vuokra 850 €/kk", paivays = PAIVAYS) {
  return (
    <DocumentRoot title="Testi" subject="Testi" date={paivays}>
      <Page size="A4" style={{ fontFamily: FONT_FAMILY, padding: 40 }}>
        <Text style={{ fontSize: typeScale.title, fontWeight: 700, color: colors.ink }}>
          Vuokrasopimus
        </Text>
        <Text style={{ fontSize: typeScale.body, color: colors.inkSoft }}>{teksti}</Text>
      </Page>
    </DocumentRoot>
  );
}

describe("asiakirjan renderöinti", () => {
  it("tuottaa aidon PDF:n ja sen tiivisteen", async () => {
    const result = await renderDocumentPdf(sample());

    expect(Buffer.from(result.bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(result.sizeBytes).toBe(result.bytes.length);
    expect(result.sha256).toHaveLength(64);
  });

  it("sama sisältö ja päiväys tuottavat samat tavut", async () => {
    const first = await renderDocumentPdf(sample());

    /**
     * Viive on olennainen osa tätä testiä.
     *
     * PDF:n aikaleima on sekunnin tarkkuudella. Kun asiakirjan päiväys ei
     * mennyt perille, tiivisteet olivat silti samat niin kauan kuin molemmat
     * renderöinnit osuivat samaan sekuntiin — ja testi meni läpi. Vika näkyi
     * vasta täydessä testiajossa satunnaisesti. Ilman tätä odotusta testi
     * lupaisi jotain, mitä se ei tarkista.
     */
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const second = await renderDocumentPdf(sample());

    expect(second.sha256).toBe(first.sha256);
  }, 20_000);

  it("eri sisältö tuottaa eri tiivisteen", async () => {
    const a = await renderDocumentPdf(sample("Vuokra 850 €/kk"));
    const b = await renderDocumentPdf(sample("Vuokra 900 €/kk"));

    expect(b.sha256).not.toBe(a.sha256);
  });

  it("eri päiväys tuottaa eri tiivisteen", async () => {
    // Päiväys on osa asiakirjaa. Jos se ei näkyisi tiivisteessä, kaksi eri
    // päivänä tehtyä sopimusta olisivat tiivisteeltään samat.
    const a = await renderDocumentPdf(sample());
    const b = await renderDocumentPdf(sample(undefined, "2026-10-02"));

    expect(b.sha256).not.toBe(a.sha256);
  });

  it("suomalaiset merkit säilyvät", async () => {
    const result = await renderDocumentPdf(sample("Mäkitie 12 A 4, 40100 Jyväskylä — ääkköset"));
    // Fontti on upotettu, joten tekstiä ei voi etsiä raakatavuista. Riittää
    // että renderöinti ei kaadu eikä pudota merkkejä: puuttuva glyyfi
    // aiheuttaisi react-pdf:ssä virheen.
    expect(result.sizeBytes).toBeGreaterThan(2000);
  });
});
