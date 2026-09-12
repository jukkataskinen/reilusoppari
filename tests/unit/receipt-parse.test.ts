import { describe, expect, it } from "vitest";
import {
  extractJson,
  hasContent,
  parseReceipt,
  RECEIPT_PROMPT,
  EMPTY_READING,
} from "@/lib/receipts";

const NYT = new Date("2026-09-12T12:00:00.000Z");

/**
 * Kuitilta luetun vastauksen jäsennys.
 *
 * Tämä on se osa, joka menee rikki hiljaa, kun mallin vastaus muuttuu
 * hieman — ja väärä summa valuu suoraan verolaskelmaan. Siksi se on puhdas
 * funktio ja testattu tiheästi.
 */

describe("JSONin poiminta vastauksesta", () => {
  it("lukee tavallisen JSONin", () => {
    expect(extractJson('{"summa":12.9}')).toEqual({ summa: 12.9 });
  });

  it("riisuu koodiaidat", () => {
    // Malli lisää ne toisinaan, vaikka niitä ei pyydetä.
    expect(extractJson('```json\n{"summa":12.9}\n```')).toEqual({ summa: 12.9 });
    expect(extractJson('```\n{"summa":12.9}\n```')).toEqual({ summa: 12.9 });
  });

  it("palauttaa null rikkinäisestä", () => {
    /*
      `null` eikä poikkeus: kuvaaminen ei saa kaatua siihen, ettei lukeminen
      onnistunut. Kuitti on silti tallessa.
    */
    expect(extractJson("en osaa lukea tätä")).toBeNull();
    expect(extractJson("")).toBeNull();
    expect(extractJson("   ")).toBeNull();
  });
});

describe("summan tarkistus", () => {
  it("lukee summan", () => {
    expect(parseReceipt({ summa: 129.9 }, NYT).total).toBe(129.9);
  });

  it("hyväksyy pilkullisen merkkijonon", () => {
    // Suomeksi desimaalierotin on pilkku, ja malli voi palauttaa sen niin.
    expect(parseReceipt({ summa: "12,90" }, NYT).total).toBe(12.9);
  });

  it("hylkää nollan ja negatiivisen", () => {
    // Kumpikaan ei ole kulu.
    expect(parseReceipt({ summa: 0 }, NYT).total).toBeNull();
    expect(parseReceipt({ summa: -50 }, NYT).total).toBeNull();
  });

  it("hylkää absurdin suuren", () => {
    /*
      Yleisin lukuvirhe on desimaalipilkun katoaminen: 12,90 luettuna
      1290:ksi. Sitä ei huomaa lomakkeella, koska se näyttää summalta.
      Yläraja ei pyydä sitä kiinni, mutta selvästi absurdit se pysäyttää.
    */
    expect(parseReceipt({ summa: 5_000_000 }, NYT).total).toBeNull();
  });

  it("hylkää sen, mikä ei ole luku", () => {
    expect(parseReceipt({ summa: "ei tiedossa" }, NYT).total).toBeNull();
    expect(parseReceipt({ summa: null }, NYT).total).toBeNull();
    expect(parseReceipt({ summa: {} }, NYT).total).toBeNull();
  });

  it("pyöristää senttiin", () => {
    expect(parseReceipt({ summa: 12.9449 }, NYT).total).toBe(12.94);
  });
});

describe("alvin tarkistus", () => {
  it("lukee alvin", () => {
    expect(parseReceipt({ summa: 129.9, alv: 26.4 }, NYT).vat).toBe(26.4);
  });

  it("hylkää alvin, joka on suurempi kuin summa", () => {
    /*
      Mahdoton: toinen luvuista on luettu väärin. Kumpaa ei tiedetä, joten
      epäluotettava jätetään pois ja summa jää — summa on se, jota laskelma
      tarvitsee.
    */
    const luenta = parseReceipt({ summa: 100, alv: 150 }, NYT);
    expect(luenta.vat).toBeNull();
    expect(luenta.total).toBe(100);
  });

  it("sallii alvin ilman summaa", () => {
    // Vertailua ei voi tehdä, joten arvo jää sellaisenaan.
    expect(parseReceipt({ alv: 26.4 }, NYT).vat).toBe(26.4);
  });
});

describe("päivän tarkistus", () => {
  it("lukee päivän", () => {
    expect(parseReceipt({ paivamaara: "2026-09-10" }, NYT).date).toBe("2026-09-10");
  });

  it("hylkää tulevaisuuden", () => {
    /*
      Aina lukuvirhe — kuittia ei ole vielä olemassa. Se on myös se virhe,
      joka rikkoisi verolaskelman: väärälle vuodelle kirjattu kulu ei näy
      siinä laskelmassa, johon se kuuluu.
    */
    expect(parseReceipt({ paivamaara: "2027-01-01" }, NYT).date).toBeNull();
  });

  it("sallii tämän päivän", () => {
    expect(parseReceipt({ paivamaara: "2026-09-12" }, NYT).date).toBe("2026-09-12");
  });

  it("hylkää päivän, jota ei ole olemassa", () => {
    expect(parseReceipt({ paivamaara: "2026-02-31" }, NYT).date).toBeNull();
    expect(parseReceipt({ paivamaara: "2026-13-01" }, NYT).date).toBeNull();
  });

  it("hylkää väärän muodon", () => {
    expect(parseReceipt({ paivamaara: "10.9.2026" }, NYT).date).toBeNull();
    expect(parseReceipt({ paivamaara: "2026-9-1" }, NYT).date).toBeNull();
  });

  it("hylkää liian vanhan", () => {
    // Sovellusta ei ole ollut olemassa; kyse on lukuvirheestä vuosiluvussa.
    expect(parseReceipt({ paivamaara: "1999-05-05" }, NYT).date).toBeNull();
  });
});

describe("myyjän nimi", () => {
  it("siivoaa välilyönnit", () => {
    expect(parseReceipt({ myyja: "  K-Rauta   Jyväskylä " }, NYT).merchant).toBe(
      "K-Rauta Jyväskylä",
    );
  });

  it("hylkää tyhjän ja null-merkkijonon", () => {
    expect(parseReceipt({ myyja: "   " }, NYT).merchant).toBeNull();
    expect(parseReceipt({ myyja: "null" }, NYT).merchant).toBeNull();
  });

  it("katkaisee liian pitkän", () => {
    expect(parseReceipt({ myyja: "a".repeat(500) }, NYT).merchant?.length).toBe(100);
  });
});

describe("kokonaisuus", () => {
  it("rikkinäinen vastaus tuottaa tyhjän luennan eikä poikkeusta", () => {
    expect(parseReceipt(null, NYT)).toEqual(EMPTY_READING);
    expect(parseReceipt("roskaa", NYT)).toEqual(EMPTY_READING);
    expect(parseReceipt([], NYT)).toEqual(EMPTY_READING);
    expect(parseReceipt(undefined, NYT)).toEqual(EMPTY_READING);
  });

  it("osittain luettu kuitti kelpaa", () => {
    // Summa saatiin, päivää ei. Käyttäjä täyttää loput.
    const luenta = parseReceipt({ summa: 45.5, paivamaara: null, myyja: null }, NYT);
    expect(luenta.total).toBe(45.5);
    expect(hasContent(luenta)).toBe(true);
  });

  it("tyhjä luenta tunnistetaan tyhjäksi", () => {
    expect(hasContent(EMPTY_READING)).toBe(false);
  });

  it("ei lue kululuokkaa lainkaan", () => {
    /*
      Raja vuosikorjauksen ja perusparannuksen välillä on verotuksellinen
      arvio, ja väärin esitäytetty luokka siirtäisi summan hiljaa väärään
      osioon laskelmassa. Malli lukee tosiasioita, ihminen tekee päätökset.
    */
    const luenta = parseReceipt({ summa: 100, luokka: "perusparannus" }, NYT);
    expect(Object.keys(luenta).sort()).toEqual(["date", "merchant", "total", "vat"]);
  });
});

describe("kehote", () => {
  it("kieltää arvaamisen nimenomaisesti", () => {
    /*
      Ilman tätä malli arvaa mieluummin kuin jättää tyhjän — ja arvaus
      näyttää lomakkeella samalta kuin luettu arvo.
    */
    expect(RECEIPT_PROMPT).toContain("Älä arvaa");
    expect(RECEIPT_PROMPT).toContain("null");
  });

  it("ei pyydä kululuokkaa", () => {
    expect(RECEIPT_PROMPT.toLowerCase()).not.toContain("luokka");
    expect(RECEIPT_PROMPT.toLowerCase()).not.toContain("perusparannus");
  });
});
