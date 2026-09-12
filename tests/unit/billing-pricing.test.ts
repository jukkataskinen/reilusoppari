import { describe, expect, it } from "vitest";
import {
  formatPrice,
  PORTFOLIO_MIN_PROPERTIES,
  portfolioPriceCents,
  portfolioWorthIt,
  priceForTenancy,
  requiresPayment,
  TENANCY_PRICE_CENTS,
  vatShareCents,
} from "@/lib/billing/pricing";
import {
  needsWithdrawalConsent,
  WITHDRAWAL_DAYS,
  withdrawalState,
} from "@/lib/billing/withdrawal";

const MAKSANUT = {
  freeTenancyUsed: true,
  portfolioActive: false,
  availableCredits: 0,
};

describe("vuokrasuhteen hinta", () => {
  it("ensimmäinen on ilmainen", () => {
    const hinta = priceForTenancy({ ...MAKSANUT, freeTenancyUsed: false });
    expect(hinta.paidVia).toBe("free");
    expect(hinta.amountCents).toBe(0);
  });

  it("ilmainen ensimmäinen menee krediitin edelle", () => {
    /*
      Järjestys on ratkaiseva: jos krediitti kuluisi ensin, käyttäjä
      menettäisi suositteluetunsa siihen, mikä oli muutenkin ilmaista.
    */
    const hinta = priceForTenancy({
      freeTenancyUsed: false,
      portfolioActive: false,
      availableCredits: 3,
    });
    expect(hinta.paidVia).toBe("free");
  });

  it("salkku kattaa vuokrasuhteen ilman eri maksua", () => {
    const hinta = priceForTenancy({ ...MAKSANUT, portfolioActive: true });
    expect(hinta.paidVia).toBe("portfolio");
    expect(requiresPayment(hinta)).toBe(false);
  });

  it("salkku menee krediitin edelle, jottei krediitti kulu turhaan", () => {
    const hinta = priceForTenancy({
      freeTenancyUsed: true,
      portfolioActive: true,
      availableCredits: 2,
    });
    expect(hinta.paidVia).toBe("portfolio");
  });

  it("krediitti käytetään ennen maksua", () => {
    const hinta = priceForTenancy({ ...MAKSANUT, availableCredits: 2 });
    expect(hinta.paidVia).toBe("credit");
    expect(hinta.reason).toContain("Jäljelle jää 1");
  });

  it("viimeisestä krediitistä kerrotaan, että se oli viimeinen", () => {
    const hinta = priceForTenancy({ ...MAKSANUT, availableCredits: 1 });
    expect(hinta.reason).toContain("ei ole jäljellä");
  });

  it("muuten kertamaksu", () => {
    const hinta = priceForTenancy(MAKSANUT);
    expect(hinta.paidVia).toBe("tenancy_29");
    expect(hinta.amountCents).toBe(TENANCY_PRICE_CENTS);
    expect(requiresPayment(hinta)).toBe(true);
  });

  it("kertoo aina, ettei vuokralainen maksa", () => {
    expect(priceForTenancy(MAKSANUT).reason).toContain("Vuokralainen ei maksa");
  });
});

describe("salkkuhinta", () => {
  it("lasketaan asuntomäärästä", () => {
    expect(portfolioPriceCents(5)).toBe(7500);
    expect(portfolioPriceCents(12)).toBe(18000);
  });

  it("ei suostu alle viiden asunnon salkkuun", () => {
    expect(() => portfolioPriceCents(PORTFOLIO_MIN_PROPERTIES - 1)).toThrow();
  });

  it("ei ehdoteta, jos se olisi käyttäjälle kalliimpi", () => {
    /*
      5 asuntoa = 75 €/v. Yksi vuokrasuhde vuodessa ja yksi Plus = 29 + 12 =
      41 €. Salkku olisi kalliimpi, joten sitä ei ehdoteta — ehdotus, joka
      maksaa käyttäjälle enemmän, on huono ehdotus.
    */
    expect(
      portfolioWorthIt({ properties: 5, tenanciesPerYear: 1, plusProperties: 1 }),
    ).toBe(false);
  });

  it("ehdotetaan, kun se on oikeasti halvempi", () => {
    // 5 asuntoa = 75 €. Kolme vuokrasuhdetta ja viisi Plussaa = 87 + 60 = 147 €.
    expect(
      portfolioWorthIt({ properties: 5, tenanciesPerYear: 3, plusProperties: 5 }),
    ).toBe(true);
  });

  it("ei koskaan alle viidellä asunnolla", () => {
    expect(
      portfolioWorthIt({ properties: 4, tenanciesPerYear: 20, plusProperties: 4 }),
    ).toBe(false);
  });
});

describe("hinnan muotoilu", () => {
  it("näyttää sentit aina", () => {
    expect(formatPrice(2900)).toBe("29,00 €");
    expect(formatPrice(1200)).toBe("12,00 €");
    expect(formatPrice(2950)).toBe("29,50 €");
  });

  it("erottaa tuhannet", () => {
    expect(formatPrice(123456)).toBe("1 234,56 €");
  });
});

describe("arvonlisävero", () => {
  it("lasketaan verollisesta hinnasta", () => {
    // 29 € sisältää ALV 25,5 % → veroton 23,11 €, vero 5,89 €.
    expect(vatShareCents(2900)).toBe(589);
  });

  it("pyöristetään lähimpään senttiin eikä katkaista", () => {
    // Katkaisu alaspäin tuottaisi kuitin, jonka summat eivät täsmää.
    expect(vatShareCents(1200)).toBe(244);
  });
});

describe("peruutusoikeus", () => {
  const NYT = new Date("2026-09-12T12:00:00.000Z");

  it("on voimassa maksun jälkeen, kun allekirjoitusta ei ole lähetetty", () => {
    const tila = withdrawalState({
      paidAt: "2026-09-10T09:00:00.000Z",
      signingStartedAt: null,
      now: NYT,
    });
    expect(tila.available).toBe(true);
  });

  it("raukeaa, kun sopimus lähetetään allekirjoitettavaksi", () => {
    /*
      Tämä on se kohta, jossa palvelu on kuluttajan pyynnöstä aloitettu:
      vuokralaiselle lähtee kutsu eikä tapahtumaa voi perua.
    */
    const tila = withdrawalState({
      paidAt: "2026-09-10T09:00:00.000Z",
      signingStartedAt: "2026-09-11T09:00:00.000Z",
      now: NYT,
    });
    expect(tila.available).toBe(false);
    expect("reason" in tila && tila.reason).toContain("rauennut");
  });

  it("raukeaa myös määräajan umpeuduttua", () => {
    const tila = withdrawalState({
      paidAt: "2026-08-01T09:00:00.000Z",
      signingStartedAt: null,
      now: NYT,
    });
    expect(tila.available).toBe(false);
    expect("reason" in tila && tila.reason).toContain(String(WITHDRAWAL_DAYS));
  });

  it("ei koske maksamatonta vuokrasuhdetta", () => {
    const tila = withdrawalState({ paidAt: null, signingStartedAt: null, now: NYT });
    expect(tila.available).toBe(false);
  });

  it("suostumusta kysytään vain kun on jotain menetettävää", () => {
    // Maksettu, allekirjoitus lähettämättä → kysytään.
    expect(
      needsWithdrawalConsent({
        paidAt: "2026-09-10T09:00:00.000Z",
        signingStartedAt: null,
        now: NYT,
      }),
    ).toBe(true);

    /*
      Ilmaisessa vuokrasuhteessa ei kysytä: turha valintaruutu opettaa
      klikkaamaan läpi lukematta, ja juuri se tekee oikeista
      suostumuksista arvottomia.
    */
    expect(
      needsWithdrawalConsent({ paidAt: null, signingStartedAt: null, now: NYT }),
    ).toBe(false);
  });
});
