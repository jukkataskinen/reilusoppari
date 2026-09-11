import { describe, expect, it } from "vitest";
import {
  fieldErrors,
  formatAddress,
  propertyFormToInput,
  propertySchema,
} from "@/lib/property/schema";

/**
 * Asunnon lomakkeen validointi.
 *
 * Painopiste on siinä, mitä käyttäjä oikeasti kirjoittaa: desimaalipilkun,
 * tyhjät valinnaiset kentät ja välilyönnit. Näistä syntyvät ne virheet, joita
 * käyttäjä ei ymmärrä — "Pinta-ala on suurempi kuin nolla", kun hän kirjoitti
 * 54,5.
 */

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const MINIMAL = {
  street: "Testikatu 1 A 4",
  postalCode: "00100",
  city: "Helsinki",
  propertyType: "kerrostalo",
};

describe("asunnon lomake", () => {
  it("hyväksyy vähimmäistiedot", () => {
    const parsed = propertySchema.safeParse(propertyFormToInput(form(MINIMAL)));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.street).toBe("Testikatu 1 A 4");
      // Tyhjät valinnaiset kentät ovat null, eivät tyhjiä merkkijonoja:
      // tietokantaan ei haluta rivejä, joissa nimi on "".
      expect(parsed.data.name).toBeNull();
      expect(parsed.data.rooms).toBeNull();
      expect(parsed.data.areaM2).toBeNull();
      expect(parsed.data.tenure).toBeNull();
    }
  });

  it("ymmärtää desimaalipilkun", () => {
    // Suomeksi kirjoitetaan 54,5. Ilman muunnosta tämä olisi NaN ja lomake
    // hylkäisi oikean arvon epämääräisellä virheellä.
    const parsed = propertySchema.safeParse(
      propertyFormToInput(form({ ...MINIMAL, areaM2: "54,5" })),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.areaM2).toBe(54.5);
  });

  it("hyväksyy myös pisteen desimaalierottimena", () => {
    const parsed = propertySchema.safeParse(
      propertyFormToInput(form({ ...MINIMAL, areaM2: "54.5" })),
    );
    expect(parsed.success && parsed.data.areaM2).toBe(54.5);
  });

  it("siivoaa välilyönnit", () => {
    const parsed = propertySchema.safeParse(
      propertyFormToInput(form({ ...MINIMAL, street: "  Testikatu 1  ", postalCode: " 00100 " })),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.street).toBe("Testikatu 1");
      expect(parsed.data.postalCode).toBe("00100");
    }
  });

  it("vaatii viisinumeroisen postinumeron", () => {
    for (const value of ["001", "0010a", "001000", ""]) {
      const parsed = propertySchema.safeParse(
        propertyFormToInput(form({ ...MINIMAL, postalCode: value })),
      );
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(fieldErrors(parsed.error).postalCode).toBe("Postinumero on viisi numeroa");
      }
    }
  });

  it("torjuu tuntemattoman asuntotyypin", () => {
    // Tyyppi tulee valintalistasta, mutta lomakkeen voi lähettää ohi listan.
    const parsed = propertySchema.safeParse(
      propertyFormToInput(form({ ...MINIMAL, propertyType: "linnoitus" })),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(fieldErrors(parsed.error).propertyType).toBe("Valitse asunnon tyyppi");
  });

  it("torjuu järjettömän huoneluvun mutta kertoo miksi", () => {
    const zero = propertySchema.safeParse(propertyFormToInput(form({ ...MINIMAL, rooms: "0" })));
    expect(zero.success).toBe(false);
    if (!zero.success) expect(fieldErrors(zero.error).rooms).toBe("Vähintään yksi huone");

    const many = propertySchema.safeParse(propertyFormToInput(form({ ...MINIMAL, rooms: "99" })));
    expect(many.success).toBe(false);
    if (!many.success) expect(fieldErrors(many.error).rooms).toBe("Enintään 20 huonetta");

    const half = propertySchema.safeParse(propertyFormToInput(form({ ...MINIMAL, rooms: "2,5" })));
    expect(half.success).toBe(false);
    if (!half.success) expect(fieldErrors(half.error).rooms).toBe("Huoneluku on kokonaisluku");
  });

  it("kertoo puuttuvat pakolliset kentät kerralla", () => {
    const parsed = propertySchema.safeParse(propertyFormToInput(form({ propertyType: "muu" })));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const errors = fieldErrors(parsed.error);
      // Käyttäjän ei pidä korjata yhtä kenttää kerrallaan ja lähettää uudelleen.
      expect(Object.keys(errors).sort()).toEqual(["city", "postalCode", "street"]);
    }
  });
});

describe("osoitteen muotoilu", () => {
  it("on yksi rivi", () => {
    expect(formatAddress({ street: "Testikatu 1 A 4", postalCode: "00100", city: "Helsinki" })).toBe(
      "Testikatu 1 A 4, 00100 Helsinki",
    );
  });
});
