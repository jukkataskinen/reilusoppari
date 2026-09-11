import { describe, expect, it } from "vitest";
import {
  InspectionProtocol,
  countPhotos,
  groupByRoom,
  type InspectionItem,
  type InspectionProtocolData,
} from "@/documents/InspectionProtocol";
import { RentalAgreement, type RentalAgreementData } from "@/documents/RentalAgreement";
import { renderDocumentPdf } from "@/documents/render";
import { inkedPixels, rasterizePage, saturatedPixels } from "../rasterize";

/**
 * Katselmuspöytäkirjan testit.
 *
 * Tärkein on viimeinen: pöytäkirjassa EI ole koristekuvitusta. Se ei ole
 * makuasia vaan päätös (DECISIONS.md 2026-09-11) — pöytäkirjassa kuva on
 * todiste, ja koristekuva samassa asiakirjassa hämärtäisi rajan. Ilman
 * testiä se katoaisi ensimmäisessä ulkoasumuutoksessa eikä kukaan huomaisi.
 */

/** 1×1 pikselin läpinäkyvä PNG. Riittää, kun testataan rakennetta eikä kuvaa. */
const PIKSELI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function photo(hash: string, name: string, role: "landlord" | "tenant") {
  return {
    dataUri: PIKSELI,
    takenAt: "2026-08-30T13:02:00.000Z",
    takenByName: name,
    takenByRole: role,
    sha256: hash.padEnd(64, "0"),
    note: null,
  };
}

const ITEMS: InspectionItem[] = [
  { room: "Keittiö", item: "Liesi", addedBy: null, photos: [photo("a", "Matti", "landlord")] },
  { room: "Keittiö", item: "Jääkaappi", addedBy: null, photos: [] },
  {
    room: "Kylpyhuone",
    item: "Saumat",
    addedBy: { name: "Maija", role: "tenant" },
    photos: [photo("b", "Maija", "tenant"), photo("c", "Matti", "landlord")],
  },
];

const DATA: InspectionProtocolData = {
  kind: "initial",
  property: { street: "Mäkitie 12 A 4", postalCode: "40100", city: "Jyväskylä" },
  landlordName: "Matti Virtanen",
  tenantNames: ["Maija Meikäläinen"],
  lockedAt: "2026-08-30T14:20:00.000Z",
  lockedByName: "Matti Virtanen",
  place: "Jyväskylä",
  items: ITEMS,
};

describe("kohtien ryhmittely", () => {
  it("säilyttää järjestyksen ja kokoaa peräkkäiset saman huoneen kohdat", () => {
    const rooms = groupByRoom(ITEMS);
    expect(rooms.map((r) => r.room)).toEqual(["Keittiö", "Kylpyhuone"]);
    expect(rooms[0].items).toHaveLength(2);
    expect(rooms[1].items).toHaveLength(1);
  });

  it("ei yhdistä saman huoneen kohtia yli toisen huoneen", () => {
    // Järjestys on se, jossa asunto kävellään läpi. Jos kohdat
    // uudelleenjärjestettäisiin huoneen mukaan, loppukatselmuksen
    // vertaaminen alkukatselmukseen menisi sekaisin.
    const sekoitettu: InspectionItem[] = [
      { room: "Keittiö", item: "A", addedBy: null, photos: [] },
      { room: "Sauna", item: "B", addedBy: null, photos: [] },
      { room: "Keittiö", item: "C", addedBy: null, photos: [] },
    ];
    expect(groupByRoom(sekoitettu).map((r) => r.room)).toEqual(["Keittiö", "Sauna", "Keittiö"]);
  });

  it("laskee kuvat", () => {
    expect(countPhotos(ITEMS)).toBe(3);
    expect(countPhotos([])).toBe(0);
  });
});

describe("pöytäkirjan renderöinti", () => {
  it("on deterministinen", async () => {
    const first = await renderDocumentPdf(<InspectionProtocol data={DATA} />);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const second = await renderDocumentPdf(<InspectionProtocol data={DATA} />);

    expect(second.sha256).toBe(first.sha256);
  }, 30_000);

  it("loppukatselmus on eri asiakirja kuin alkukatselmus", async () => {
    const alku = await renderDocumentPdf(<InspectionProtocol data={DATA} />);
    const loppu = await renderDocumentPdf(
      <InspectionProtocol data={{ ...DATA, kind: "final" }} />,
    );

    expect(loppu.sha256).not.toBe(alku.sha256);
  }, 30_000);

  it("kuvaton kohta sanotaan ääneen eikä jätetä tyhjäksi", async () => {
    // Tyhjä kohta pöytäkirjassa on epäselvä: eikö sitä katsottu, vai
    // eikö kuva tallentunut? Asiakirjan on kerrottava kumpi.
    const { bytes } = await renderDocumentPdf(<InspectionProtocol data={DATA} />);
    expect(bytes.length).toBeGreaterThan(2000);
  }, 30_000);
});

describe("pöytäkirjassa ei ole koristekuvitusta", () => {
  const VUOKRASOPIMUS: RentalAgreementData = {
    property: { street: "Mäkitie 12 A 4", postalCode: "40100", city: "Jyväskylä" },
  parties: [
    {
      role: "landlord" as const,
      name: "Matti Virtanen",
      partyType: "henkilo" as const,
      identifier: "131052-308T",
      signatoryName: null,
      phone: "040 123 4567",
      email: "matti.virtanen@example.com",
    },
    {
      role: "tenant" as const,
      name: "Maija Meikäläinen",
      partyType: "henkilo" as const,
      identifier: "010594Y123W",
      signatoryName: null,
      phone: "050 765 4321",
      email: "maija.meikalainen@example.com",
    },
  ],
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

  /** Vinjetin alue: otsikon oikea puoli. */
  const VINJETTI = { x0: 400, y0: 60, x1: 560, y1: 220 };

  it("sopimuksessa vinjetti on", async () => {
    const { bytes } = await renderDocumentPdf(<RentalAgreement data={VUOKRASOPIMUS} />);
    const page = await rasterizePage(bytes, 1);
    // Vinjetin sohva on kylläistä sinistä; taustamuodot ovat haaleita.
    expect(saturatedPixels(page, VINJETTI)).toBeGreaterThan(100);
  }, 30_000);

  it("pöytäkirjassa vinjettiä ei ole", async () => {
    const { bytes } = await renderDocumentPdf(<InspectionProtocol data={DATA} />);
    const page = await rasterizePage(bytes, 1);

    // Pehmeä taustamuoto saa olla: se on koko asiakirjaperheen yhteinen.
    expect(inkedPixels(page, VINJETTI)).toBeGreaterThan(0);
    // Kuvitusta ei: pöytäkirjassa kuva on todiste.
    expect(saturatedPixels(page, VINJETTI)).toBe(0);
  }, 30_000);
});
