import { describe, expect, it } from "vitest";
import {
  canOpenConversation,
  canSendMessage,
  cleanMessage,
  DEFAULT_MAX_MESSAGES,
  MESSAGE_MAX_LENGTH,
  type AskerState,
  type ContactPermission,
} from "@/lib/certificates/contact";

const LUPA: ContactPermission = {
  allowed: true,
  revokedAt: null,
  maxMessages: DEFAULT_MAX_MESSAGES,
  openedCount: 0,
};

const KYSYJA: AskerState = {
  identityVerified: true,
  isOwnParty: false,
  hasOpenConversation: false,
};

describe("keskustelun avaaminen", () => {
  it("onnistuu, kun lupa on ja kysyjä on tunnistautunut", () => {
    expect(canOpenConversation(LUPA, KYSYJA)).toEqual({ allowed: true });
  });

  it("estyy ilman lupaa", () => {
    const tulos = canOpenConversation({ ...LUPA, allowed: false }, KYSYJA);
    expect(tulos.allowed).toBe(false);
    if (!tulos.allowed) expect(tulos.reason).toBe("no_permission");
  });

  it("puuttuvasta luvasta kerrotaan ENNEN tunnistautumista", () => {
    /*
      Järjestys on tässä se, mikä ratkaisee. Jos tunnistautuminen
      tarkistettaisiin ensin, ihminen tunnistautuisi pankkitunnuksilla ja
      saisi vasta sen jälkeen kuulla, ettei lupaa ole.
    */
    const tulos = canOpenConversation(
      { ...LUPA, allowed: false },
      { ...KYSYJA, identityVerified: false },
    );
    expect(tulos.allowed).toBe(false);
    if (!tulos.allowed) expect(tulos.reason).toBe("no_permission");
  });

  it("estyy peruutetulla luvalla", () => {
    const tulos = canOpenConversation(
      { ...LUPA, revokedAt: "2026-09-01T00:00:00.000Z" },
      KYSYJA,
    );
    expect(tulos.allowed).toBe(false);
    if (!tulos.allowed) expect(tulos.reason).toBe("revoked");
  });

  it("peruttu lupa estää, vaikka `allowed` olisi vielä tosi", () => {
    // Peruminen on aikaleima, ei lipun kääntö. Kumpikin tarkistetaan.
    const tulos = canOpenConversation(
      { ...LUPA, allowed: true, revokedAt: "2026-09-01T00:00:00.000Z" },
      KYSYJA,
    );
    expect(tulos.allowed).toBe(false);
  });

  it("estyy, kun raja on täynnä", () => {
    const tulos = canOpenConversation(
      { ...LUPA, openedCount: DEFAULT_MAX_MESSAGES },
      KYSYJA,
    );
    expect(tulos.allowed).toBe(false);
    if (!tulos.allowed) expect(tulos.reason).toBe("limit_reached");
  });

  it("estyy oman vuokrasuhteen osapuolelta", () => {
    const tulos = canOpenConversation(LUPA, { ...KYSYJA, isOwnParty: true });
    expect(tulos.allowed).toBe(false);
    if (!tulos.allowed) expect(tulos.reason).toBe("own_certificate");
  });

  it("estyy, jos keskustelu on jo avattu", () => {
    const tulos = canOpenConversation(LUPA, { ...KYSYJA, hasOpenConversation: true });
    expect(tulos.allowed).toBe(false);
    if (!tulos.allowed) expect(tulos.reason).toBe("already_open");
  });

  it("vaatii vahvan tunnistautumisen", () => {
    const tulos = canOpenConversation(LUPA, { ...KYSYJA, identityVerified: false });
    expect(tulos.allowed).toBe(false);
    if (!tulos.allowed) {
      expect(tulos.reason).toBe("not_identified");
      // Syy sanotaan ääneen: kyse on toisen ihmisen tiedoista.
      expect(tulos.message).toContain("toisen ihmisen");
    }
  });
});

describe("viestin lähetys", () => {
  it("onnistuu avoimessa keskustelussa", () => {
    expect(canSendMessage({ closedAt: null, isParticipant: true })).toEqual({ allowed: true });
  });

  it("estyy suljetussa keskustelussa", () => {
    const tulos = canSendMessage({ closedAt: "2026-09-01T00:00:00.000Z", isParticipant: true });
    expect(tulos.allowed).toBe(false);
  });

  it("estyy ulkopuoliselta", () => {
    const tulos = canSendMessage({ closedAt: null, isParticipant: false });
    expect(tulos.allowed).toBe(false);
  });
});

describe("viestin siivous", () => {
  it("hylkää tyhjän", () => {
    expect(cleanMessage("   ")).toBeNull();
    expect(cleanMessage("")).toBeNull();
  });

  it("katkaisee pitkän", () => {
    const pitka = "a".repeat(MESSAGE_MAX_LENGTH + 500);
    expect(cleanMessage(pitka)?.length).toBe(MESSAGE_MAX_LENGTH);
  });

  it("poistaa ylimääräiset välit reunoilta", () => {
    expect(cleanMessage("  moi  ")).toBe("moi");
  });
});
