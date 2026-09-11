import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { InspectionProtocol, type InspectionProtocolData } from "@/documents/InspectionProtocol";
import { RentalAgreement, type RentalAgreementData } from "@/documents/RentalAgreement";
import { renderDocumentPdf } from "@/documents/render";
import { fakePhoto } from "./fake-photo";

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

const KUVA_A = fakePhoto("Keittiö, liesi", "#dbe8fb");
const KUVA_B = fakePhoto("Keittiö, välitila", "#e7f0fa");
const KUVA_C = fakePhoto("Kylpyhuone, saumat", "#dfeaf9");
const KUVA_D = fakePhoto("Olohuone, lattia", "#e9f1fc");
const KUVA_E = fakePhoto("Parveke, kaide", "#e3edfb");

const KATSELMUS: InspectionProtocolData = {
  kind: "initial",
  property: { street: "Mäkitie 12 A 4", postalCode: "40100", city: "Jyväskylä" },
  landlordName: "Matti Virtanen",
  tenantNames: ["Maija Meikäläinen"],
  lockedAt: "2026-08-30T14:20:00.000Z",
  lockedByName: "Matti Virtanen",
  place: "Jyväskylä",
  items: [
    {
      room: "Keittiö",
      item: "Liesi ja uuni",
      addedBy: null,
      photos: [
        {
          dataUri: KUVA_A.dataUri,
          sha256: KUVA_A.sha256,
          takenAt: "2026-08-30T13:02:00.000Z",
          takenByName: "Matti Virtanen",
          takenByRole: "landlord",
          note: "Uuni puhdas, luukussa pieni naarmu.",
        },
        {
          dataUri: KUVA_B.dataUri,
          sha256: KUVA_B.sha256,
          takenAt: "2026-08-30T13:05:00.000Z",
          takenByName: "Maija Meikäläinen",
          takenByRole: "tenant",
          note: null,
        },
      ],
    },
    { room: "Keittiö", item: "Jääkaappi ja pakastin", addedBy: null, photos: [] },
    {
      room: "Kylpyhuone",
      item: "Silikonisaumat",
      addedBy: null,
      photos: [
        {
          dataUri: KUVA_C.dataUri,
          sha256: KUVA_C.sha256,
          takenAt: "2026-08-30T13:18:00.000Z",
          takenByName: "Maija Meikäläinen",
          takenByRole: "tenant",
          note: "Sauma tummunut suihkun takana.",
        },
      ],
    },
    {
      room: "Olohuone",
      item: "Lattia",
      addedBy: null,
      photos: [
        {
          dataUri: KUVA_D.dataUri,
          sha256: KUVA_D.sha256,
          takenAt: "2026-08-30T13:31:00.000Z",
          takenByName: "Matti Virtanen",
          takenByRole: "landlord",
          note: null,
        },
      ],
    },
    {
      room: "Parveke",
      item: "Kaiteen kiinnitys",
      addedBy: { name: "Maija Meikäläinen", role: "tenant" },
      photos: [
        {
          dataUri: KUVA_E.dataUri,
          sha256: KUVA_E.sha256,
          takenAt: "2026-08-30T13:44:00.000Z",
          takenByName: "Maija Meikäläinen",
          takenByRole: "tenant",
          note: "Kaide liikkuu hieman oikeasta päästä.",
        },
      ],
    },
  ],
};

it("alkukatselmus", async () => {
  mkdirSync(OUT, { recursive: true });
  const result = await renderDocumentPdf(<InspectionProtocol data={KATSELMUS} />);
  writeFileSync(path.join(OUT, "alkukatselmus.pdf"), result.bytes);
}, 30_000);
