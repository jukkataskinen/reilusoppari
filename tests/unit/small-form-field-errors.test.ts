import { describe, expect, it } from "vitest";
import { confirmRentSchema, rentCommentSchema } from "@/lib/rent/confirmation";
import {
  maintenanceCancelSchema,
  maintenanceCommentSchema,
  maintenanceEntrySchema,
} from "@/lib/maintenance/schema";
import { expenseSchema } from "@/lib/expenses/schema";
import { contractCommentSchema } from "@/lib/tenancy/contract-schema";
import { fieldErrors } from "@/lib/forms/schema";

/**
 * PLAN.md "Lomakkeet säilyttävät tiedot": pienten lomakkeiden (kommentit,
 * kuittaus, huoltokirjan merkinnät, kulut) palvelinvirheet näkyvät nyt
 * oikean kentän vierellä, ei yhtenä bannerina.
 *
 * Testit tarkistavat skeemat suoraan — ei koko server actionia, koska se
 * vaatisi kirjautumisen ja kannan. `fieldErrors()` on jo testattu muualla,
 * tässä varmistetaan että virhe kohdistuu oikeaan kenttään.
 */

describe("vuokran kuittaus", () => {
  it("vaatii tunnetun tilan", () => {
    const parsed = confirmRentSchema.safeParse({ status: "muu", amountPaid: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(fieldErrors(parsed.error).status).toBeTruthy();
  });

  it("vaatii summan kun tila on osittain", () => {
    const parsed = confirmRentSchema.safeParse({ status: "partial", amountPaid: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(fieldErrors(parsed.error).amountPaid).toBeTruthy();
  });

  it("ei vaadi summaa muulloin", () => {
    expect(confirmRentSchema.safeParse({ status: "paid", amountPaid: "" }).success).toBe(true);
    expect(confirmRentSchema.safeParse({ status: "not_yet", amountPaid: "" }).success).toBe(true);
  });

  it("hyväksyy osittaisen kun summa on annettu", () => {
    expect(confirmRentSchema.safeParse({ status: "partial", amountPaid: "400" }).success).toBe(
      true,
    );
  });
});

describe("kommenttikentät (kuittaus, huoltokirja, sopimus)", () => {
  it("vuokran kommentti ei saa olla tyhjä", () => {
    const parsed = rentCommentSchema.safeParse({ comment: "   " });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(fieldErrors(parsed.error).comment).toBeTruthy();
  });

  it("huoltokirjan kommentti ei saa olla tyhjä", () => {
    const parsed = maintenanceCommentSchema.safeParse({ body: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(fieldErrors(parsed.error).body).toBeTruthy();
  });

  it("sopimuksen kommentti ei saa olla tyhjä", () => {
    const parsed = contractCommentSchema.safeParse({ body: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(fieldErrors(parsed.error).body).toBeTruthy();
  });

  it("pitkä kommentti kelpaa skeemalle — katkaisu tehdään datakerroksessa", () => {
    // `addContractComment` jne. katkaisevat 300 merkkiin eivätkä hylkää, jotta
    // kirjoitettu teksti ei katoa. Skeema ei siis saa hylätä pitkää tekstiä.
    expect(contractCommentSchema.safeParse({ body: "x".repeat(400) }).success).toBe(true);
  });
});

describe("huoltokirjan merkinnät", () => {
  it("otsikko on pakollinen", () => {
    const parsed = maintenanceEntrySchema.safeParse({ title: "  ", body: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(fieldErrors(parsed.error).title).toBeTruthy();
  });

  it("kuvaus on vapaaehtoinen", () => {
    expect(maintenanceEntrySchema.safeParse({ title: "Hana vuotaa", body: "" }).success).toBe(
      true,
    );
  });

  it("perumisen syy on pakollinen", () => {
    const parsed = maintenanceCancelSchema.safeParse({ reason: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(fieldErrors(parsed.error).reason).toBeTruthy();
  });
});

describe("kulun kirjaus", () => {
  it("vaatii tunnetun luokan", () => {
    const parsed = expenseSchema.safeParse({
      category: "tuntematon",
      date: "2026-09-01",
      amount: "10",
      km: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(fieldErrors(parsed.error).category).toBeTruthy();
  });

  it("vaatii kelvollisen päivän", () => {
    const parsed = expenseSchema.safeParse({
      category: "vuosikorjaus",
      date: "",
      amount: "10",
      km: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(fieldErrors(parsed.error).date).toBeTruthy();
  });

  it("vaatii summan kun luokka ei ole matkat", () => {
    const parsed = expenseSchema.safeParse({
      category: "vuosikorjaus",
      date: "2026-09-01",
      amount: "",
      km: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(fieldErrors(parsed.error).amount).toBeTruthy();
  });

  it("matkakuluissa kilometrit riittävät summan sijaan", () => {
    const parsed = expenseSchema.safeParse({
      category: "matkat",
      date: "2026-09-01",
      amount: "",
      km: "24",
    });
    expect(parsed.success).toBe(true);
  });

  it("matkakulu vaatii joko kilometrit tai summan", () => {
    const parsed = expenseSchema.safeParse({
      category: "matkat",
      date: "2026-09-01",
      amount: "",
      km: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(fieldErrors(parsed.error).km).toBeTruthy();
  });
});
