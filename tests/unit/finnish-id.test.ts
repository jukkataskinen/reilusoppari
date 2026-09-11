import { describe, expect, it } from "vitest";
import {
  birthdateFromHenkilotunnus,
  isValidHenkilotunnus,
  isValidYTunnus,
  maskHenkilotunnus,
  normalizeYTunnus,
} from "@/lib/identity/finnish-id";

/**
 * Tunnukset tässä tiedostossa ovat keksittyjä mutta tarkistusmerkiltään
 * oikeita. Ne eivät kuulu kenellekään — tarkistusmerkki lasketaan kaavalla,
 * joten kelvollisen näköisen tunnuksen voi muodostaa tietämättä kenestäkään
 * mitään.
 */

describe("henkilötunnus", () => {
  it("hyväksyy kelvollisen tunnuksen kaikilta vuosisadoilta", () => {
    expect(isValidHenkilotunnus("131052-308T")).toBe(true);
    expect(isValidHenkilotunnus("010594Y123W")).toBe(true);
    expect(isValidHenkilotunnus("020304A6069")).toBe(true);
  });

  it("hylkää väärän tarkistusmerkin", () => {
    // Yksi näppäilyvirhe sopimuksessa on pysyvä: se jää sinetöityyn
    // asiakirjaan juuri siihen kohtaan, jossa tunnusta tarvittaisiin.
    expect(isValidHenkilotunnus("131052-308U")).toBe(false);
  });

  it("hylkää päivämäärän jota ei ole", () => {
    expect(isValidHenkilotunnus("310252-308T")).toBe(false);
    expect(isValidHenkilotunnus("321052-308T")).toBe(false);
  });

  it("hylkää väliaikaisen 900-sarjan tunnuksen", () => {
    expect(isValidHenkilotunnus("131052-9021")).toBe(false);
  });

  it("hylkää roskan ja tyhjän", () => {
    for (const roska of ["", "1234", "abcdefghijk", "131052308T", "13105-2308T"]) {
      expect(isValidHenkilotunnus(roska), roska).toBe(false);
    }
  });

  it("sietää välilyönnit ja pienet kirjaimet", () => {
    expect(isValidHenkilotunnus(" 131052-308t ")).toBe(true);
  });

  it("kertoo syntymäajan", () => {
    expect(birthdateFromHenkilotunnus("131052-308T")).toBe("1952-10-13");
    expect(birthdateFromHenkilotunnus("020304A6069")).toBe("2004-03-02");
    expect(birthdateFromHenkilotunnus("ei tunnus")).toBeNull();
  });

  it("peittää loppuosan mutta jättää syntymäajan näkyviin", () => {
    // Vuokranantajan on nähtävä tallentaneensa oikean henkilön tunnuksen.
    // Olan yli katsovan ei tarvitse saada sitä kokonaan.
    expect(maskHenkilotunnus("131052-308T")).toBe("131052-***T");
    expect(maskHenkilotunnus("roska")).toBe("•••");
  });
});

describe("y-tunnus", () => {
  it("hyväksyy kelvollisen", () => {
    expect(isValidYTunnus("2617416-4")).toBe(true);
    expect(isValidYTunnus("0112038-9")).toBe(true);
  });

  it("hyväksyy ilman väliviivaa kirjoitetun", () => {
    expect(normalizeYTunnus("26174164")).toBe("2617416-4");
    expect(isValidYTunnus("26174164")).toBe(true);
  });

  it("hylkää väärän tarkistusnumeron ja väärän mittaiset", () => {
    expect(isValidYTunnus("2617416-5")).toBe(false);
    expect(isValidYTunnus("123456-7")).toBe(false);
    expect(isValidYTunnus("")).toBe(false);
  });
});
