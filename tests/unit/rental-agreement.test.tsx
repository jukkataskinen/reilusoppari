import { describe, expect, it } from "vitest";
import { RentalAgreement, partiesByRole, signerName, buildTerms, type RentalAgreementData } from "@/documents/RentalAgreement";
import { layoutTermRows } from "@/documents/components";
import { renderDocumentPdf } from "@/documents/render";
import { formatEuro, formatDate, formatNames } from "@/documents/format";

const DATA: RentalAgreementData = {
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
    const first = await renderDocumentPdf(<RentalAgreement data={DATA} />);

    // Yli sekunnin viive: PDF:n aikaleima on sekunnin tarkkuudella, ja ilman
    // odotusta testi ei huomaisi kellonajan vuotamista asiakirjaan.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const second = await renderDocumentPdf(<RentalAgreement data={DATA} />);

    expect(Buffer.from(first.bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(second.sha256).toBe(first.sha256);
  }, 20_000);

  it("eri vuokra tuottaa eri asiakirjan", async () => {
    const a = await renderDocumentPdf(<RentalAgreement data={DATA} />);
    const b = await renderDocumentPdf(<RentalAgreement data={{ ...DATA, rentAmount: 900 }} />);

    expect(b.sha256).not.toBe(a.sha256);
  });

  it("kaksi vuokralaista mahtuu allekirjoitusriville", async () => {
    const result = await renderDocumentPdf(
      <RentalAgreement
        data={{
          ...DATA,
          parties: [
            ...DATA.parties,
            {
              role: "tenant",
              name: "Matti Meikäläinen",
              partyType: "henkilo",
              identifier: "020304A6069",
              signatoryName: null,
              phone: null,
              email: null,
            },
          ],
        }}
      />,
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

describe("sitoutumisaika", () => {
  it("kertoo aikaisimman irtisanomispäivän eikä vain kuukausimäärää", () => {
    // Kuukausimäärä vaatii lukijalta laskutoimituksen. Päivämäärä ei.
    const kesto = buildTerms({ ...DATA, minimumTermMonths: 12 }).find(
      (t) => t.title === "Sopimuksen kesto",
    );

    expect(kesto?.body).toContain("12 kuukautta");
    expect(kesto?.body).toContain("1.9.2027");
    // Ero määräaikaiseen sanotaan ääneen: sopimus ei pääty siihen.
    expect(kesto?.body).toContain("jatkuu toistaiseksi");
  });

  it("yksi kuukausi taipuu oikein", () => {
    const kesto = buildTerms({ ...DATA, minimumTermMonths: 1 }).find(
      (t) => t.title === "Sopimuksen kesto",
    );
    expect(kesto?.body).toContain("1 kuukausi ");
  });

  it("ei mainita, jos sitä ei ole", () => {
    const kesto = buildTerms(DATA).find((t) => t.title === "Sopimuksen kesto");
    expect(kesto?.body).toBe("Sopimus on voimassa toistaiseksi.");
  });

  it("määräaikainen ohittaa sitoutumisajan", () => {
    // Määräaikainen päättyy joka tapauksessa sovittuna päivänä, joten
    // sitoutumisajan toistaminen olisi harhaanjohtavaa.
    const kesto = buildTerms({
      ...DATA,
      endDate: "2027-08-31",
      minimumTermMonths: 12,
    }).find((t) => t.title === "Sopimuksen kesto");

    expect(kesto?.body).toContain("määräaikainen");
    expect(kesto?.body).not.toContain("irtisanomispäivä");
  });
});

describe("vesi, sähkö ja laajakaista", () => {
  const teksti = (d: Partial<RentalAgreementData>) =>
    buildTerms({ ...DATA, ...d }).find((t) => t.title === "Vesi, sähkö ja laajakaista")?.body ?? "";

  it("vesi sisältyy", () => {
    expect(teksti({ waterIncluded: true })).toContain("Vesi sisältyy vuokraan");
  });

  it("erillinen vesimaksu henkilöä kohden", () => {
    expect(teksti({ waterIncluded: false, waterChargeEur: 25, waterChargePerPerson: true })).toContain(
      "25 € kuukaudessa henkilöä kohden",
    );
  });

  it("erillinen vesimaksu asuntoa kohden", () => {
    expect(teksti({ waterIncluded: false, waterChargeEur: 25 })).toContain("asuntoa kohden");
  });

  it("ilman summaa vesi menee käytön mukaan", () => {
    expect(teksti({ waterIncluded: false, waterChargeEur: null })).toContain("käytön mukaan");
  });

  it("sähkösopimus on vuokralaisen, jos sähkö ei sisälly", () => {
    expect(teksti({ electricityIncluded: false })).toContain("oman sähkösopimuksensa");
    expect(teksti({ electricityIncluded: true })).toContain("Sähkö sisältyy");
  });
});

describe("mallisopimuksesta otetut ehdot", () => {
  it("kattaa muuttopäivän, muutostyöt, loppusiivouksen ja jälleenvuokrauksen", () => {
    const otsikot = buildTerms(DATA).map((t) => t.title);
    for (const otsikko of [
      "Vuokrattava koti",
      "Muuttopäivä",
      "Muutostyöt",
      "Loppusiivous",
      "Asunnon luovuttaminen eteenpäin",
      "Sovellettava laki",
    ]) {
      expect(otsikot, otsikko).toContain(otsikko);
    }
  });

  it("kotivakuutus on ehtona vain jos sitä vaaditaan", () => {
    expect(buildTerms(DATA).some((t) => t.title === "Kotivakuutus")).toBe(true);
    expect(
      buildTerms({ ...DATA, insuranceRequired: false }).some((t) => t.title === "Kotivakuutus"),
    ).toBe(false);
  });

  it("kuvaa asunnon huoneluvulla ja pinta-alalla kun ne tiedetään", () => {
    const koti = buildTerms({
      ...DATA,
      property: { ...DATA.property, rooms: 2, areaM2: 54.5 },
    }).find((t) => t.title === "Vuokrattava koti");

    expect(koti?.body).toContain("2h+k, noin 54,5 m²");
    expect(koti?.body).toContain("kalustamattomana");
  });

  it("ei väitä huoneluvusta mitään jos sitä ei tiedetä", () => {
    const koti = buildTerms(DATA).find((t) => t.title === "Vuokrattava koti");
    expect(koti?.body).toContain("asuinhuoneisto");
  });

  it("ei käytä mallisopimuksen virkakieltä", () => {
    // Sisältö on mallista, sanamuodot eivät (DECISIONS.md 2026-09-11).
    const kaikki = buildTerms(DATA)
      .map((t) => t.body)
      .join(" ")
      .toLowerCase();

    for (const virkakieli of [
      "edellä mainittu",
      "täten",
      "kyseinen",
      "asianomainen",
      "realisoida",
      "ilman tuomiota",
      "luvanvaraisina töinä pidetään",
    ]) {
      expect(kaikki, virkakieli).not.toContain(virkakieli);
    }
  });
});

describe("osapuolet asiakirjassa", () => {
  const yritys = {
    role: "landlord" as const,
    name: "Kiinteistö Oy Mäkitie",
    partyType: "yritys" as const,
    identifier: "2617416-4",
    signatoryName: "Matti Virtanen",
    phone: null,
    email: null,
  };

  it("yrityksen puolesta allekirjoittaa ihminen", () => {
    // Pelkkä yrityksen nimi allekirjoitusrivillä ei kerro, kuka sopimuksen
    // teki. Nimenkirjoittaja on se, joka rivillä lukee.
    expect(signerName(yritys)).toBe("Matti Virtanen (Kiinteistö Oy Mäkitie)");
  });

  it("henkilö allekirjoittaa omalla nimellään", () => {
    expect(signerName(DATA.parties[0])).toBe("Matti Virtanen");
  });

  it("yritys ilman allekirjoittajaa ei keksi nimeä", () => {
    // Puuttuva tieto ei saa muuttua paikanvaraajaksi asiakirjassa.
    expect(signerName({ ...yritys, signatoryName: null })).toBe("Kiinteistö Oy Mäkitie");
  });

  it("erottaa osapuolet roolin mukaan", () => {
    expect(partiesByRole(DATA, "tenant").map((p) => p.name)).toEqual(["Maija Meikäläinen"]);
    expect(partiesByRole(DATA, "landlord")).toHaveLength(1);
  });

  it("yritysosapuoli renderöityy", async () => {
    const result = await renderDocumentPdf(
      <RentalAgreement data={{ ...DATA, parties: [yritys, DATA.parties[1]] }} />,
    );
    expect(result.sizeBytes).toBeGreaterThan(2000);
  });
});
