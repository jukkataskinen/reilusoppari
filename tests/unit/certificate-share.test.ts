import { describe, expect, it } from "vitest";
import {
  createShareToken,
  hashShareToken,
  isShareExpired,
  isShareTokenShaped,
  shareTokenMatches,
  SHARE_TTL_DAYS,
  shareUrl,
} from "@/lib/certificates/share";

process.env.SHARE_TOKEN_SECRET ??= "testisalaisuus-ei-oikea";

describe("jakolinkin tunniste", () => {
  it("on 256 bittiä satunnaista", () => {
    const a = createShareToken();
    const b = createShareToken();

    expect(a.token).toMatch(/^[0-9a-f]{64}$/);
    expect(a.token).not.toBe(b.token);
  });

  it("tallennetaan vain tiivisteenä", () => {
    // Tietokantavedoksesta ei pääse kenenkään todistukseen.
    const share = createShareToken();
    expect(share.tokenHash).not.toContain(share.token);
    expect(share.tokenHash).toBe(hashShareToken(share.token));
  });

  it("on voimassa 30 päivää", () => {
    const nyt = new Date("2026-09-12T10:00:00.000Z");
    const share = createShareToken(nyt);

    expect(new Date(share.expiresAt).getTime() - nyt.getTime()).toBe(
      SHARE_TTL_DAYS * 86_400_000,
    );
  });

  it("tunnistaa väärän muodon ennen kyselyä", () => {
    // Mielivaltainen syöte ei päädy tietokantaan asti.
    expect(isShareTokenShaped("a".repeat(64))).toBe(true);
    expect(isShareTokenShaped("A".repeat(64))).toBe(false);
    expect(isShareTokenShaped("a".repeat(63))).toBe(false);
    expect(isShareTokenShaped("")).toBe(false);
  });

  it("vertailu hylkää väärän tunnisteen", () => {
    const share = createShareToken();

    expect(shareTokenMatches(share.token, share.tokenHash)).toBe(true);
    expect(shareTokenMatches("b".repeat(64), share.tokenHash)).toBe(false);
    expect(shareTokenMatches("roska", share.tokenHash)).toBe(false);
  });
});

describe("voimassaolo", () => {
  const nyt = new Date("2026-09-12T10:00:00.000Z");

  it("vanhentunut ei kelpaa", () => {
    expect(isShareExpired("2026-09-11T10:00:00.000Z", null, nyt)).toBe(true);
    expect(isShareExpired("2026-09-13T10:00:00.000Z", null, nyt)).toBe(false);
  });

  it("mitätöity ei kelpaa, vaikka olisi voimassa", () => {
    expect(isShareExpired("2026-10-13T10:00:00.000Z", "2026-09-12T09:00:00.000Z", nyt)).toBe(
      true,
    );
  });
});

describe("jaettava osoite", () => {
  it("osoittaa julkiselle todistussivulle", () => {
    expect(shareUrl("https://app.reilusoppari.fi", "a".repeat(64))).toBe(
      `https://app.reilusoppari.fi/todistus/${"a".repeat(64)}`,
    );
  });
});
