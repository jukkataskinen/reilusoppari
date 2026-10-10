import { describe, expect, it } from "vitest";
import {
  paymentReturnView,
  PROCESSING_TITLE,
  readPaymentReturn,
} from "@/lib/billing/return-state";

/*
  Paluu Stripen maksusivulta (Jukka 10.10.2026): Plus maksettiin, mutta
  sivu ei kertonut mitään, eikä käyttäjä tiennyt, mitä tehdä.
*/
describe("paluuparametri", () => {
  it("tunnistaa vain tunnetut arvot", () => {
    expect(readPaymentReturn("valmis")).toBe("valmis");
    expect(readPaymentReturn("peruttu")).toBe("peruttu");
    expect(readPaymentReturn(["valmis", "x"])).toBe("valmis");
    expect(readPaymentReturn("jotain")).toBeNull();
    expect(readPaymentReturn(undefined)).toBeNull();
  });
});

describe("maksun jälkeinen näkymä", () => {
  it("ilman paluuta ei näytetä mitään", () => {
    expect(paymentReturnView({ product: "plus", param: null, active: false })).toEqual({ kind: "none" });
  });

  it("Plus voimassa: kehotetaan sinetöimään", () => {
    const view = paymentReturnView({ product: "plus", param: "valmis", active: true, completed: false });
    expect(view).toEqual({
      kind: "paid",
      title: "Maksu vastaanotettu. Plus on käytössä tälle asunnolle.",
      body: "Viimeistele sinetöinti painamalla Sinetöi laskelma.",
    });
  });

  it("Plus voimassa ja laskelma sinetöity: kerrotaan valmiista", () => {
    const view = paymentReturnView({ product: "plus", param: "valmis", active: true, completed: true });
    expect(view.kind).toBe("done");
  });

  it("webhook ei ole vielä ehtinyt: käsittelyssä, ei uutta maksua", () => {
    const view = paymentReturnView({ product: "plus", param: "valmis", active: false });
    expect(view.kind).toBe("processing");
    if (view.kind === "processing") {
      expect(view.title).toBe(PROCESSING_TITLE);
      expect(view.body).toContain("Sivu päivittyy hetken kuluttua.");
    }
  });

  it("peruttu maksu sanotaan suoraan", () => {
    const view = paymentReturnView({ product: "plus", param: "peruttu", active: false });
    expect(view).toMatchObject({ kind: "cancelled", title: "Maksu peruttiin. Laskelmaa ei sinetöity." });
  });

  it("peruutusviestiä ei näytetä, jos maksu on kuitenkin voimassa", () => {
    expect(paymentReturnView({ product: "plus", param: "peruttu", active: true })).toEqual({ kind: "none" });
  });

  it("vuokrasuhteen maksu: seuraavaksi allekirjoitukseen", () => {
    const view = paymentReturnView({ product: "tenancy", param: "valmis", active: true, completed: false });
    expect(view).toMatchObject({ kind: "paid", body: "Voit nyt lähettää sopimuksen allekirjoitettavaksi." });
    expect(paymentReturnView({ product: "tenancy", param: "peruttu", active: false })).toMatchObject({
      title: "Maksu peruttiin. Sopimusta ei lähetetty allekirjoitettavaksi.",
    });
  });

  it("salkku: voimassa, käsittelyssä tai peruttu", () => {
    expect(paymentReturnView({ product: "portfolio", param: "valmis", active: true }).kind).toBe("paid");
    expect(paymentReturnView({ product: "portfolio", param: "valmis", active: false }).kind).toBe("processing");
    expect(paymentReturnView({ product: "portfolio", param: "peruttu", active: false }).kind).toBe("cancelled");
  });
});
