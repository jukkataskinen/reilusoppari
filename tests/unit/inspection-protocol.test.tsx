import { describe, expect, it } from "vitest";
import {
  InspectionProtocol,
  countPhotos,
  photographedRooms,
  type InspectionProtocolData,
  type InspectionRoomGroup,
} from "@/documents/InspectionProtocol";
import { RentalAgreement, type RentalAgreementData } from "@/documents/RentalAgreement";
import { renderDocumentPdf } from "@/documents/render";
import { documentText, inkedPixels, rasterizePage, saturatedPixels } from "../rasterize";

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

const ROOMS: InspectionRoomGroup[] = [
  { name: "Keittiö", photos: [photo("a", "Matti", "landlord")] },
  // Kuvaton tila: se ei tule pöytäkirjaan lainkaan.
  { name: "Makuuhuone", photos: [] },
  {
    name: "Kylpyhuone",
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
  // Alkukatselmuksessa vakuusosiota ei ole.
  deposit: null,
  place: "Jyväskylä",
  rooms: ROOMS,
};

describe("tilojen valinta pöytäkirjaan", () => {
  it("kuvaton tila jätetään pois kokonaan", () => {
    /*
      Pöytäkirja kertoo, mitä kuvattiin — ei sitä, mitä jäi kuvaamatta.
      Lista, jossa on kymmenen "ei kuvia" -riviä, näyttää huolimattomalta
      katselmukselta, vaikka osapuolet olisivat kuvanneet juuri sen, minkä
      itse katsoivat merkitseväksi (Jukan linjaus 2026-09-11).
    */
    expect(photographedRooms(ROOMS).map((room) => room.name)).toEqual([
      "Keittiö",
      "Kylpyhuone",
    ]);
  });

  it("säilyttää järjestyksen", () => {
    // Järjestys on se, jossa asunto kävellään läpi. Sama järjestys toistuu
    // loppukatselmuksessa, jotta tilat voi verrata ilman etsimistä.
    const jarjestys = photographedRooms([
      { name: "Eteinen", photos: [photo("d", "Matti", "landlord")] },
      { name: "Keittiö", photos: [photo("e", "Matti", "landlord")] },
    ]);
    expect(jarjestys.map((room) => room.name)).toEqual(["Eteinen", "Keittiö"]);
  });

  it("laskee kuvat", () => {
    expect(countPhotos(ROOMS)).toBe(3);
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

  it("kuvan selite tulee asiakirjaan", async () => {
    const ilman = await renderDocumentPdf(<InspectionProtocol data={DATA} />);
    const selitteella = await renderDocumentPdf(
      <InspectionProtocol
        data={{
          ...DATA,
          rooms: [
            {
              name: "Keittiö",
              photos: [{ ...photo("a", "Matti", "landlord"), note: "Naarmu uunin luukussa" }],
            },
          ],
        }}
      />,
    );

    expect(selitteella.sha256).not.toBe(ilman.sha256);
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

describe("vakuuden palautusosio", () => {
  const VIKA = {
    title: "Keittiön hana vuotaa",
    reportedAt: "2026-05-10",
    reportedByRole: "tenant" as const,
  };

  it("ei ole alkukatselmuksessa", async () => {
    /*
      Alkukatselmuksessa vakuudesta ei ole mitään sanottavaa: se palautetaan
      vuokrasuhteen päättyessä.
    */
    const teksti = await documentText(
      (await renderDocumentPdf(<InspectionProtocol data={DATA} />)).bytes,
    );

    expect(teksti).not.toContain("Vakuuden palautus");
  });

  it("kertoo täydestä palautuksesta, kun avoimia vikoja ei ole", async () => {
    const teksti = await documentText(
      (
        await renderDocumentPdf(
          <InspectionProtocol
            data={{
              ...DATA,
              kind: "final",
              deposit: { amount: 1700, grounds: [], hasOpenItems: false },
            }}
          />,
        )
      ).bytes,
    );

    expect(teksti).toContain("Vakuuden palautus");
    expect(teksti).toContain("1 700");
    expect(teksti).toContain("kokonaisuudessaan");
  });

  it("luettelee avoimet viat muttei ehdota vähennystä", async () => {
    /*
      Palvelu ei voi tietää, kuuluuko avoin vika vuokralaisen vastuulle vai
      tavanomaiseen kulumiseen. Automaattinen vähennysehdotus olisi
      puolueenotto, jota ei ole mihinkään perustettu.
    */
    const teksti = await documentText(
      (
        await renderDocumentPdf(
          <InspectionProtocol
            data={{
              ...DATA,
              kind: "final",
              deposit: { amount: 1700, grounds: [VIKA], hasOpenItems: true },
            }}
          />,
        )
      ).bytes,
    );

    expect(teksti).toContain("Keittiön hana vuotaa");
    expect(teksti).toContain("Lähtökohta on täysi palautus");
    expect(teksti).toContain("eivät sellaisenaan peruste");
  });

  it("kertoo kumpi osapuoli vian kirjasi", async () => {
    // Yksipuolinen luettelo tekisi pöytäkirjasta toisen osapuolen listan.
    const teksti = await documentText(
      (
        await renderDocumentPdf(
          <InspectionProtocol
            data={{
              ...DATA,
              kind: "final",
              deposit: {
                amount: 1700,
                grounds: [VIKA, { ...VIKA, title: "Parvekkeen ovi", reportedByRole: "landlord" }],
                hasOpenItems: true,
              },
            }}
          />,
        )
      ).bytes,
    );

    expect(teksti).toContain("vuokralainen");
    expect(teksti).toContain("vuokranantaja");
  });

  it("kertoo, jos vakuutta ei ole sovittu", async () => {
    const teksti = await documentText(
      (
        await renderDocumentPdf(
          <InspectionProtocol
            data={{
              ...DATA,
              kind: "final",
              deposit: { amount: null, grounds: [], hasOpenItems: false },
            }}
          />,
        )
      ).bytes,
    );

    expect(teksti).toContain("ei ole sovittu vakuutta");
  });
});
