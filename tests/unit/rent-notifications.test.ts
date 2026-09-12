import { describe, expect, it } from "vitest";
import {
  notificationsOnConfirm,
  plannedNotifications,
  type PeriodState,
} from "@/lib/rent/notifications";

/**
 * Vuokranmaksun heräteketju (Jukan linjaus 2026-09-12).
 *
 * Vuokra erääntyy 5. päivä. Tarkistus 8. päivä, toinen 15. päivä.
 */

const KAUSI: PeriodState = {
  periodId: "p1",
  tenancyId: "t1",
  periodMonth: "2026-09-01",
  dueDate: "2026-09-05",
  amount: 850,
  status: null,
  amountPaid: null,
};

const paivana = (iso: string) => new Date(`${iso}T09:00:00.000Z`);
const lajit = (state: Partial<PeriodState>, iso: string) =>
  plannedNotifications({ ...KAUSI, ...state }, paivana(iso)).map((n) => n.kind);

describe("ennen tarkistuspäivää", () => {
  it("eräpäivänä ei lähde mitään", () => {
    // Maksu voi olla matkalla. Eräpäivän muistutus olisi hätiköity.
    expect(lajit({}, "2026-09-05")).toEqual([]);
  });

  it("eräpäivän jälkeisenä päivänä ei vielä mitään", () => {
    expect(lajit({}, "2026-09-06")).toEqual([]);
  });
});

describe("ensimmäinen tarkistus 8. päivä", () => {
  it("vuokranantajaa pyydetään tarkistamaan tilanne", () => {
    expect(lajit({}, "2026-09-08")).toEqual(["rent.check"]);
  });

  it("vuokralaiselle ei lähde mitään ennen merkintää", () => {
    /*
      Muistutus seuraa merkintää eikä kelloa. Aikaan perustuva muistutus
      tavoittaisi myös ne, jotka ovat maksaneet ajallaan — ja perusteeton
      muistutus maksamattomasta vuokrasta on loukkaus, ei palvelu.
    */
    const kaikki = plannedNotifications(KAUSI, paivana("2026-09-08"));
    expect(kaikki.every((n) => n.recipient === "landlord")).toBe(true);
  });

  it("merkintä 'kyllä' päättää ketjun ja kertoo vuokralaiselle", () => {
    expect(lajit({ status: "paid" }, "2026-09-08")).toEqual(["rent.confirmed"]);
  });

  it("merkintä 'ei vielä' tuo vuokralaiselle ystävällisen muistutuksen", () => {
    expect(lajit({ status: "not_yet" }, "2026-09-08")).toEqual(["rent.reminder.friendly"]);
  });

  it("osittainen maksu muistuttaa vain puuttuvasta osasta", () => {
    const viestit = plannedNotifications(
      { ...KAUSI, status: "partial", amountPaid: 400 },
      paivana("2026-09-08"),
    );
    expect(viestit[0].kind).toBe("rent.reminder.friendly");
    expect(viestit[0].body).toContain("450 €");
    expect(viestit[0].body).not.toContain("850 €");
  });

  it("ystävällinen muistutus jättää tilaa erehdykselle", () => {
    // Maksu on voinut olla matkalla, ja sanamuodon on kestettävä se.
    const viesti = plannedNotifications({ ...KAUSI, status: "not_yet" }, paivana("2026-09-08"));
    expect(viesti[0].body).toContain("Jos maksu on jo matkalla");
  });
});

describe("toinen tarkistus 15. päivä", () => {
  it("vuokranantaja saa toisen kierroksen, jos vuokraa ei ole saatu", () => {
    expect(lajit({ status: "not_yet" }, "2026-09-15")).toContain("rent.check.second");
  });

  it("vuokralainen saa napakan viestin ja ohjeen ottaa yhteyttä", () => {
    const viestit = plannedNotifications({ ...KAUSI, status: "not_yet" }, paivana("2026-09-15"));
    const napakka = viestit.find((n) => n.kind === "rent.reminder.firm");

    expect(napakka).toBeDefined();
    expect(napakka!.body).toContain("Ota yhteyttä vuokranantajaan");
    expect(napakka!.body).toContain("sopikaa");
  });

  it("napakka viesti ei uhkaa perinnällä eikä rekisterimerkinnällä", () => {
    // Palvelu ei peri saatavia eikä välitä tietoa minnekään, eikä sen viesti
    // saa antaa ymmärtää toisin.
    const viestit = plannedNotifications({ ...KAUSI, status: "not_yet" }, paivana("2026-09-20"));
    const teksti = viestit.map((n) => `${n.title} ${n.body}`).join(" ").toLowerCase();

    for (const sana of ["perint", "luottotie", "maksuhäiri", "ulosott", "irtisano"]) {
      expect(teksti, sana).not.toContain(sana);
    }
  });

  it("maksettu vuokra ei tuota toista kierrosta", () => {
    expect(lajit({ status: "paid" }, "2026-09-15")).toEqual(["rent.confirmed"]);
  });

  it("kuittaamaton kausi pyytää yhä tarkistusta muttei muistuta vuokralaista", () => {
    const viestit = plannedNotifications(KAUSI, paivana("2026-09-20"));
    expect(viestit.map((n) => n.kind)).toEqual(["rent.check", "rent.check.second"]);
  });
});

describe("toiston esto", () => {
  it("jokaisella viestillä on kauteen sidottu tunniste", () => {
    // Myöhässä ajettu cron ei saa lähettää samaa viestiä uudelleen.
    const viestit = plannedNotifications({ ...KAUSI, status: "not_yet" }, paivana("2026-09-20"));
    const tunnisteet = viestit.map((n) => n.dedupeKey);

    expect(new Set(tunnisteet).size).toBe(tunnisteet.length);
    expect(tunnisteet).toContain("rent.reminder.firm:p1");
  });

  it("myöhässä ajettu cron tuottaa koko ketjun eikä hukkaa viestejä", () => {
    const viestit = lajit({ status: "not_yet" }, "2026-10-01");
    expect(viestit).toContain("rent.check.second");
    expect(viestit).toContain("rent.reminder.friendly");
    expect(viestit).toContain("rent.reminder.firm");
  });
});

describe("merkinnän jälkeen lähtevät viestit", () => {
  it("vain vuokralaiselle: vuokranantaja teki juuri merkinnän", () => {
    // Cron lähettäisi saman seuraavana aamuna, mutta vuorokauden viive
    // tuntuisi siltä, ettei merkinnällä ollut vaikutusta.
    const viestit = notificationsOnConfirm(
      { ...KAUSI, status: "not_yet" },
      paivana("2026-09-08"),
    );
    expect(viestit.every((n) => n.recipient === "tenant")).toBe(true);
    expect(viestit.map((n) => n.kind)).toEqual(["rent.reminder.friendly"]);
  });

  it("kuittaus 'kyllä' kertoo vuokralaiselle heti", () => {
    const viestit = notificationsOnConfirm({ ...KAUSI, status: "paid" }, paivana("2026-09-06"));
    expect(viestit.map((n) => n.kind)).toEqual(["rent.confirmed"]);
  });
});
