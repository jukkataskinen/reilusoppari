import { describe, expect, it } from "vitest";
import { daysInMonth, dueDateFor, generateRentPeriods } from "@/lib/tenancy/rent-periods";

/**
 * Vuokrakausien generointi.
 *
 * Tärkein väite on eräpäivä 31: vuokran ei pidä erääntyä helmikuussa
 * maaliskuun puolella. Muuten vuokralainen näyttäisi maksavan myöhässä
 * tekemättä mitään väärin — ja kuittausmerkintä päätyisi todistukseen.
 */

describe("kuukauden pituus", () => {
  it("tuntee karkausvuodet", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe("eräpäivä", () => {
  it("siirtyy kuukauden viimeiseen päivään, ei seuraavaan kuukauteen", () => {
    expect(dueDateFor(2026, 2, 31)).toBe("2026-02-28");
    expect(dueDateFor(2028, 2, 31)).toBe("2028-02-29");
    expect(dueDateFor(2026, 4, 31)).toBe("2026-04-30");
    expect(dueDateFor(2026, 1, 31)).toBe("2026-01-31");
  });

  it("säilyy sellaisenaan kun päivä on olemassa", () => {
    expect(dueDateFor(2026, 2, 5)).toBe("2026-02-05");
    expect(dueDateFor(2026, 11, 15)).toBe("2026-11-15");
  });
});

describe("kausien generointi", () => {
  it("toistaiseksi voimassa oleva saa vuoden eteenpäin", () => {
    const periods = generateRentPeriods({
      startDate: "2026-09-01",
      endDate: null,
      dueDay: 5,
      amount: 850,
    });

    expect(periods).toHaveLength(12);
    expect(periods[0]).toEqual({
      periodMonth: "2026-09-01",
      dueDate: "2026-09-05",
      amount: 850,
    });
    expect(periods[11].periodMonth).toBe("2027-08-01");
  });

  it("määräaikainen päättyy sopimuksen mukaan", () => {
    const periods = generateRentPeriods({
      startDate: "2026-09-01",
      endDate: "2027-02-28",
      dueDay: 1,
      amount: 700,
    });

    expect(periods.map((p) => p.periodMonth)).toEqual([
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
      "2027-02-01",
    ]);
  });

  it("kuun 31. eräpäivä taipuu joka kuukaudessa", () => {
    const periods = generateRentPeriods({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      dueDay: 31,
      amount: 900,
    });

    expect(periods.map((p) => p.dueDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
      "2026-07-31",
      "2026-08-31",
      "2026-09-30",
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
    ]);
  });

  it("alkaa siitä kuukaudesta jona vuokrasuhde alkaa, myös kesken kuun", () => {
    // Vajaan ensimmäisen kuukauden suhteuttaminen on avoin kysymys
    // (DECISIONS.md). Toistaiseksi ensimmäinen kuukausi on täysi.
    const periods = generateRentPeriods({
      startDate: "2026-09-15",
      endDate: "2026-10-31",
      dueDay: 5,
      amount: 850,
    });

    expect(periods.map((p) => p.periodMonth)).toEqual(["2026-09-01", "2026-10-01"]);
    expect(periods[0].amount).toBe(850);
  });

  it("vuodenvaihde ei katkaise sarjaa", () => {
    const periods = generateRentPeriods({
      startDate: "2026-11-01",
      endDate: "2027-02-01",
      dueDay: 10,
      amount: 500,
    });

    expect(periods.map((p) => p.dueDate)).toEqual([
      "2026-11-10",
      "2026-12-10",
      "2027-01-10",
      "2027-02-10",
    ]);
  });

  it("hylkää järjettömät syötteet", () => {
    const base = { startDate: "2026-09-01", endDate: null, dueDay: 5, amount: 850 };
    expect(() => generateRentPeriods({ ...base, dueDay: 0 })).toThrow(/1–31/);
    expect(() => generateRentPeriods({ ...base, dueDay: 32 })).toThrow(/1–31/);
    expect(() => generateRentPeriods({ ...base, startDate: "ei-paiva" })).toThrow(/ei kelpaa/);
    expect(() => generateRentPeriods({ ...base, endDate: "2026-08-01" })).toThrow(
      /ennen alkupäivää/,
    );
  });

  it("yhden kuukauden mittainen vuokrasuhde saa yhden kauden", () => {
    const periods = generateRentPeriods({
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      dueDay: 5,
      amount: 850,
    });
    expect(periods).toHaveLength(1);
  });
});
