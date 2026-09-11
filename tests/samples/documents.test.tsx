import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { RentalAgreement, type RentalAgreementData } from "@/documents/RentalAgreement";
import { renderDocumentPdf } from "@/documents/render";

/**
 * Esimerkkiasiakirjat katselua varten.
 *
 *   npm run samples          → kirjoittaa PDF:t `esimerkit/`-hakemistoon
 *   node scripts/pdf-to-png.mjs esimerkit/vuokrasopimus.pdf sivu
 *
 * Tämä on vitest-testi eikä erillinen skripti, koska React-PDF vaatii
 * ESM-ympäristön, jota `tsx` ei tälle riippuvuusketjulle tarjoa. Ajetaan
 * käsin, ei osana `npm test` -ajoa (`vitest.config.mts`:n `include`).
 */

const OUT = path.resolve(process.cwd(), "esimerkit");

const VUOKRASOPIMUS: RentalAgreementData = {
  property: { street: "Mäkitie 12 A 4", postalCode: "40100", city: "Jyväskylä" },
  landlordName: "Matti Virtanen",
  tenantNames: ["Maija Meikäläinen"],
  startDate: "2026-09-01",
  endDate: null,
  rentAmount: 850,
  rentDueDay: 5,
  depositAmount: 1700,
  noticePeriodMonths: 1,
  rentIncreaseTerm: "elinkustannusindeksin mukaan kerran vuodessa",
  keysCount: 3,
  smokingAllowed: false,
  petsAllowed: true,
  waterIncluded: true,
  electricityIncluded: false,
  otherTerms: "Autopaikka numero 4 kuuluu vuokraan.",
  place: "Jyväskylä",
  signedDate: "2026-09-01",
};

it("vuokrasopimus", async () => {
  mkdirSync(OUT, { recursive: true });
  const result = await renderDocumentPdf(<RentalAgreement data={VUOKRASOPIMUS} />);
  writeFileSync(path.join(OUT, "vuokrasopimus.pdf"), result.bytes);
}, 30_000);
