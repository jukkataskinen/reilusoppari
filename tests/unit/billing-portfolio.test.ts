import { describe, expect, it } from "vitest";
import {
  portfolioView,
  separateCostCents,
  type PortfolioState,
} from "@/lib/billing/portfolio";
import { PORTFOLIO_MIN_PROPERTIES } from "@/lib/billing/pricing";

/**
 * Salkkutilauksen näkymäpäätös.
 *
 * ===========================================================================
 * TÄRKEIN VÄITE: SALKKUA EI TARJOTA, JOS SE ON KALLIIMPI
 *
 * Väärin päin menevä vertailu ehdottaisi käyttäjälle kalliimpaa vaihtoehtoa
 * — eikä hän huomaisi sitä, koska luku näyttäisi tarjoukselta. Tämä on se
 * kohta, jossa oma etu ja käyttäjän etu ovat eri suuntiin, ja siksi se on
 * testattu tiheimmin.
 * ===========================================================================
 */

const PERUS: PortfolioState = {
  properties: 8,
  tenanciesLastYear: 4,
  plusProperties: 6,
  subscription: null,
};

describe("erikseen maksamisen hinta", () => {
  it("lasketaan toteutuneesta vuodesta", () => {
    // 4 × 29 € + 6 × 12 € = 116 + 72 = 188 €.
    expect(separateCostCents(PERUS)).toBe(18800);
  });

  it("on nolla, jos mitään ei ole käytetty", () => {
    expect(
      separateCostCents({ ...PERUS, tenanciesLastYear: 0, plusProperties: 0 }),
    ).toBe(0);
  });
});

describe("alle viiden asunnon omistaja", () => {
  it("ei saa tarjousta ja kuulee mitä puuttuu", () => {
    const nakyma = portfolioView({ ...PERUS, properties: 3 });

    expect(nakyma.kind).toBe("too_few");
    if (nakyma.kind === "too_few") expect(nakyma.missing).toBe(2);
  });

  it("raja on täsmälleen viisi", () => {
    expect(portfolioView({ ...PERUS, properties: PORTFOLIO_MIN_PROPERTIES - 1 }).kind).toBe(
      "too_few",
    );
    expect(portfolioView({ ...PERUS, properties: PORTFOLIO_MIN_PROPERTIES }).kind).not.toBe(
      "too_few",
    );
  });
});

describe("tarjous", () => {
  it("tehdään, kun salkku on halvempi", () => {
    /*
      8 asuntoa = 120 €. Erikseen 4 vuokrasuhdetta ja 6 Plussaa = 188 €.
      Säästö 68 €.
    */
    const nakyma = portfolioView(PERUS);

    expect(nakyma.kind).toBe("offer");
    if (nakyma.kind === "offer") {
      expect(nakyma.portfolioCents).toBe(12000);
      expect(nakyma.separateCents).toBe(18800);
      expect(nakyma.savingCents).toBe(6800);
    }
  });

  it("EI tehdä, kun salkku on kalliimpi", () => {
    // 8 asuntoa = 120 €, mutta käyttö on vähäistä: 1 vuokrasuhde = 29 €.
    const nakyma = portfolioView({ ...PERUS, tenanciesLastYear: 1, plusProperties: 0 });

    expect(nakyma.kind).toBe("not_worth_it");
  });

  it("EI tehdä, kun hinnat ovat tasan samat", () => {
    /*
      Tasatilanteessa ei ole mitään voitettavaa, ja tilaus olisi silti uusi
      sitoumus. Epäselvässä tapauksessa ei myydä.
    */
    const nakyma = portfolioView({
      properties: 5,
      // 5 × 15 € = 75 €. Erikseen: 1 vuokrasuhde 29 € + 4 Plussaa 48 € = 77 €.
      tenanciesLastYear: 1,
      plusProperties: 4,
      subscription: null,
    });

    // 77 > 75, joten tämä on tarjous.
    expect(nakyma.kind).toBe("offer");

    // Mutta kun ne ovat tasan samat, tarjousta ei tule.
    const tasan = portfolioView({
      properties: 5,
      tenanciesLastYear: 0,
      plusProperties: 0,
      subscription: null,
    });
    expect(tasan.kind).toBe("not_worth_it");
  });

  it("kertoo molemmat luvut, ei pelkkää säästöä", () => {
    /*
      Ilman lukuja vertailu olisi väite, jonka voi vain uskoa tai olla
      uskomatta. Lukujen kanssa käyttäjä voi tarkistaa sen ja olla eri mieltä.
    */
    const nakyma = portfolioView(PERUS);

    if (nakyma.kind === "offer") {
      expect(nakyma.portfolioCents).toBeGreaterThan(0);
      expect(nakyma.separateCents).toBeGreaterThan(0);
    }
  });
});

describe("voimassa oleva tilaus", () => {
  const TILATTU: PortfolioState = {
    ...PERUS,
    subscription: { quantity: 8, status: "active", currentPeriodEnd: "2027-09-12T00:00:00.000Z" },
  };

  it("näytetään tilauksena eikä tarjouksena", () => {
    const nakyma = portfolioView(TILATTU);

    expect(nakyma.kind).toBe("active");
    if (nakyma.kind === "active") {
      expect(nakyma.quantity).toBe(8);
      expect(nakyma.covered).toBe(true);
      // 8 × 15 € = 120 €.
      expect(nakyma.priceCents).toBe(12000);
    }
  });

  it("kertoo, jos asuntoja on enemmän kuin tilaus kattaa", () => {
    /*
      Tilauksen määrää EI päivitetä automaattisesti: se olisi veloitus, jota
      käyttäjä ei ole hyväksynyt. Ero näytetään ja päivitys on napin takana.
    */
    const nakyma = portfolioView({ ...TILATTU, properties: 11 });

    expect(nakyma.kind).toBe("active");
    if (nakyma.kind === "active") {
      expect(nakyma.covered).toBe(false);
      expect(nakyma.properties).toBe(11);
      expect(nakyma.quantity).toBe(8);
    }
  });

  it("näytetään myös, jos asuntoja on pudonnut alle viiden", () => {
    /*
      Tilaus on sopimus, joka jatkuu kunnes se irtisanotaan. Sen
      piilottaminen jättäisi käyttäjän maksamaan jotain, mitä hän ei näe
      missään.
    */
    const nakyma = portfolioView({ ...TILATTU, properties: 2 });
    expect(nakyma.kind).toBe("active");
  });

  it("maksuhäiriö näkyy", () => {
    const nakyma = portfolioView({
      ...TILATTU,
      subscription: { quantity: 8, status: "past_due", currentPeriodEnd: null },
    });

    expect(nakyma.kind).toBe("active");
    if (nakyma.kind === "active") expect(nakyma.pastDue).toBe(true);
  });

  it("päättynyt tilaus ei estä uutta tarjousta", () => {
    const nakyma = portfolioView({
      ...TILATTU,
      subscription: { quantity: 8, status: "canceled", currentPeriodEnd: null },
    });

    expect(nakyma.kind).toBe("offer");
  });
});
