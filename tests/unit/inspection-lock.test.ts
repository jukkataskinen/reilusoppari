import { describe, expect, it } from "vitest";
import {
  canLockInspection,
  lockAvailableAt,
  TENANT_GRACE_HOURS,
  type LockState,
} from "@/lib/inspection/lock";
import {
  findRoomBySlug,
  inspectionRooms,
  mergeRooms,
  normalizeRoomName,
  PHOTO_GUIDANCE,
  roomSlug,
} from "@/lib/inspection/rooms";

const NYT = new Date("2026-09-12T12:00:00.000Z");

const tila = (yli: Partial<LockState> = {}): LockState => ({
  isLandlord: true,
  status: "open",
  photoCount: 3,
  tenantFirstSeenAt: "2026-09-10T12:00:00.000Z",
  tenantReadyAt: null,
  tenantJoined: true,
  now: NYT,
  ...yli,
});

describe("katselmuksen lukitus", () => {
  it("onnistuu kun vuokralaisella on ollut aikaa", () => {
    expect(canLockInspection(tila())).toEqual({ allowed: true });
  });

  it("onnistuu heti kun vuokralainen on merkinnyt olevansa valmis", () => {
    const juuriNyt = tila({
      tenantFirstSeenAt: "2026-09-12T11:55:00.000Z",
      tenantReadyAt: "2026-09-12T11:58:00.000Z",
    });
    expect(canLockInspection(juuriNyt).allowed).toBe(true);
  });

  it("estyy ennen kuin vuokralaisella on ollut aikaa", () => {
    /*
      Tämä on koko säännön ydin. Ilman sitä vuokranantaja voisi kuvata
      asunnon itse ja lukita sen ennen kuin vuokralainen ehtii paikalle.
      Pöytäkirja näyttäisi yhteiseltä olematta sitä.
    */
    const paate = canLockInspection(tila({ tenantFirstSeenAt: "2026-09-12T06:00:00.000Z" }));

    expect(paate.allowed).toBe(false);
    if (paate.allowed) return;
    expect(paate.reason).toBe("tenant_has_not_had_time");
    expect(paate.message).toContain("24 tuntia");
  });

  it("estyy jos vuokralainen ei ole avannut katselmusta lainkaan", () => {
    // Laskuri alkaa vasta kun hän on nähnyt näkymän — muuten 24 tuntia
    // kuluisi umpeen ilman että hän tietää katselmuksesta mitään.
    const paate = canLockInspection(tila({ tenantFirstSeenAt: null }));
    expect(paate.allowed).toBe(false);
    if (!paate.allowed) expect(paate.reason).toBe("tenant_has_not_had_time");
  });

  it("estyy jos vuokralainen ei ole vielä liittynyt", () => {
    const paate = canLockInspection(tila({ tenantJoined: false, tenantFirstSeenAt: null }));
    expect(paate.allowed).toBe(false);
    if (!paate.allowed) expect(paate.reason).toBe("tenant_not_joined");
  });

  it("estyy vuokralaiselta", () => {
    const paate = canLockInspection(tila({ isLandlord: false }));
    expect(paate.allowed).toBe(false);
    if (!paate.allowed) expect(paate.reason).toBe("not_landlord");
  });

  it("estyy jos kuvia ei ole", () => {
    // Tyhjä pöytäkirja ei todista mitään mutta näyttää asiakirjalta.
    const paate = canLockInspection(tila({ photoCount: 0 }));
    expect(paate.allowed).toBe(false);
    if (!paate.allowed) expect(paate.reason).toBe("no_photos");
  });

  it("estyy jos katselmus on jo lukittu", () => {
    const paate = canLockInspection(tila({ status: "locked" }));
    expect(paate.allowed).toBe(false);
    if (!paate.allowed) expect(paate.reason).toBe("already_locked");
  });

  it("raja on tasan 24 tuntia", () => {
    const alku = new Date("2026-09-12T00:00:00.000Z");
    const juuriAlle = tila({
      tenantFirstSeenAt: alku.toISOString(),
      now: new Date(alku.getTime() + TENANT_GRACE_HOURS * 3600_000 - 1000),
    });
    const tasan = tila({
      tenantFirstSeenAt: alku.toISOString(),
      now: new Date(alku.getTime() + TENANT_GRACE_HOURS * 3600_000),
    });

    expect(canLockInspection(juuriAlle).allowed).toBe(false);
    expect(canLockInspection(tasan).allowed).toBe(true);
  });

  it("kertoo milloin lukitus on mahdollinen", () => {
    const hetki = lockAvailableAt(tila({ tenantFirstSeenAt: "2026-09-12T06:00:00.000Z" }));
    expect(hetki?.toISOString()).toBe("2026-09-13T06:00:00.000Z");

    // Valmiiksi merkitylle ei ole odotusaikaa.
    expect(lockAvailableAt(tila({ tenantReadyAt: "2026-09-12T07:00:00.000Z" }))).toBeNull();
  });
});

describe("huoneluettelo", () => {
  it("on kulkureitti asunnon läpi", () => {
    const huoneet = inspectionRooms("kerrostalo", 2).map((room) => room.name);

    expect(huoneet[0]).toBe("Eteinen");
    expect(huoneet).toContain("Keittiö");
    expect(huoneet).toContain("Kylpyhuone");
    expect(huoneet).toContain("Makuuhuone");
    // Yleiset viimeisenä: avaimet ja mittarilukemat eivät ole huone.
    expect(huoneet[huoneet.length - 1]).toBe("Yleiset");
  });

  it("antaa vihjeitä muttei vaatimuksia", () => {
    const keittio = inspectionRooms("kerrostalo", 2).find((room) => room.name === "Keittiö");

    // Vihjeet ovat tekstiä, joita ei voi kuitata tehdyiksi.
    expect(keittio?.hints).toContain("Liesi ja uuni");
    expect(keittio?.hints.length).toBeGreaterThan(3);
  });

  it("ohje kertoo sekä tekemisen että syyn", () => {
    // Syy on tärkeämpi: se on ainoa, minkä vuoksi kukaan jaksaa kuvata.
    expect(PHOTO_GUIDANCE).toContain("yleiskuva");
    expect(PHOTO_GUIDANCE).toContain("riitojen välttämiseksi");
  });

  it("omakotitalolla on ulkotilat ja sauna", () => {
    const huoneet = inspectionRooms("omakotitalo", 4).map((room) => room.name);
    expect(huoneet).toContain("Sauna");
    expect(huoneet).toContain("Ulkotilat");
  });

  it("yksiössä huone on molempia", () => {
    const huoneet = inspectionRooms("kerrostalo", 1).map((room) => room.name);
    expect(huoneet).toContain("Olohuone / makuuhuone");
  });
});

describe("itse lisätty huone", () => {
  it("tulee listalle kuvaamisen perusteella", () => {
    const oletukset = inspectionRooms("kerrostalo", 1);
    const yhdistetty = mergeRooms(oletukset, ["Vaatehuone"]);

    expect(yhdistetty.map((room) => room.name)).toContain("Vaatehuone");
    expect(yhdistetty.length).toBe(oletukset.length + 1);
  });

  it("ei kahdenna jo tunnettua huonetta", () => {
    const oletukset = inspectionRooms("kerrostalo", 1);
    const yhdistetty = mergeRooms(oletukset, ["keittiö", "KEITTIÖ", "Keittiö"]);

    expect(yhdistetty.length).toBe(oletukset.length);
  });

  it("sivuuttaa tyhjät nimet", () => {
    const oletukset = inspectionRooms("kerrostalo", 1);
    expect(mergeRooms(oletukset, ["", "   "]).length).toBe(oletukset.length);
  });

  it("siistii kirjoitetun nimen", () => {
    expect(normalizeRoomName("  Vaate  huone ")).toBe("Vaate huone");
    expect(normalizeRoomName("   ")).toBeNull();
    expect(normalizeRoomName("x".repeat(80))?.length).toBe(60);
  });
});

describe("huoneen tunniste osoitteessa", () => {
  it("selviää kauttaviivasta ja ääkkösistä", () => {
    // "Olohuone / makuuhuone" katkaisisi polun, ja ääkköset näkyisivät
    // osoiterivillä prosenttikoodeina.
    expect(roomSlug("Olohuone / makuuhuone")).toBe("olohuone-makuuhuone");
    expect(roomSlug("Kylpyhuone")).toBe("kylpyhuone");
    expect(roomSlug("Sähkötila ja varasto")).toBe("sahkotila-ja-varasto");
  });

  it("löytää huoneen takaisin", () => {
    const huoneet = inspectionRooms("kerrostalo", 1);
    const huone = findRoomBySlug(huoneet, "olohuone-makuuhuone");

    expect(huone?.name).toBe("Olohuone / makuuhuone");
    expect(findRoomBySlug(huoneet, "ei-ole")).toBeNull();
  });

  it("löytää myös itse lisätyn huoneen", () => {
    const huoneet = mergeRooms(inspectionRooms("kerrostalo", 1), ["Vaatehuone"]);
    expect(findRoomBySlug(huoneet, "vaatehuone")?.name).toBe("Vaatehuone");
  });
});
