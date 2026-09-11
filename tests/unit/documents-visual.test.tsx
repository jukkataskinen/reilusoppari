import { describe, expect, it } from "vitest";
import { RentalAgreement, type RentalAgreementData } from "@/documents/RentalAgreement";
import { renderDocumentPdf } from "@/documents/render";
import { inkedPixels, rasterizePage } from "../rasterize";

/**
 * Näkyvyystestit.
 *
 * ===========================================================================
 * MIKSI PIKSELIT EIVÄT RIITÄ TEKSTIHAULLA
 *
 * Alatunniste oli pitkään PDF:n sisältövirrassa mutta ei näkynyt sivulla:
 * tekstihaku löysi sen, silmä ei. React-PDF ei varoita tällaisesta mitään.
 * Nämä testit piirtävät sivun oikeasti ja katsovat, onko siinä mustetta
 * siellä missä pitääkin.
 *
 * Testit ovat tarkoituksella karkeita — ne eivät vertaa kuvia keskenään
 * vaan kysyvät "onko tässä nurkassa mitään". Kuvavertailu rikkoutuisi
 * jokaisesta tekstimuutoksesta, eikä se ole se mitä halutaan vahtia.
 * ===========================================================================
 */

const DATA: RentalAgreementData = {
  property: { street: "Mäkitie 12 A 4", postalCode: "40100", city: "Jyväskylä" },
  landlordName: "Matti Virtanen",
  tenantNames: ["Maija Meikäläinen"],
  startDate: "2026-09-01",
  endDate: null,
  rentAmount: 850,
  rentDueDay: 5,
  depositAmount: 1700,
  noticePeriodMonths: 1,
  minimumTermMonths: null,
  furnished: false,
  depositDueDate: null,
  waterChargeEur: null,
  waterChargePerPerson: false,
  broadbandIncluded: false,
  insuranceRequired: true,
  rentIncreaseTerm: null,
  keysCount: 3,
  smokingAllowed: false,
  petsAllowed: true,
  waterIncluded: true,
  electricityIncluded: false,
  otherTerms: null,
  place: "Jyväskylä",
  signedDate: "2026-09-01",
};

describe("vuokrasopimus piirtyy", () => {
  it("alatunniste näkyy jokaisella sivulla", async () => {
    const { bytes } = await renderDocumentPdf(<RentalAgreement data={DATA} />);

    for (const pageNumber of [1, 2]) {
      const page = await rasterizePage(bytes, pageNumber);
      // Alin 30 pt: siellä ja vain siellä on alatunniste.
      const ink = inkedPixels(page, {
        x0: 0,
        y0: page.height - 30,
        x1: page.width,
        y1: page.height,
      });
      expect(ink, `sivu ${pageNumber}`).toBeGreaterThan(20);
    }
  }, 30_000);

  it("ylänurkan taustamuoto ja vinjetti piirtyvät", async () => {
    const { bytes } = await renderDocumentPdf(<RentalAgreement data={DATA} />);
    const page = await rasterizePage(bytes, 1);

    // Oikea ylänurkka: pehmeä muoto vuotaa sivun reunaan asti.
    const corner = inkedPixels(page, {
      x0: page.width - 40,
      y0: 0,
      x1: page.width,
      y1: 40,
    });
    expect(corner).toBeGreaterThan(200);
  }, 30_000);

  it("sivun reunoihin ei valu tekstiä", async () => {
    // Marginaali on 42 pt. Tekstin valuminen sinne on merkki rikkoutuneesta
    // taitosta; taustamuodot ovat eri asia, joten katsotaan vain vasenta
    // reunaa otsikkoalueen kohdalta.
    const { bytes } = await renderDocumentPdf(<RentalAgreement data={DATA} />);
    const page = await rasterizePage(bytes, 1);

    const margin = inkedPixels(page, { x0: 0, y0: 60, x1: 38, y1: 400 });
    expect(margin).toBe(0);
  }, 30_000);
});
