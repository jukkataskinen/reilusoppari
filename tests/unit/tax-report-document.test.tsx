import { describe, expect, it } from "vitest";
import { TaxReport, type TaxReportData } from "@/documents/TaxReport";
import { renderDocumentPdf } from "@/documents/render";
import { documentText } from "../rasterize";

/**
 * Verolaskelma-asiakirjan testit.
 *
 * Tärkein on ensimmäinen ryhmä: vuosikulut ja muut kirjaukset eivät saa
 * summautua yhteen missään. Se on helppo rikkoa vahingossa — riittää, että
 * joku lisää "yhteensä"-rivin osioiden alle.
 */

const DATA: TaxReportData = {
  year: 2026,
  property: { street: "Mäkitie 12 A 4", postalCode: "40100", city: "Jyväskylä" },
  ownerName: "Matti Virtanen",
  rentalIncome: 9600,
  incomeMonths: 12,
  annualLines: [
    { label: "Hoitovastike", count: 12, total: 1800 },
    { label: "Vuosikorjaus", count: 2, total: 640, note: "Korjaus palauttaa entisen tason." },
    { label: "Matkat", count: 4, total: 120, km: 240 },
  ],
  annualExpenses: 2560,
  otherLines: [
    {
      label: "Rahastoitu rahoitusvastike",
      count: 12,
      total: 3600,
      note: "Lisätään osakkeen hankintamenoon.",
    },
  ],
  otherEntries: 3600,
  net: 7040,
  receiptCount: 14,
  disclaimer: "Tämä on yhteenveto omista kirjauksistasi, ei veroneuvontaa.",
  closingNote: "Vastuu ilmoituksesta on sinulla.",
  date: "2027-03-01",
};

async function textOf(data: TaxReportData): Promise<string> {
  const rendered = await renderDocumentPdf(<TaxReport data={data} />);
  return documentText(rendered.bytes);
}

describe("kahta summaa ei lasketa yhteen", () => {
  it("asiakirjassa ei esiinny vuosikulujen ja muiden kirjausten summaa", async () => {
    const text = await textOf(DATA);

    /*
      2 560 + 3 600 = 6 160. Jos tämä luku löytyy asiakirjasta, joku on
      laskenut yhteen kaksi asiaa, jotka verotuksessa ovat eri asioita:
      rahastoitu rahoitusvastike ei ole vuosikulu.
    */
    expect(text).not.toContain("6 160");
    expect(text).not.toContain("6160");
  });

  it("kumpikin summa on omanaan", async () => {
    const text = await textOf(DATA);
    expect(text).toContain("2 560");
    expect(text).toContain("3 600");
  });

  it("tulos lasketaan vuosikuluista eikä muista kirjauksista", async () => {
    const text = await textOf(DATA);
    // 9 600 − 2 560 = 7 040. Ei 9 600 − 6 160 = 3 440.
    expect(text).toContain("7 040");
    expect(text).not.toContain("3 440");
  });

  it("muiden kirjausten osio jää kokonaan pois, kun niitä ei ole", async () => {
    const text = await textOf({ ...DATA, otherLines: [], otherEntries: 0 });
    expect(text).not.toContain("Muut kirjaukset");
  });
});

describe("varaus toistuu", () => {
  it("on sekä alussa että lopussa", async () => {
    const text = await textOf(DATA);
    /*
      Kahdesti: kerran johdannossa ja kerran loppuhuomautuksessa. Jos se on
      vain toisessa, asiakirja voi tulla luetuksi veroneuvontana.
    */
    const osumat = text.split("ei veroneuvontaa").length - 1;
    expect(osumat).toBeGreaterThanOrEqual(2);
  });
});

describe("luvut asiakirjassa", () => {
  it("kertoo kuittien määrän muttei upota niitä", async () => {
    const rendered = await renderDocumentPdf(<TaxReport data={DATA} />);
    const text = await documentText(rendered.bytes);

    expect(text).toContain("14 kuittia");
    /*
      Kuitit eivät ole asiakirjan sisällä (`lib/tax/seal.ts`). Vuoden kuitit
      upotettuina olisivat kymmeniä megatavuja; yksisivuinen laskelma on alle
      puoli megatavua.
    */
    expect(rendered.bytes.byteLength).toBeLessThan(512 * 1024);
  });

  it("näyttää matkojen kilometrit summan vieressä", async () => {
    const text = await textOf(DATA);
    expect(text).toContain("240 km");
  });

  it("kestää tyhjän vuoden kaatumatta", async () => {
    const text = await textOf({
      ...DATA,
      rentalIncome: 0,
      incomeMonths: 0,
      annualLines: [],
      annualExpenses: 0,
      otherLines: [],
      otherEntries: 0,
      net: 0,
      receiptCount: 0,
    });

    expect(text).toContain("Verolaskelma");
  });
});

describe("toistettavuus", () => {
  it("sama data tuottaa saman tiivisteen", async () => {
    const [first, second] = await Promise.all([
      renderDocumentPdf(<TaxReport data={DATA} />),
      renderDocumentPdf(<TaxReport data={DATA} />),
    ]);

    /*
      Päiväys tulee datasta eikä koneen kellosta (`components.tsx`). Jos tämä
      hajoaa, sinetöity laskelma saa eri tiivisteen joka renderöinnillä eikä
      sitä voi enää tarkistaa.
    */
    expect(first.sha256).toBe(second.sha256);
  });
});
