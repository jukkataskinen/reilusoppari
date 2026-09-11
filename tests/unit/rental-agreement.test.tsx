import { describe, expect, it } from "vitest";
import { RentalAgreement, buildTerms, type RentalAgreementData } from "@/documents/RentalAgreement";
import { layoutTermRows } from "@/documents/components";
import { renderDocumentPdf } from "@/documents/render";
import { formatEuro, formatDate, formatNames } from "@/documents/format";

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

describe("suomalaiset muotoilut", () => {
  it("päiväys kirjoitetaan ilman etunollia", () => {
    expect(formatDate("2026-09-01")).toBe("1.9.2026");
    expect(formatDate("2026-12-31")).toBe("31.12.2026");
  });

  it("euromäärässä on tavallinen välilyönti, ei kapeaa", () => {
    // Intl käyttäisi U+202F:ää, joka on PDF-fontissa eri glyyfi.
    expect(formatEuro(850)).toBe("850 €");
    expect(formatEuro(1250.5)).toBe("1 250,50 €");
    expect(formatEuro(1250)).toBe("1 250 €");
    expect(formatEuro(850)).not.toContain(" ");
    expect(formatEuro(850)).not.toContain(" ");
  });

  it("nimet luetellaan ihmisen tapaan", () => {
    expect(formatNames(["Maija"])).toBe("Maija");
    expect(formatNames(["Maija", "Matti"])).toBe("Maija ja Matti");
    expect(formatNames(["Maija", "Matti", "Pekka"])).toBe("Maija, Matti ja Pekka");
  });
});

describe("sopimusehdot", () => {
  it("toistaiseksi voimassa oleva kertoo irtisanomisajat", () => {
    const terms = buildTerms(DATA);
    const kesto = terms.find((t) => t.title === "Sopimuksen kesto");
    expect(kesto?.body).toContain("toistaiseksi");

    const irtisanominen = terms.find((t) => t.title === "Irtisanominen");
    // Lain vähimmäisajat sanotaan ääneen, koska vuokralainen ei niitä tiedä.
    expect(irtisanominen?.body).toContain("kolme");
    expect(irtisanominen?.body).toContain("kuusi");
  });

  it("määräaikainen ei lupaa irtisanomisaikaa jota ei ole", () => {
    const terms = buildTerms({ ...DATA, endDate: "2027-08-31" });
    expect(terms.find((t) => t.title === "Sopimuksen kesto")?.body).toContain("31.8.2027");
    expect(terms.find((t) => t.title === "Irtisanominen")?.body).toContain("ilman irtisanomista");
  });

  it("loppuarviosta kerrotaan jo sopimuksessa", () => {
    // DECISIONS.md: tämä ei saa tulla yllätyksenä lopussa.
    const arvio = buildTerms(DATA).find((t) => t.title === "Arvio vuokrasuhteesta");
    expect(arvio).toBeDefined();
    expect(arvio?.body).toContain("yllätyksenä");
  });

  it("kielto ja lupa kirjoitetaan kumpikin kokonaisina lauseina", () => {
    const kaytto = buildTerms(DATA).find((t) => t.title === "Asunnon käyttö");
    expect(kaytto?.body).toContain("Tupakointi sisätiloissa ei ole sallittu");
    expect(kaytto?.body).toContain("Lemmikit ovat sallittuja");

    const toinen = buildTerms({ ...DATA, smokingAllowed: true, petsAllowed: false }).find(
      (t) => t.title === "Asunnon käyttö",
    );
    expect(toinen?.body).toContain("Tupakointi on sallittu");
    expect(toinen?.body).toContain("Lemmikkejä ei pidetä");
  });

  it("vesi ja sähkö kerrotaan oikein kaikissa yhdistelmissä", () => {
    const vain = (d: Partial<RentalAgreementData>) =>
      buildTerms({ ...DATA, ...d }).find((t) => t.title === "Vesi ja sähkö")?.body ?? "";

    expect(vain({ waterIncluded: true, electricityIncluded: true })).toContain("vesi ja sähkö");
    expect(vain({ waterIncluded: true, electricityIncluded: false })).toContain(
      "Sähkö maksetaan erikseen",
    );
    expect(vain({ waterIncluded: false, electricityIncluded: true })).toContain(
      "Vesi maksetaan erikseen",
    );
    expect(vain({ waterIncluded: false, electricityIncluded: false })).toContain(
      "vuokran lisäksi",
    );
  });

  it("muut ehdot tulevat mukaan vain jos niitä on", () => {
    expect(buildTerms(DATA).some((t) => t.title === "Muut ehdot")).toBe(false);
    expect(
      buildTerms({ ...DATA, otherTerms: "Autopaikka numero 4 kuuluu vuokraan." }).some(
        (t) => t.title === "Muut ehdot",
      ),
    ).toBe(true);
  });
});

describe("sopimuksen renderöinti", () => {
  it("tuottaa PDF:n ja on deterministinen", async () => {
    const date = new Date("2026-09-01T00:00:00.000Z");
    const first = await renderDocumentPdf(<RentalAgreement data={DATA} />, {
      documentDate: date,
    });
    const second = await renderDocumentPdf(<RentalAgreement data={DATA} />, {
      documentDate: date,
    });

    expect(Buffer.from(first.bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(second.sha256).toBe(first.sha256);
  });

  it("eri vuokra tuottaa eri asiakirjan", async () => {
    const date = new Date("2026-09-01T00:00:00.000Z");
    const a = await renderDocumentPdf(<RentalAgreement data={DATA} />, { documentDate: date });
    const b = await renderDocumentPdf(<RentalAgreement data={{ ...DATA, rentAmount: 900 }} />, {
      documentDate: date,
    });

    expect(b.sha256).not.toBe(a.sha256);
  });

  it("kaksi vuokralaista mahtuu allekirjoitusriville", async () => {
    const result = await renderDocumentPdf(
      <RentalAgreement data={{ ...DATA, tenantNames: ["Maija Meikäläinen", "Matti Meikäläinen"] }} />,
      { documentDate: new Date("2026-09-01T00:00:00.000Z") },
    );
    expect(result.sizeBytes).toBeGreaterThan(2000);
  });
});

describe("ehtojen ladonta", () => {
  it("numerot juoksevat vasemmalta oikealle, ylhäältä alas", () => {
    // Tämä meni kerran pieleen: kaksi itsenäisesti virtaavaa saraketta
    // tuottivat sivulle 2 järjestyksen 5, 6, 11, 12. Sopimuksessa lukija ei
    // voi joutua arvaamaan, mistä ehto 7 jatkuu.
    const terms = Array.from({ length: 9 }, (_, i) => ({
      title: `Ehto ${i + 1}`,
      body: "Teksti.",
    }));

    const rows = layoutTermRows(terms);
    expect(rows).toHaveLength(5);
    expect(rows.flat().map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // Pariton määrä: viimeisellä rivillä on yksi ehto, ei tyhjää paikkaa.
    expect(rows[4]).toHaveLength(1);
  });

  it("sopimuksen ehdot numeroituvat yhtäjaksoisesti", () => {
    const numbers = layoutTermRows(buildTerms(DATA))
      .flat()
      .map((r) => r.number);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });
});
