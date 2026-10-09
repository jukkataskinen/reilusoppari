import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fieldErrors, requiredDate, requiredNumber } from "@/lib/forms/schema";
import { PROBLEM_SELECTORS, submitterEntry, validityMessage } from "@/lib/forms/validity";

/**
 * Lomakkeiden yhteiset apuvälineet (Jukan havainto 2026-10-09: lomake
 * tyhjeni virheen jälkeen ja esimerkit näyttivät täytetyiltä).
 */

describe("selaimen tarkistuksen viestit", () => {
  it("puuttuva kenttä sanotaan suomeksi", () => {
    expect(validityMessage({ valueMissing: true })).toBe("Tämä tieto puuttuu.");
    expect(validityMessage({ valueMissing: true }, { type: "radio" })).toBe(
      "Valitse yksi vaihtoehdoista.",
    );
  });

  it("kertoo rajan, kun luku on liian pieni tai suuri", () => {
    expect(validityMessage({ rangeUnderflow: true }, { min: "1" })).toBe(
      "Pienin sallittu arvo on 1.",
    );
    expect(validityMessage({ rangeOverflow: true }, { max: "31" })).toBe(
      "Suurin sallittu arvo on 31.",
    );
  });

  it("käyttää kentän omaa viestiä muodon virheessä, ei puuttuvassa arvossa", () => {
    const field = { dataset: { virhe: "Postinumero on viisi numeroa." } };
    expect(validityMessage({ patternMismatch: true }, field)).toBe(
      "Postinumero on viisi numeroa.",
    );
    expect(validityMessage({ valueMissing: true }, field)).toBe("Tämä tieto puuttuu.");
  });

  it("sähköpostin muoto", () => {
    expect(validityMessage({ typeMismatch: true }, { type: "email" })).toBe(
      "Tarkista sähköpostiosoite.",
    );
  });

  it("kunnossa olevasta kentästä ei viestiä", () => {
    expect(validityMessage({})).toBeNull();
  });

  it("siirtyy ensin virheelliseen kenttään ja vasta sitten yleiseen viestiin", () => {
    expect(PROBLEM_SELECTORS[0]).toBe('[aria-invalid="true"]');
    expect(PROBLEM_SELECTORS[1]).toBe('[role="alert"]');
  });
});

describe("painetun napin arvo lomakedataan", () => {
  it("nimetyn napin arvo mukaan", () => {
    expect(submitterEntry({ name: "status", value: "paid" })).toEqual(["status", "paid"]);
  });
  it("nimetön nappi tai puuttuva nappi ei lisää mitään", () => {
    expect(submitterEntry({ name: "", value: "x" })).toBeNull();
    expect(submitterEntry(null)).toBeNull();
  });
});

describe("pakollinen luku", () => {
  const rent = requiredNumber("Vuokra puuttuu", z.number().positive("Vuokran on oltava suurempi kuin nolla"));

  it("tyhjä kenttä on puuttuva, ei nolla", () => {
    for (const value of ["", "   ", null, undefined]) {
      const result = rent.safeParse(value);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe("Vuokra puuttuu");
    }
  });

  it("ymmärtää desimaalipilkun ja tuhaterottimen", () => {
    expect(rent.parse("850")).toBe(850);
    expect(rent.parse("850,50")).toBe(850.5);
    expect(rent.parse("1 250")).toBe(1250);
  });

  it("väärin kirjoitettu ja liian pieni luku saavat omat viestinsä", () => {
    expect(rent.safeParse("kahdeksansataa").error?.issues[0].message).toBe(
      "Kirjoita luku numeroina.",
    );
    expect(rent.safeParse("0").error?.issues[0].message).toBe(
      "Vuokran on oltava suurempi kuin nolla",
    );
  });
});

describe("pakollinen päivämäärä", () => {
  const date = requiredDate("Alkupäivä puuttuu");
  it("tyhjä ja väärä muoto erotetaan", () => {
    expect(date.safeParse("").error?.issues[0].message).toBe("Alkupäivä puuttuu");
    expect(date.safeParse("1.10.2026").error?.issues[0].message).toBe("Tarkista päivämäärä.");
    expect(date.parse("2026-10-01")).toBe("2026-10-01");
  });
});

describe("kenttäkohtaiset virheet", () => {
  it("oletuksena polun ensimmäinen osa, ensimmäinen virhe voittaa", () => {
    const schema = z.object({
      a: z.string().min(1, "A puuttuu").max(1, "A liian pitkä"),
      b: z.string().min(1, "B puuttuu"),
    });
    const result = schema.safeParse({ a: "", b: "" });
    expect(fieldErrors(result.error!)).toEqual({ a: "A puuttuu", b: "B puuttuu" });
  });

  it("sisäkkäisen polun voi muuntaa kentän nimeksi", () => {
    const schema = z.object({ list: z.array(z.object({ name: z.string().min(1, "Nimi puuttuu") })) });
    const result = schema.safeParse({ list: [{ name: "" }] });
    expect(
      fieldErrors(result.error!, (path) => (path[0] === "list" ? `name${String(path[1])}` : undefined)),
    ).toEqual({ name0: "Nimi puuttuu" });
  });

  it("zodin oletusviestit ovat suomeksi", () => {
    const result = z.object({ n: z.number().min(0), s: z.string().min(1) }).safeParse({ n: -1, s: "" });
    expect(fieldErrors(result.error!)).toEqual({
      n: "Pienin sallittu arvo on 0.",
      s: "Tämä tieto puuttuu.",
    });
  });
});
