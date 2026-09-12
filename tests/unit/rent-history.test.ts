import { describe, expect, it } from "vitest";
import {
  classifyPayment,
  daysLate,
  PAYMENT_CLASS_LABEL,
  summarizeRentHistory,
  summarySentence,
  type PaidPeriod,
} from "@/lib/rent/history";

/**
 * Vuokranmaksun luokittelu todistusta varten (Jukan linjaus 2026-09-12).
 *
 * Vuokra erääntyy 5. päivä. Ensimmäinen tarkistus 8. päivä, toinen 15. päivä,
 * ja luokkien rajat ovat samat kuin muistutusketjun rajat.
 */

const maksettu = (paidAt: string): PaidPeriod => ({
  dueDate: "2026-09-05",
  status: "paid",
  paidAt,
});

describe("yhden kauden luokka", () => {
  it("ensimmäiseen tarkistukseen mennessä maksettu on ajallaan", () => {
    expect(classifyPayment(maksettu("2026-09-05T10:00:00.000Z"))).toBe("on_time");
    expect(classifyPayment(maksettu("2026-09-08T10:00:00.000Z"))).toBe("on_time");
  });

  it("etuajassa maksettu on ajallaan", () => {
    expect(classifyPayment(maksettu("2026-09-01T10:00:00.000Z"))).toBe("on_time");
  });

  it("muistutuksen jälkeen maksettu on vähän myöhässä mutta ok", () => {
    // Luokka tarkoittaa nimenomaan sitä, että vuokralainen hoiti asian heti
    // kun siitä huomautettiin.
    expect(classifyPayment(maksettu("2026-09-09T10:00:00.000Z"))).toBe("slightly_late");
    expect(classifyPayment(maksettu("2026-09-15T10:00:00.000Z"))).toBe("slightly_late");
  });

  it("toisen tarkistuksen jälkeen maksettu on viivästynyt", () => {
    expect(classifyPayment(maksettu("2026-09-16T10:00:00.000Z"))).toBe("delayed");
    expect(classifyPayment(maksettu("2026-11-01T10:00:00.000Z"))).toBe("delayed");
  });

  it("maksamaton ja osittain maksettu ovat viivästyneitä", () => {
    // Osittainen maksu on yritys, mutta todistuksessa se ei ole sama asia
    // kuin maksettu.
    expect(classifyPayment({ dueDate: "2026-09-05", status: "not_yet", paidAt: null })).toBe(
      "delayed",
    );
    expect(classifyPayment({ dueDate: "2026-09-05", status: "partial", paidAt: null })).toBe(
      "delayed",
    );
  });

  it("kuittaamaton kausi on viivästynyt", () => {
    // Todistus tehdään vuokrasuhteen päättyessä, jolloin avoin kausi on
    // avoin lopullisesti.
    expect(classifyPayment({ dueDate: "2026-09-05", status: null, paidAt: null })).toBe("delayed");
  });

  it("maksetuksi merkitty ilman maksuhetkeä on viivästynyt", () => {
    // Vanha rivi ennen migraatiota 0008. Arvaus olisi pahempi kuin varovainen
    // luokka: todistus ei saa väittää enempää kuin tiedetään.
    expect(classifyPayment({ dueDate: "2026-09-05", status: "paid", paidAt: null })).toBe(
      "delayed",
    );
  });

  it("laskee päivät eräpäivästä", () => {
    expect(daysLate("2026-09-05", "2026-09-08T23:59:00.000Z")).toBe(3);
    expect(daysLate("2026-09-05", "2026-09-02T10:00:00.000Z")).toBe(-3);
  });
});

describe("koko vuokrasuhteen yhteenveto", () => {
  const kaudet: PaidPeriod[] = [
    maksettu("2026-09-06T10:00:00.000Z"),
    { dueDate: "2026-10-05", status: "paid", paidAt: "2026-10-12T10:00:00.000Z" },
    { dueDate: "2026-11-05", status: "not_yet", paidAt: null },
    { dueDate: "2026-12-05", status: "paid", paidAt: "2026-12-05T10:00:00.000Z" },
  ];

  it("laskee luokat", () => {
    expect(summarizeRentHistory(kaudet)).toEqual({
      months: 4,
      onTime: 2,
      slightlyLate: 1,
      delayed: 1,
    });
  });

  it("lause kertoo luvut eikä tulkitse niitä", () => {
    // "34 kuukaudesta 32 ajallaan" on tosiasia, "erinomainen maksaja" on
    // arvio. Arvion antaa ihminen suosituksellaan, ei palvelu laskemalla.
    const lause = summarySentence(summarizeRentHistory(kaudet));

    expect(lause).toContain("4 kuukaudesta");
    expect(lause).toContain("2 maksettu ajallaan");
    expect(lause).toContain("1 vähän myöhässä mutta ok");
    expect(lause).toContain("1 viivästynyt");
  });

  it("moitteettomasta historiasta ei luetella tyhjiä luokkia", () => {
    const lause = summarySentence(
      summarizeRentHistory([maksettu("2026-09-05T10:00:00.000Z")]),
    );
    expect(lause).toBe("1 kuukaudesta: 1 maksettu ajallaan.");
  });

  it("tyhjä historia sanotaan ääneen", () => {
    expect(summarySentence(summarizeRentHistory([]))).toContain("ei ehtinyt kertyä");
  });

  it("sanasto ei ole luottotietosanastoa", () => {
    // CLAUDE.md kohta 2: vuokratodistus, ei luottotieto tai maksuhäiriö.
    const kaikki = Object.values(PAYMENT_CLASS_LABEL).join(" ").toLowerCase();
    for (const sana of ["maksuhäiri", "luottotie", "laiminly", "perint"]) {
      expect(kaikki, sana).not.toContain(sana);
    }
    expect(PAYMENT_CLASS_LABEL.delayed).toBe("vuokranmaksu viivästynyt");
  });
});
