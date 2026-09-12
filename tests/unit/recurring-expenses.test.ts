import { describe, expect, it } from "vitest";
import {
  amountInYear,
  formatMonth,
  isMonth,
  monthFromIndex,
  monthIndex,
  monthsInYear,
  planChange,
  previousMonth,
  recurringTotals,
  seriesProblems,
  type RecurringPeriod,
} from "@/lib/expenses/recurring";

/** Hoitovastike 245 €/kk, voimassa toistaiseksi 1/2026 alkaen. */
const VASTIKE: RecurringPeriod = {
  id: "p1",
  seriesId: "s1",
  category: "hoitovastike",
  description: "Hoitovastike",
  monthlyAmount: 245,
  startsMonth: "2026-01",
  endsMonth: null,
};

describe("kuukausien laskenta", () => {
  it("järjestysluku ja takaisin", () => {
    expect(monthFromIndex(monthIndex("2026-03"))).toBe("2026-03");
    expect(monthIndex("2027-01") - monthIndex("2026-01")).toBe(12);
  });

  it("edellinen kuukausi ylittää vuodenvaihteen", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(previousMonth("2026-03")).toBe("2026-02");
  });

  it("tunnistaa kelvollisen kuukauden", () => {
    expect(isMonth("2026-01")).toBe(true);
    expect(isMonth("2026-12")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-00")).toBe(false);
    expect(isMonth("2026-1")).toBe(false);
    expect(isMonth("roskaa")).toBe(false);
  });

  it("muotoilee suomalaisittain", () => {
    expect(formatMonth("2026-03")).toBe("3/2026");
    expect(formatMonth("2026-12")).toBe("12/2026");
  });
});

describe("kauden osuus vuodesta", () => {
  it("avoin kausi kattaa koko vuoden", () => {
    expect(monthsInYear(VASTIKE, 2026)).toBe(12);
    expect(amountInYear(VASTIKE, 2026)).toBe(2940);
  });

  it("avoin kausi jatkuu seuraavaan vuoteen", () => {
    // Toistaiseksi voimassa oleva kausi on voimassa myös ensi vuonna.
    expect(monthsInYear(VASTIKE, 2027)).toBe(12);
  });

  it("kesken vuotta alkanut kausi lasketaan vain alkamisesta", () => {
    const kausi = { ...VASTIKE, startsMonth: "2026-04" };
    expect(monthsInYear(kausi, 2026)).toBe(9);
    expect(amountInYear(kausi, 2026)).toBe(2205);
  });

  it("kesken vuotta päättynyt kausi lasketaan vain päättymiseen", () => {
    const kausi = { ...VASTIKE, endsMonth: "2026-02" };
    expect(monthsInYear(kausi, 2026)).toBe(2);
    expect(amountInYear(kausi, 2026)).toBe(490);
  });

  it("edellisenä vuonna alkanut ja seuraavana päättyvä kattaa koko vuoden", () => {
    const kausi = { ...VASTIKE, startsMonth: "2025-06", endsMonth: "2027-03" };
    expect(monthsInYear(kausi, 2026)).toBe(12);
  });

  it("ei osu vuoteen lainkaan", () => {
    /*
      Nolla eikä negatiivinen luku. Negatiivinen kuukausimäärä vähentäisi
      vuosikuluja, ja virhe olisi näkymätön: laskelma näyttäisi vain
      pienemmältä.
    */
    const menneisyys = { ...VASTIKE, startsMonth: "2024-01", endsMonth: "2024-12" };
    expect(monthsInYear(menneisyys, 2026)).toBe(0);
    expect(amountInYear(menneisyys, 2026)).toBe(0);

    const tulevaisuus = { ...VASTIKE, startsMonth: "2028-01" };
    expect(monthsInYear(tulevaisuus, 2026)).toBe(0);
  });

  it("yhden kuukauden kausi on yksi kuukausi", () => {
    const kausi = { ...VASTIKE, startsMonth: "2026-07", endsMonth: "2026-07" };
    expect(monthsInYear(kausi, 2026)).toBe(1);
  });
});

describe("vuoden toistuvat kulut luokittain", () => {
  it("laskee vastikkeen korotuksen oikein kahtena kautena", () => {
    /*
      Tämä on koko toiminnon syy. Vastike nousee maaliskuussa: tammi–helmikuu
      on maksettu vanhalla summalla, maalis–joulukuu uudella. Jos summa
      muutettaisiin paikalleen, koko vuosi laskettaisiin uudella summalla ja
      vuosikulu olisi väärä juuri siltä vuodelta, jolta se ilmoitetaan.
    */
    const sarja: RecurringPeriod[] = [
      { ...VASTIKE, id: "p1", startsMonth: "2026-01", endsMonth: "2026-02", monthlyAmount: 245 },
      { ...VASTIKE, id: "p2", startsMonth: "2026-03", endsMonth: null, monthlyAmount: 268 },
    ];

    const totals = recurringTotals(sarja, 2026);
    const vastike = totals.get("hoitovastike");

    expect(vastike?.months).toBe(12);
    // 2 × 245 + 10 × 268 = 490 + 2680 = 3170
    expect(vastike?.total).toBe(3170);
  });

  it("laskee kaksi rinnakkaista kulua samaan luokkaan", () => {
    // Asunnon vastike ja autopaikan vastike ovat molemmat hoitovastiketta.
    const sarja: RecurringPeriod[] = [
      { ...VASTIKE, id: "p1", seriesId: "s1", monthlyAmount: 245 },
      { ...VASTIKE, id: "p2", seriesId: "s2", monthlyAmount: 25, description: "Autopaikka" },
    ];

    const vastike = recurringTotals(sarja, 2026).get("hoitovastike");
    expect(vastike?.months).toBe(24);
    expect(vastike?.total).toBe(3240);
  });

  it("pitää luokat erillään", () => {
    const sarja: RecurringPeriod[] = [
      { ...VASTIKE, id: "p1", category: "hoitovastike", monthlyAmount: 245 },
      { ...VASTIKE, id: "p2", category: "rahoitusvastike_rahastoitu", monthlyAmount: 300 },
    ];

    const totals = recurringTotals(sarja, 2026);
    expect(totals.get("hoitovastike")?.total).toBe(2940);
    expect(totals.get("rahoitusvastike_rahastoitu")?.total).toBe(3600);
  });

  it("jättää pois luokan, jota vuonna ei ole", () => {
    const sarja = [{ ...VASTIKE, startsMonth: "2028-01" }];
    expect(recurringTotals(sarja, 2026).size).toBe(0);
  });

  it("pysyy sentin tarkkuudessa", () => {
    const sarja = [{ ...VASTIKE, monthlyAmount: 244.99 }];
    expect(recurringTotals(sarja, 2026).get("hoitovastike")?.total).toBe(2939.88);
  });
});

describe("summan muutos", () => {
  const NYT = "2026-02";
  const sarja = [VASTIKE];

  it("päättää vanhan kauden edelliseen kuukauteen", () => {
    const tulos = planChange(sarja, "2026-03", NYT);
    expect(tulos).toEqual({ ok: true, closeAt: "2026-02", startAt: "2026-03" });
  });

  it("sallii etukäteen kirjaamisen", () => {
    // Taloyhtiö ilmoittaa korotuksesta etukäteen; kirje kannattaa kirjata heti.
    expect(planChange(sarja, "2026-08", NYT).ok).toBe(true);
  });

  it("estää takautuvan muutoksen nykyisen kauden sisälle", () => {
    /*
      Takautuva muutos muuttaisi jo lasketut vuodet. Jos laskelma on ehditty
      sinetöidä, sinetöity ja näytöllä näkyvä eroaisivat ilman että kumpikaan
      on väärin.
    */
    const tulos = planChange(sarja, "2026-01", NYT);
    expect(tulos.ok).toBe(false);
    if (!tulos.ok) expect(tulos.message).toContain("aikaisintaan");
  });

  it("estää muutoksen kaukaiseen tulevaisuuteen", () => {
    // Todennäköisemmin kirjoitusvirhe vuosiluvussa kuin aito ennakkotieto.
    const tulos = planChange(sarja, "2030-01", NYT);
    expect(tulos.ok).toBe(false);
    if (!tulos.ok) expect(tulos.message).toContain("vuoden päässä");
  });

  it("estää muutoksen jo päättyneen kauden päälle", () => {
    const paattynyt = [{ ...VASTIKE, endsMonth: "2026-06" }];
    expect(planChange(paattynyt, "2026-05", NYT).ok).toBe(false);
  });

  it("hylkää kelvottoman kuukauden", () => {
    expect(planChange(sarja, "2026-13", NYT).ok).toBe(false);
    expect(planChange(sarja, "roskaa", NYT).ok).toBe(false);
  });

  it("hylkää tyhjän sarjan", () => {
    expect(planChange([], "2026-03", NYT).ok).toBe(false);
  });
});

describe("sarjan eheys", () => {
  it("hyväksyy peräkkäiset kaudet", () => {
    const sarja: RecurringPeriod[] = [
      { ...VASTIKE, id: "p1", startsMonth: "2026-01", endsMonth: "2026-02" },
      { ...VASTIKE, id: "p2", startsMonth: "2026-03", endsMonth: null },
    ];
    expect(seriesProblems(sarja)).toEqual([]);
  });

  it("huomaa päällekkäiset kaudet", () => {
    /*
      Päällekkäinen kausi laskisi saman kuukauden kahdesti. Se ei näy
      laskelmassa virheenä — vain liian suurina vuosikuluina.
    */
    const sarja: RecurringPeriod[] = [
      { ...VASTIKE, id: "p1", startsMonth: "2026-01", endsMonth: "2026-06" },
      { ...VASTIKE, id: "p2", startsMonth: "2026-04", endsMonth: null },
    ];
    expect(seriesProblems(sarja)[0]).toContain("päällekkäin");
  });

  it("huomaa aukon kausien välissä", () => {
    const sarja: RecurringPeriod[] = [
      { ...VASTIKE, id: "p1", startsMonth: "2026-01", endsMonth: "2026-02" },
      { ...VASTIKE, id: "p2", startsMonth: "2026-05", endsMonth: null },
    ];
    expect(seriesProblems(sarja)[0]).toContain("väliin jää");
  });

  it("huomaa avoimen kauden, jonka jälkeen on uusi", () => {
    const sarja: RecurringPeriod[] = [
      { ...VASTIKE, id: "p1", startsMonth: "2026-01", endsMonth: null },
      { ...VASTIKE, id: "p2", startsMonth: "2026-05", endsMonth: null },
    ];
    expect(seriesProblems(sarja)[0]).toContain("avoin");
  });

  it("huomaa kauden, joka päättyy ennen kuin alkaa", () => {
    const sarja = [{ ...VASTIKE, startsMonth: "2026-06", endsMonth: "2026-03" }];
    expect(seriesProblems(sarja)[0]).toContain("ennen kuin alkaa");
  });

  it("hyväksyy yksittäisen avoimen kauden", () => {
    expect(seriesProblems([VASTIKE])).toEqual([]);
  });
});
