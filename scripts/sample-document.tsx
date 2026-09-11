/**
 * Tuottaa esimerkkiasiakirjan katselua varten.
 *
 *   npx tsx scripts/sample-document.tsx <polku.pdf>
 *
 * Tämä ei ole osa sovellusta. Se on olemassa, jotta asiakirjan ulkoasua voi
 * katsoa oikeana PDF:nä ilman että koko kaari pitää ajaa läpi.
 */
import { writeFileSync } from "node:fs";
import { RentalAgreement, type RentalAgreementData } from "../src/documents/RentalAgreement";
import { renderDocumentPdf } from "../src/documents/render";

const data: RentalAgreementData = {
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

async function main() {
  const out = process.argv[2] ?? "esimerkki-vuokrasopimus.pdf";
  const result = await renderDocumentPdf(<RentalAgreement data={data} />, {
    documentDate: new Date(data.signedDate + "T00:00:00.000Z"),
  });
  writeFileSync(out, result.bytes);
  console.log(out, result.sizeBytes, "tavua, sha256", result.sha256.slice(0, 16) + "…");
}

main();
