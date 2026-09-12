import { describe, expect, it } from "vitest";
import {
  evaluateNotice,
  monthsBetween,
  noticeMonthsFor,
  tenancyEndsAt,
  type NoticeState,
} from "@/lib/tenancy/ending";

const tila = (yli: Partial<NoticeState> = {}): NoticeState => ({
  by: "tenant",
  status: "active",
  startDate: "2026-09-01",
  endDate: null,
  contractNoticeMonths: 1,
  minimumTermMonths: null,
  noticeGivenAt: null,
  noticeDate: "2027-09-20",
  ...yli,
});

describe("irtisanomisajan laskenta", () => {
  it("alkaa irtisanomiskuukauden viimeisestä päivästä", () => {
    /*
      AHVL 481/1995. Tämä on se kohta, jonka ihmiset laskevat väärin: 20.
      syyskuuta tehty irtisanominen kuukauden ajalla päättää vuokrasuhteen
      31. lokakuuta, ei 20. lokakuuta.
    */
    expect(tenancyEndsAt("2026-09-20", 1)).toBe("2026-10-31");
    expect(tenancyEndsAt("2026-09-01", 1)).toBe("2026-10-31");
    expect(tenancyEndsAt("2026-09-30", 1)).toBe("2026-10-31");
  });

  it("selviää helmikuusta ja vuodenvaihteesta", () => {
    expect(tenancyEndsAt("2027-01-15", 1)).toBe("2027-02-28");
    expect(tenancyEndsAt("2028-01-15", 1)).toBe("2028-02-29");
    expect(tenancyEndsAt("2026-11-10", 3)).toBe("2027-02-28");
  });

  it("kolmen ja kuuden kuukauden ajat", () => {
    expect(tenancyEndsAt("2026-09-20", 3)).toBe("2026-12-31");
    expect(tenancyEndsAt("2026-09-20", 6)).toBe("2027-03-31");
  });
});

describe("kumman irtisanominen, sen aika", () => {
  it("vuokralaiselle vähintään kuukausi", () => {
    expect(noticeMonthsFor("tenant", 1, "2026-09-01", "2027-01-10")).toBe(1);
    // Sopimuksen pidempi aika pätee.
    expect(noticeMonthsFor("tenant", 2, "2026-09-01", "2027-01-10")).toBe(2);
  });

  it("vuokranantajalle vähintään kolme kuukautta", () => {
    expect(noticeMonthsFor("landlord", 1, "2026-09-01", "2026-11-10")).toBe(3);
  });

  it("vuokranantajalle kuusi kuukautta yli vuoden kestäneessä", () => {
    expect(noticeMonthsFor("landlord", 1, "2026-09-01", "2027-09-10")).toBe(6);
    // Tasan vuosi ei vielä riitä: kesto lasketaan täysinä kuukausina.
    expect(noticeMonthsFor("landlord", 1, "2026-09-01", "2027-08-20")).toBe(3);
  });

  it("sopimuksen liian lyhyt ehto ei lyhennä suojaa", () => {
    // Vuokralaisen vahingoksi tehty ehto on mitätön: sovellus käyttää
    // pidempää sopimuksen ja lain välillä.
    expect(noticeMonthsFor("landlord", 0, "2026-09-01", "2026-11-10")).toBe(3);
    expect(noticeMonthsFor("tenant", 0, "2026-09-01", "2026-11-10")).toBe(1);
  });

  it("laskee keston täysinä kuukausina", () => {
    expect(monthsBetween("2026-09-01", "2027-09-01")).toBe(12);
    expect(monthsBetween("2026-09-15", "2027-09-14")).toBe(11);
    expect(monthsBetween("2026-09-01", "2026-09-30")).toBe(0);
  });
});

describe("irtisanomisen kirjaaminen", () => {
  it("onnistuu ja kertoo päättymispäivän", () => {
    const paate = evaluateNotice(tila());
    expect(paate.allowed).toBe(true);
    if (!paate.allowed) return;
    expect(paate.months).toBe(1);
    expect(paate.endsAt).toBe("2027-10-31");
  });

  it("vuokranantajan irtisanominen yli vuoden jälkeen on kuusi kuukautta", () => {
    const paate = evaluateNotice(tila({ by: "landlord" }));
    expect(paate.allowed && paate.months).toBe(6);
    expect(paate.allowed && paate.endsAt).toBe("2028-03-31");
  });

  it("estyy, jos irtisanominen on jo kirjattu", () => {
    const paate = evaluateNotice(tila({ noticeGivenAt: "2027-09-20T10:00:00.000Z" }));
    expect(paate.allowed).toBe(false);
    if (!paate.allowed) expect(paate.reason).toBe("already_given");
  });

  it("estyy, jos vuokrasuhde ei ole käynnissä", () => {
    const paate = evaluateNotice(tila({ status: "inspection" }));
    expect(paate.allowed).toBe(false);
    if (!paate.allowed) expect(paate.reason).toBe("not_active");
  });

  it("määräaikaista ei voi irtisanoa yksipuolisesti", () => {
    /*
      Ennenaikainen päättäminen vaatii osapuolten sopimuksen tai
      tuomioistuimen. Kumpikaan ei ole nappi sovelluksessa, ja sen
      teeskenteleminen olisi harhaanjohtavaa.
    */
    const paate = evaluateNotice(tila({ endDate: "2028-08-31" }));
    expect(paate.allowed).toBe(false);
    if (paate.allowed) return;
    expect(paate.reason).toBe("fixed_term");
    expect(paate.message).toContain("sovittava yhdessä");
  });

  it("sitoutumisaika estää irtisanomisen ja kertoo milloin se raukeaa", () => {
    const paate = evaluateNotice(
      tila({ minimumTermMonths: 12, noticeDate: "2027-05-10" }),
    );
    expect(paate.allowed).toBe(false);
    if (paate.allowed) return;
    expect(paate.reason).toBe("minimum_term");
    expect(paate.message).toContain("1.9.2027");
  });

  it("sitoutumisajan jälkeen irtisanominen onnistuu", () => {
    const paate = evaluateNotice(
      tila({ minimumTermMonths: 12, noticeDate: "2027-09-01" }),
    );
    expect(paate.allowed).toBe(true);
  });
});
