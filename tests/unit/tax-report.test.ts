import { describe, expect, it } from "vitest";
import {
  buildTaxReport,
  incomeFrom,
  isEmpty,
  type ReportConfirmation,
  type ReportExpense,
} from "@/lib/tax/report";

const kulut: ReportExpense[] = [
  { date: "2026-03-10", amount: 129.9, category: "vuosikorjaus", km: null },
  { date: "2026-05-02", amount: 340, category: "vuosikorjaus", km: null },
  { date: "2026-01-15", amount: 1800, category: "hoitovastike", km: null },
  { date: "2026-04-01", amount: 14.64, category: "matkat", km: 24 },
  { date: "2026-06-01", amount: 2400, category: "perusparannus", km: null },
  { date: "2026-02-01", amount: 900, category: "rahoitusvastike_rahastoitu", km: null },
  // Eri vuosi: ei kuulu tähän laskelmaan.
  { date: "2025-12-20", amount: 500, category: "vuosikorjaus", km: null },
];

const kuittaukset: ReportConfirmation[] = [
  { dueDate: "2026-01-05", amount: 850, status: "paid", amountPaid: null },
  { dueDate: "2026-02-05", amount: 850, status: "partial", amountPaid: 400 },
  { dueDate: "2026-03-05", amount: 850, status: "not_yet", amountPaid: null },
  { dueDate: "2026-04-05", amount: 850, status: null, amountPaid: null },
];

describe("vuokratulo kuittauksista", () => {
  it("kyllä on koko vuokra, osittain se mitä kirjattiin", () => {
    expect(incomeFrom(kuittaukset[0])).toBe(850);
    expect(incomeFrom(kuittaukset[1])).toBe(400);
  });

  it("ei vielä on nolla", () => {
    expect(incomeFrom(kuittaukset[2])).toBe(0);
  });

  it("kuittaamaton kuukausi on nolla, ei oletus koko vuokrasta", () => {
    /*
      Laskelma ei saa kertoa tulosta, jota kukaan ei ole merkinnyt
      saaneensa. Oletus koko vuokrasta tekisi veroilmoituksesta väärän
      vuokranantajan vahingoksi.
    */
    expect(incomeFrom(kuittaukset[3])).toBe(0);
  });
});

describe("vuoden laskelma", () => {
  const raportti = buildTaxReport(2026, kulut, kuittaukset);

  it("laskee vuokratulon kuittauksista", () => {
    expect(raportti.rentalIncome).toBe(1250);
    expect(raportti.incomeMonths).toBe(2);
  });

  it("rajaa toisen vuoden kulut pois", () => {
    const korjaus = raportti.lines.find((line) => line.category === "vuosikorjaus");
    expect(korjaus?.count).toBe(2);
    expect(korjaus?.total).toBe(469.9);
  });

  it("erottaa sen, mikä ei ole vuosikulu", () => {
    /*
      Rahastoitu rahoitusvastike lisätään hankintamenoon ja perusparannus
      vähennetään poistoina. Jos ne summautuisivat vuosikuluihin, laskelma
      olisi väärä juuri siinä kohdassa, jossa virhe maksaa eniten.
    */
    expect(raportti.annualExpenses).toBe(469.9 + 1800 + 14.64);
    expect(raportti.otherEntries).toBe(3300);
  });

  it("nettotulo on vuokratulo miinus vuosikulut", () => {
    // Muut kirjaukset eivät ole mukana: ne eivät ole vuosikuluja.
    expect(raportti.net).toBe(1250 - (469.9 + 1800 + 14.64));
  });

  it("kokoaa kilometrit matkakuluriville", () => {
    const matkat = raportti.lines.find((line) => line.category === "matkat");
    expect(matkat?.km).toBe(24);
  });

  it("järjestys on sama kuin kululuokissa", () => {
    // Sama järjestys kuin verottajan lomakkeella, jotta rivit voi siirtää
    // ilman etsimistä.
    expect(raportti.lines.map((line) => line.category)).toEqual([
      "vuosikorjaus",
      "hoitovastike",
      "rahoitusvastike_rahastoitu",
      "perusparannus",
      "matkat",
    ]);
  });

  it("tyhjiä luokkia ei näytetä", () => {
    expect(raportti.lines.some((line) => line.count === 0)).toBe(false);
  });

  it("pyöristää sentteihin", () => {
    // Liukuluvut eivät saa tuottaa 1234.5600000000002:ta.
    const pyoristys = buildTaxReport(
      2026,
      [
        { date: "2026-01-01", amount: 0.1, category: "muu", km: null },
        { date: "2026-01-02", amount: 0.2, category: "muu", km: null },
      ],
      [],
    );
    expect(pyoristys.annualExpenses).toBe(0.3);
  });

  it("tunnistaa tyhjän laskelman", () => {
    expect(isEmpty(buildTaxReport(2027, kulut, kuittaukset))).toBe(true);
    expect(isEmpty(raportti)).toBe(false);
  });

  it("nettotulo voi olla negatiivinen", () => {
    const tappio = buildTaxReport(
      2026,
      [{ date: "2026-01-01", amount: 5000, category: "vuosikorjaus", km: null }],
      [{ dueDate: "2026-01-05", amount: 850, status: "paid", amountPaid: null }],
    );
    expect(tappio.net).toBe(-4150);
  });
});
