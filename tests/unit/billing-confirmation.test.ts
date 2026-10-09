import { describe, expect, it } from "vitest";
import { orderConfirmationEmail } from "@/lib/billing/confirmation";

describe("tilausvahvistuksen sisältö", () => {
  it("kertoo kertamaksun summan ja vuokrasuhteen", () => {
    const message = orderConfirmationEmail({
      product: "tenancy_29",
      amountCents: 2900,
      path: "/vuokrasuhteet/vs-1",
    });

    expect(message.title).toContain("Maksu vastaanotettu");
    expect(message.body).toContain("29,00 €");
    expect(message.body).toContain("Vuokralainen ei maksa");
    expect(message.path).toBe("/vuokrasuhteet/vs-1");
  });

  it("kertoo Plus-tilauksen jatkuvan vuosittain", () => {
    const message = orderConfirmationEmail({
      product: "plus_yearly",
      amountCents: 1200,
      path: "/asunnot/a-1/verolaskelma",
    });

    expect(message.body).toContain("12,00 €");
    expect(message.body).toContain("jatkuu vuosittain");
    expect(message.path).toBe("/asunnot/a-1/verolaskelma");
  });

  it("kertoo salkkutilauksen summan useista asunnoista", () => {
    const message = orderConfirmationEmail({
      product: "portfolio_yearly",
      amountCents: 7500,
      path: "/laskutus",
    });

    expect(message.title).toContain("Salkkutilaus");
    expect(message.body).toContain("75,00 €");
  });

  it("ei sisällä merkkejä, jotka eivät kelpaa suomenkieliseen kuittiin", () => {
    const message = orderConfirmationEmail({
      product: "tenancy_29",
      amountCents: 100,
      path: "/vuokrasuhteet/vs-2",
    });

    expect(message.body).not.toContain("undefined");
    expect(message.body).not.toContain("null");
  });
});
