import { describe, expect, it } from "vitest";
import {
  canEditConfirmation,
  editClosesAt,
  EDIT_WINDOW_DAYS,
  formatPeriodMonth,
  isOverdue,
  STATUS_LABEL,
  validateConfirmation,
} from "@/lib/rent/confirmation";

describe("kuittauksen muuttaminen", () => {
  const alku = "2026-09-05T09:00:00.000Z";

  it("onnistuu 30 päivän ajan", () => {
    expect(canEditConfirmation(alku, new Date("2026-09-20T09:00:00.000Z"))).toBe(true);
  });

  it("sulkeutuu 30 päivän jälkeen", () => {
    /*
      Vuokratodistus rakentuu näiden merkintöjen varaan. Jos vuosien takaisia
      kuittauksia voisi muuttaa, todistus kertoisi siitä mitä vuokranantaja
      nyt ajattelee, ei siitä mitä silloin tapahtui.
    */
    expect(canEditConfirmation(alku, new Date("2026-10-20T09:00:00.000Z"))).toBe(false);
  });

  it("raja on tasan 30 vuorokautta", () => {
    const raja = new Date(new Date(alku).getTime() + EDIT_WINDOW_DAYS * 86_400_000);
    expect(canEditConfirmation(alku, new Date(raja.getTime() - 1000))).toBe(true);
    expect(canEditConfirmation(alku, raja)).toBe(false);
  });

  it("kertoo milloin muuttaminen sulkeutuu", () => {
    expect(editClosesAt(alku).toISOString()).toBe("2026-10-05T09:00:00.000Z");
  });
});

describe("osittainen maksu", () => {
  it("vaatii summan", () => {
    // Ilman summaa "osittain" ei kerro mitään: 10 € ja 840 € 850 eurosta
    // eivät tarkoita samaa asiaa.
    const tulos = validateConfirmation("partial", null, 850);
    expect(tulos.ok).toBe(false);
    if (!tulos.ok) expect(tulos.message).toContain("paljonko");
  });

  it("hylkää nollan ja negatiivisen ohjaten oikeaan merkintään", () => {
    for (const summa of [0, -5]) {
      const tulos = validateConfirmation("partial", summa, 850);
      expect(tulos.ok).toBe(false);
      if (!tulos.ok) expect(tulos.message).toContain("Ei vielä");
    }
  });

  it("hylkää täyden summan ohjaten oikeaan merkintään", () => {
    const tulos = validateConfirmation("partial", 850, 850);
    expect(tulos.ok).toBe(false);
    if (!tulos.ok) expect(tulos.message).toContain("Kyllä");
  });

  it("hyväksyy välissä olevan summan", () => {
    expect(validateConfirmation("partial", 400, 850)).toEqual({ ok: true, amountPaid: 400 });
  });

  it("pudottaa summan muilta merkinnöiltä", () => {
    // "Kyllä" tarkoittaa koko vuokraa, eikä siihen kuulu erillistä summaa,
    // joka voisi olla ristiriidassa sen kanssa.
    expect(validateConfirmation("paid", 400, 850)).toEqual({ ok: true, amountPaid: null });
    expect(validateConfirmation("not_yet", 400, 850)).toEqual({ ok: true, amountPaid: null });
  });
});

describe("esitystapa", () => {
  it("sanamuodot kuvaavat hetkeä eivätkä ihmistä", () => {
    // "Ei vielä" eikä "maksamatta": kuittaus voi olla väärässä, ja
    // sanamuodon on kestettävä se.
    expect(STATUS_LABEL.not_yet).toBe("Ei vielä");
    expect(STATUS_LABEL.paid).toBe("Kyllä");
  });

  it("kuukausi luettavana tekstinä", () => {
    expect(formatPeriodMonth("2026-09-01")).toBe("syyskuu 2026");
    expect(formatPeriodMonth("2027-01-01")).toBe("tammikuu 2027");
  });

  it("eräpäivä itse ei ole myöhässä", () => {
    // Maksu voi tulla perille päivän kuluessa.
    expect(isOverdue("2026-09-05", new Date("2026-09-05T23:00:00.000Z"))).toBe(false);
    expect(isOverdue("2026-09-05", new Date("2026-09-06T00:30:00.000Z"))).toBe(true);
  });
});
