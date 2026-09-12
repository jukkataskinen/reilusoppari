import { describe, expect, it } from "vitest";
import {
  deletableFrom,
  DELETED,
  evaluateRetention,
  KEPT_FOREVER,
  retentionReport,
  RETENTION_YEARS,
} from "@/lib/retention/rules";

const NYT = new Date("2026-09-12T12:00:00.000Z");

/**
 * Säilytysajan säännöt.
 *
 * Nämä testit ovat poikkeuksellisen tärkeitä siihen nähden, ettei mitään
 * vielä poisteta: kun poisto joskus otetaan käyttöön, se on peruuttamaton.
 * Sääntö on paras tarkistaa nyt, kun virheellä ei ole vielä hintaa.
 */

describe("poistokelpoisuuden alku", () => {
  it("on kolme vuotta päättymisestä", () => {
    expect(deletableFrom("2026-08-31")).toBe("2029-08-31");
    expect(RETENTION_YEARS).toBe(3);
  });

  it("lasketaan kalenterista eikä päivinä", () => {
    /*
      1095 päivää ei ole kolme vuotta, jos välissä on karkausvuosi. Ero on
      käyttäjän tappioksi: tiedot poistuisivat päivää liian aikaisin.
    */
    expect(deletableFrom("2024-03-01")).toBe("2027-03-01");
  });

  it("karkauspäivä siirtyy maaliskuun ensimmäiseen", () => {
    // 29.2.2024 + 3 vuotta: vuotta 2027 ei ole helmikuun 29. päivää.
    expect(deletableFrom("2024-02-29")).toBe("2027-03-01");
  });

  it("on null päättymättömälle vuokrasuhteelle", () => {
    /*
      Päättymätön vuokrasuhde on käytössä oleva vuokrasuhde. Sen tietoja ei
      poisteta, kesti se kuinka kauan tahansa.
    */
    expect(deletableFrom(null)).toBeNull();
  });

  it("on null kelvottomalle päivälle", () => {
    // Rikkinäinen päivä ei saa johtaa poistoon. Epäselvässä tapauksessa
    // säilytetään.
    expect(deletableFrom("roskaa")).toBeNull();
    expect(deletableFrom("")).toBeNull();
  });
});

describe("yhden vuokrasuhteen arvio", () => {
  it("ei ole poistokelpoinen ennen määräaikaa", () => {
    const tulos = evaluateRetention({ tenancyId: "a", endedAt: "2026-08-31" }, NYT);

    expect(tulos.due).toBe(false);
    expect(tulos.deletableFrom).toBe("2029-08-31");
    expect(tulos.daysUntil).toBeGreaterThan(1000);
  });

  it("on poistokelpoinen määräpäivänä", () => {
    // Tasan määräpäivänä, ei vasta sitä seuraavana.
    const tulos = evaluateRetention({ tenancyId: "a", endedAt: "2023-09-12" }, NYT);

    expect(tulos.due).toBe(true);
    expect(tulos.daysUntil).toBe(0);
  });

  it("on poistokelpoinen myöhässäkin", () => {
    const tulos = evaluateRetention({ tenancyId: "a", endedAt: "2020-01-01" }, NYT);

    expect(tulos.due).toBe(true);
    expect(tulos.daysUntil).toBeLessThan(0);
  });

  it("ei ole poistokelpoinen päivää ennen", () => {
    const tulos = evaluateRetention({ tenancyId: "a", endedAt: "2023-09-13" }, NYT);

    expect(tulos.due).toBe(false);
    expect(tulos.daysUntil).toBe(1);
  });

  it("kesken oleva ei ole koskaan poistokelpoinen", () => {
    const tulos = evaluateRetention({ tenancyId: "a", endedAt: null }, NYT);

    expect(tulos.due).toBe(false);
    expect(tulos.deletableFrom).toBeNull();
    expect(tulos.daysUntil).toBeNull();
  });
});

describe("mitä poistetaan", () => {
  it("todistuksia ja tiivisteitä ei poisteta koskaan", () => {
    /*
      Tämä on koko tiedoston tärkein väite. Vuokratodistus on toisen ihmisen
      ansio, jonka hän voi tarvita vielä vuosien päästä, ja tiiviste on ainoa
      tapa osoittaa jälkikäteen, että hänen hallussaan oleva asiakirja on
      aito.

      Jos jokin olisi molemmilla listoilla, todistus katoaisi kolmen vuoden
      päästä — eikä sitä huomaisi kukaan ennen kuin se on tapahtunut.
    */
    for (const sailytettava of KEPT_FOREVER) {
      expect(DELETED as string[]).not.toContain(sailytettava);
    }
  });

  it("luettelo on nimenomainen eikä tyhjä", () => {
    /*
      Nimenomainen luettelo eikä "kaikki paitsi": jos uusi taulu unohtuisi
      lisätä, se jäisi poistamatta ja säilyisi liian kauan. Päinvastainen
      virhe poistaisi sen, mitä ei saa poistaa.
    */
    expect(DELETED).toContain("photos");
    expect(DELETED).toContain("maintenance");
    expect(DELETED).toContain("rent");
    expect(DELETED.length).toBeGreaterThan(0);
  });
});

describe("kuivaharjoitus", () => {
  const vuokrasuhteet = [
    { tenancyId: "vanha", endedAt: "2020-01-01" },
    { tenancyId: "pian", endedAt: "2023-12-01" },
    { tenancyId: "kaukana", endedAt: "2026-08-31" },
    { tenancyId: "kesken", endedAt: null },
  ];

  it("erottaa poistokelpoiset, pian tulevat ja muut", () => {
    const raportti = retentionReport(vuokrasuhteet, NYT);

    expect(raportti.due.map((r) => r.tenancyId)).toEqual(["vanha"]);
    expect(raportti.soon.map((r) => r.tenancyId)).toEqual(["pian"]);
  });

  it("ei laske keskeneräistä mihinkään", () => {
    const raportti = retentionReport(vuokrasuhteet, NYT);

    const kaikki = [...raportti.due, ...raportti.soon].map((r) => r.tenancyId);
    expect(kaikki).not.toContain("kesken");
  });

  it("kertoo myös mitä säilyy", () => {
    // Raportin lukijan on nähtävä molemmat: mikä katoaa ja mikä jää.
    const raportti = retentionReport(vuokrasuhteet, NYT);

    expect(raportti.kept).toContain("certificates");
    expect(raportti.categories).toEqual(DELETED);
  });

  it("tyhjä lista ei tuota poistettavaa", () => {
    const raportti = retentionReport([], NYT);
    expect(raportti.due).toEqual([]);
    expect(raportti.soon).toEqual([]);
  });
});
