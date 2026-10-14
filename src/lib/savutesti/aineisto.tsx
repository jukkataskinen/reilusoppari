/**
 * Savutestin asiakirjat keksityllä aineistolla (Jukan päätös 14.10.2026).
 *
 * Jokainen asiakirjapohja täydellä täytöllä: kaikki valinnaiset kentät,
 * katselmuksessa kuvat (myös vuokralaisen lisäämä tila) ja todistuksessa
 * suositus ja QR-koodi. Juuri valinnainen sisältö (eSinetissä logo) on se,
 * joka rikkoutuu ensimmäisenä, kun riippuvuus päivittyy.
 *
 * Ei henkilötunnuksia: osapuolet ovat yritys (y-tunnus) ja henkilö ilman
 * tunnusta. Kuvat ovat yksivärisiä PNG-ruutuja, jotka tehdään tässä, jottei
 * tuotantopaketti tarvitse kuvakirjastoa.
 */
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import type { DocumentElement } from "@/documents/render";
import { InspectionProtocol, type InspectionProtocolData } from "@/documents/InspectionProtocol";
import { RentalAgreement, type RentalAgreementData } from "@/documents/RentalAgreement";
import { TaxReport, type TaxReportData } from "@/documents/TaxReport";
import { TenancyCertificate, type CertificateData } from "@/documents/TenancyCertificate";

function crc32(bytes: Buffer): number {
  let c = ~0;
  for (const byte of bytes) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** Yksivärinen PNG (RGB). Deterministinen, joten tiiviste on aina sama. */
export function savutestiKuva(rgb: number): { dataUri: string; sha256: string } {
  const width = 160;
  const height = 120;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = (rgb >> 16) & 0xff;
      raw[o + 1] = (rgb >> 8) & 0xff;
      raw[o + 2] = rgb & 0xff;
    }
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return {
    dataUri: `data:image/png;base64,${png.toString("base64")}`,
    sha256: createHash("sha256").update(png).digest("hex"),
  };
}

const ASUNTO = { street: "Keksitie 1 A 2", postalCode: "40100", city: "Jyväskylä" };

const VUOKRASOPIMUS: RentalAgreementData = {
  property: { ...ASUNTO, rooms: 2, areaM2: 54.5 },
  parties: [
    {
      role: "landlord",
      name: "Savutesti Vuokraus Oy",
      partyType: "yritys",
      identifier: "1234567-8",
      signatoryName: "Keksi Esimerkki",
      phone: "040 000 0000",
      email: "vuokranantaja@example.invalid",
      bankAccount: "FI21 1234 5600 0007 85",
    },
    {
      role: "tenant",
      name: "Testi Vuokralainen",
      partyType: "henkilo",
      identifier: null,
      signatoryName: null,
      phone: "050 000 0000",
      email: "vuokralainen@example.invalid",
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
  otherTerms: "Keksitty lisäehto savutestiä varten.",
  place: "Jyväskylä",
  signedDate: "2026-09-01",
};

function katselmus(): InspectionProtocolData {
  const a = savutestiKuva(0xdbe8fb);
  const b = savutestiKuva(0xe9f1fc);
  return {
    kind: "initial",
    property: ASUNTO,
    landlordName: "Savutesti Vuokraus Oy",
    tenantNames: ["Testi Vuokralainen"],
    lockedAt: "2026-08-30T14:20:00.000Z",
    lockedByName: "Keksi Esimerkki",
    deposit: null,
    place: "Jyväskylä",
    rooms: [
      {
        name: "Keittiö",
        photos: [
          { ...a, takenAt: "2026-08-30T13:02:00.000Z", takenByName: "Keksi Esimerkki", takenByRole: "landlord", note: "Liesi ehjä." },
        ],
      },
      {
        // Vuokralaisen lisäämä tila.
        name: "Parveke",
        photos: [
          { ...b, takenAt: "2026-08-30T13:44:00.000Z", takenByName: "Testi Vuokralainen", takenByRole: "tenant", note: null },
        ],
      },
    ],
  };
}

const TODISTUS: CertificateData = {
  for: "tenant",
  subjectName: "Testi Vuokralainen",
  issuerName: "Savutesti Vuokraus Oy, vuokranantaja",
  property: ASUNTO,
  startDate: "2023-09-01",
  endDate: "2026-08-31",
  rating: "recommend",
  comment: "Keksitty tervehdys savutestiä varten.",
  reply: "Keksitty vastine.",
  stats: {
    months: 36,
    rentPeriods: 36,
    rentOnTime: 34,
    rentSlightlyLate: 2,
    rentDelayed: 0,
    defectsResolved: 1,
    defectsReported: 1,
    depositReturnedFull: true,
    initialInspectionDone: true,
  },
  verifyUrl: "https://reilusoppari.fi/todistus/savutesti",
  sealedDate: "2026-09-08",
};

const VEROLASKELMA: TaxReportData = {
  year: 2026,
  property: ASUNTO,
  ownerName: "Savutesti Vuokraus Oy",
  rentalIncome: 9600,
  incomeMonths: 12,
  annualLines: [
    { label: "Hoitovastike", count: 0, recurringMonths: 12, total: 1800 },
    { label: "Matkat", count: 4, recurringMonths: 0, total: 120, km: 240 },
  ],
  annualExpenses: 1920,
  otherLines: [
    { label: "Rahastoitu rahoitusvastike", count: 0, recurringMonths: 12, total: 3600, note: "Keksitty huomautus." },
  ],
  otherEntries: 3600,
  net: 7680,
  receiptCount: 3,
  disclaimer: "Tämä on yhteenveto omista kirjauksistasi, ei veroneuvontaa.",
  closingNote: "Keksitty loppuhuomautus.",
  date: "2027-03-01",
};

export interface SavutestiAsiakirja {
  nimi: string;
  elementti: () => DocumentElement;
}

/** Jokainen asiakirjapohja kerran. Uusi pohja lisätään tähän (docs/kriittiset-polut.md). */
export function savutestiAsiakirjat(): SavutestiAsiakirja[] {
  return [
    { nimi: "vuokrasopimus", elementti: () => <RentalAgreement data={VUOKRASOPIMUS} /> },
    { nimi: "katselmuspoytakirja", elementti: () => <InspectionProtocol data={katselmus()} /> },
    { nimi: "vuokratodistus", elementti: () => <TenancyCertificate data={TODISTUS} /> },
    { nimi: "verolaskelma", elementti: () => <TaxReport data={VEROLASKELMA} /> },
  ];
}
