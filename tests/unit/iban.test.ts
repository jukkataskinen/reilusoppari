import { describe, expect, it } from "vitest";
import { formatIban, isValidIban, normalizeIban } from "@/lib/identity/iban";

describe("tilinumero", () => {
  it("hyväksyy kelvollisen suomalaisen IBANin", () => {
    expect(isValidIban("FI21 1234 5600 0007 85")).toBe(true);
    expect(isValidIban("FI2112345600000785")).toBe(true);
  });

  it("hyväksyy ulkomaisen tilin", () => {
    // Vuokranantaja voi asua ulkomailla, ja tili voi olla siellä.
    expect(isValidIban("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(isValidIban("SE45 5000 0000 0583 9825 7466")).toBe(true);
  });

  it("hylkää näppäilyvirheen", () => {
    // Väärä tilinumero on ikävämpi kuin väärä henkilötunnus: sen mukaan
    // maksetaan.
    expect(isValidIban("FI21 1234 5600 0007 86")).toBe(false);
    expect(isValidIban("FI21 1234 5600 0070 85")).toBe(false);
  });

  it("hylkää roskan ja tyhjän", () => {
    for (const roska of ["", "12345600000785", "FI21", "Tilini pankissa"]) {
      expect(isValidIban(roska), roska).toBe(false);
    }
  });

  it("siivoaa välit ja pienet kirjaimet", () => {
    expect(normalizeIban(" fi21-1234 5600 000785 ")).toBe("FI2112345600000785");
  });

  it("muotoilee neljän merkin ryhmiin", () => {
    // Ryhmitelty numero on luettavissa ääneen ja tarkistettavissa silmällä.
    expect(formatIban("FI2112345600000785")).toBe("FI21 1234 5600 0007 85");
  });
});
