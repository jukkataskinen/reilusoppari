import { beforeAll, describe, expect, it } from "vitest";
import {
  createInvite,
  hashInviteToken,
  inviteTokenMatches,
  inviteUrl,
  isInviteExpired,
  isInviteTokenShaped,
  INVITE_TTL_DAYS,
} from "@/lib/tenancy/invite";

/**
 * Kutsulinkin tunniste.
 *
 * Kutsulinkki on ainoa tie vuokrasuhteeseen ennen kirjautumista, joten
 * arvattava tai tietokannasta luettava tunniste tarkoittaisi pääsyä toisen
 * ihmisen kotiin liittyviin tietoihin. Testit kohdistuvat siihen, mitä ei
 * saa tapahtua.
 */

beforeAll(() => {
  process.env.INVITE_TOKEN_SECRET ??= "testisalaisuus-ei-oikea";
});

describe("tunnisteen luonti", () => {
  it("on 64 heksamerkkiä ja eri joka kerta", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => createInvite().token));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(isInviteTokenShaped(token)).toBe(true);
  });

  it("tallennettava arvo ei ole tunniste itse", () => {
    // Jos tietokantaan menisi selkokielinen tunniste, tietokannan vuoto
    // antaisi pääsyn jokaiseen avoimeen kutsuun.
    const invite = createInvite();
    expect(invite.tokenHash).not.toBe(invite.token);
    expect(invite.tokenHash).toHaveLength(64);
  });

  it("vanhenee 30 päivässä", () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    const invite = createInvite(now);
    const expected = new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000).toISOString();
    expect(invite.expiresAt).toBe(expected);
  });
});

describe("tunnisteen tarkistus", () => {
  it("hyväksyy oikean ja hylkää väärän", () => {
    const invite = createInvite();
    expect(inviteTokenMatches(invite.token, invite.tokenHash)).toBe(true);
    expect(inviteTokenMatches(createInvite().token, invite.tokenHash)).toBe(false);
  });

  it("hylkää muodoltaan kelvottoman ilman tietokantakyselyä", () => {
    for (const token of ["", "abc", "z".repeat(64), "A".repeat(64), "0".repeat(63)]) {
      expect(isInviteTokenShaped(token), token).toBe(false);
      expect(inviteTokenMatches(token, hashInviteToken("x"))).toBe(false);
    }
  });

  it("hylkää roskatiivisteen kaatumatta", () => {
    const invite = createInvite();
    expect(inviteTokenMatches(invite.token, "ei-heksaa")).toBe(false);
    expect(inviteTokenMatches(invite.token, "")).toBe(false);
  });

  it("sama tunniste tuottaa aina saman tiivisteen", () => {
    const token = createInvite().token;
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
  });
});

describe("vanheneminen", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");

  it("tunnistaa vanhentuneen", () => {
    expect(isInviteExpired("2026-09-14T12:00:00.000Z", now)).toBe(true);
    expect(isInviteExpired("2026-09-16T12:00:00.000Z", now)).toBe(false);
  });

  it("puuttuva tai kelvoton aika on vanhentunut", () => {
    // Varman päälle: jos aikaa ei ole, kutsu ei ole voimassa.
    expect(isInviteExpired(null, now)).toBe(true);
    expect(isInviteExpired("ei-aika", now)).toBe(true);
  });
});

describe("kutsulinkki", () => {
  it("rakentuu ilman kaksoiskauttaviivaa", () => {
    expect(inviteUrl("https://app.reilusoppari.fi", "abc")).toBe(
      "https://app.reilusoppari.fi/kutsu/abc",
    );
    expect(inviteUrl("https://app.reilusoppari.fi/", "abc")).toBe(
      "https://app.reilusoppari.fi/kutsu/abc",
    );
  });
});
