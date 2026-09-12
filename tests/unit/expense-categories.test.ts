import { describe, expect, it } from "vitest";
import {
  EXPENSE_CATEGORIES,
  categoryInfo,
  isExpenseCategory,
  isKmRateConfirmed,
  kmRate,
  travelCost,
} from "@/lib/expenses/categories";

describe("kululuokat", () => {
  it("kattavat verottajan vuokratulolomakkeen luokat", () => {
    // Nimet ja jaottelu seuraavat lomaketta, jotta rivit voi siirtää
    // OmaVeroon ilman tulkintaa.
    const arvot = EXPENSE_CATEGORIES.map((c) => c.value);
    for (const luokka of [
      "hoitovastike",
      "rahoitusvastike_tuloutettu",
      "rahoitusvastike_rahastoitu",
      "vuosikorjaus",
      "perusparannus",
      "kalusteet",
      "matkat",
      "vakuutus",
      "korot",
      "muu",
    ]) {
      expect(arvot, luokka).toContain(luokka);
    }
  });

  it("erottavat sen, mikä ei ole vuosikulu", () => {
    /*
      Rahastoitu rahoitusvastike lisätään hankintamenoon ja perusparannus
      vähennetään poistoina. Jos ne summautuisivat vuosikuluihin, laskelma
      olisi väärä juuri siinä kohdassa, jossa virhe maksaa.
    */
    expect(categoryInfo("rahoitusvastike_rahastoitu").deductibleAnnually).toBe(false);
    expect(categoryInfo("perusparannus").deductibleAnnually).toBe(false);
    expect(categoryInfo("korot").deductibleAnnually).toBe(false);

    expect(categoryInfo("vuosikorjaus").deductibleAnnually).toBe(true);
    expect(categoryInfo("hoitovastike").deductibleAnnually).toBe(true);
  });

  it("jokaisella luokalla on ohje", () => {
    for (const luokka of EXPENSE_CATEGORIES) {
      expect(luokka.hint.length, luokka.value).toBeGreaterThan(10);
    }
  });

  it("tunnistavat tuntemattoman luokan", () => {
    expect(isExpenseCategory("vuosikorjaus")).toBe(true);
    expect(isExpenseCategory("keksitty")).toBe(false);
  });
});

describe("kilometritaksa", () => {
  it("on vuosikohtainen", () => {
    // Vanhan vuoden kulu lasketaan sen vuoden taksalla: laskelma tehdään
    // usein vasta seuraavana keväänä.
    expect(kmRate(2025)).not.toBe(kmRate(2026));
  });

  it("kertoo, onko vuoden taksa vahvistettu", () => {
    expect(isKmRateConfirmed(2026)).toBe(true);
    expect(isKmRateConfirmed(2099)).toBe(false);
  });

  it("tuntemattomalle vuodelle käytetään viimeisintä tiedossa olevaa", () => {
    // Parempi kuin kaatua: kulu on kirjattava, ja luku korjautuu kun taksa
    // päivitetään.
    expect(kmRate(2099)).toBe(kmRate(2026));
  });

  it("laskee matkakulun sentin tarkkuudella", () => {
    expect(travelCost(24, 2026)).toBe(Math.round(24 * kmRate(2026) * 100) / 100);
    expect(travelCost(0, 2026)).toBe(0);
  });
});
