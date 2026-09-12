import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { InspectionProtocol, type InspectionProtocolData } from "@/documents/InspectionProtocol";
import { RentalAgreement, type RentalAgreementData } from "@/documents/RentalAgreement";
import { TenancyCertificate, type CertificateData } from "@/documents/TenancyCertificate";
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
  property: {
    street: "Mäkitie 12 A 4",
    postalCode: "40100",
    city: "Jyväskylä",
    rooms: 2,
    areaM2: 54.5,
  },
  parties: [
    {
      role: "landlord" as const,
      name: "Matti Virtanen",
      partyType: "henkilo" as const,
      identifier: "131052-308T",
      signatoryName: null,
      phone: "040 123 4567",
      email: "matti.virtanen@example.com",
      bankAccount: "FI21 1234 5600 0007 85",
    },
    {
      role: "tenant" as const,
      name: "Maija Meikäläinen",
      partyType: "henkilo" as const,
      identifier: "010594Y123W",
      signatoryName: null,
      phone: "050 765 4321",
      email: "maija.meikalainen@example.com",
      bankAccount: null,
    },
  ],
  startDate: "2026-09-01",
  endDate: null,
  rentAmount: 850,
  rentDueDay: 5,
  depositAmount: 1700,
  noticePeriodMonths: 1,
  minimumTermMonths: 12,
  furnished: false,
  depositDueDate: "2026-08-25",
  waterChargeEur: 25,
  waterChargePerPerson: true,
  broadbandIncluded: false,
  insuranceRequired: true,
  rentIncreaseTerm: "elinkustannusindeksin mukaan kerran vuodessa",
  keysCount: 3,
  smokingAllowed: false,
  petsAllowed: true,
  waterIncluded: false,
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
  rooms: [
    {
      name: "Keittiö",
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
          note: "Välitilan laatoitus ehjä.",
        },
      ],
    },
    {
      name: "Kylpyhuone",
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
      name: "Olohuone",
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
      // Vuokralaisen itse lisäämä tila. Se näkyy pöytäkirjassa samalla
      // tavalla kuin oletuslistan huoneet.
      name: "Parveke",
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

const TODISTUS: CertificateData = {
  for: "tenant",
  subjectName: "Maija Meikäläinen",
  issuerName: "Matti Virtanen, vuokranantaja",
  property: { street: "Mäkitie 12 A 4", postalCode: "40100", city: "Jyväskylä" },
  startDate: "2023-09-01",
  endDate: "2026-08-31",
  rating: "recommend",
  comment:
    "Maija on ollut luotettava ja mukava vuokralainen. Asioista on sovittu aina hyvässä hengessä, ja asunto jäi siihen kuntoon kuin se oli alussakin.",
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

it("vuokratodistus", async () => {
  mkdirSync(OUT, { recursive: true });
  const result = await renderDocumentPdf(<TenancyCertificate data={TODISTUS} />);
  writeFileSync(path.join(OUT, "vuokratodistus.pdf"), result.bytes);
}, 30_000);

/**
 * Sama todistus ilman suositusta ja ilman tervehdystä.
 *
 * Tämä on olemassa siksi, että näitä kahta voi katsoa vierekkäin: puuttuvan
 * suosituksen EI pidä näkyä mitenkään (DECISIONS.md).
 */
it("vuokratodistus ilman suositusta", async () => {
  mkdirSync(OUT, { recursive: true });
  const result = await renderDocumentPdf(
    <TenancyCertificate data={{ ...TODISTUS, rating: null, comment: null }} />,
  );
  writeFileSync(path.join(OUT, "vuokratodistus-ilman-suositusta.pdf"), result.bytes);
}, 30_000);
