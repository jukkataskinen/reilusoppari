import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkLinkRateLimit,
  clientIp,
  JAKOLINKKIRAJA,
  KUTSULINKKIRAJA,
  linkRateKey,
} from "@/lib/security/link-rate-limit";
import { windowStart } from "@/lib/security/rate-limit";
import { hasSupabaseCredentials } from "@/lib/db/supabase";
import { hasColumn } from "../migration-probe";

/**
 * Julkisten linkkien kutsuraja (migraatio 0016).
 *
 * Tärkein väite on, ettei IP-osoite päädy tauluun: avain on HMAC, joka
 * vaihtuu päivittäin. Toinen on, että raja ei estä linkkiä silloin, kun sitä
 * ei voi laskea — rikki oleva kutsulinkki olisi pahempi kuin puuttuva raja.
 */

function h(values: Record<string, string>): Pick<Headers, "get"> {
  const map = new Headers(values);
  return { get: (name: string) => map.get(name) };
}

const SECRET = "testisalaisuus-ei-oikea";
const IP = "203.0.113.7"; // dokumentaatio-osoite (RFC 5737)

describe("asiakkaan osoite", () => {
  it("x-real-ip ensin", () => {
    expect(clientIp(h({ "x-real-ip": IP, "x-forwarded-for": "198.51.100.1" }))).toBe(IP);
  });

  it("x-forwarded-for:n ensimmäinen osoite on asiakas", () => {
    expect(clientIp(h({ "x-forwarded-for": ` ${IP} , 10.0.0.1, 10.0.0.2` }))).toBe(IP);
  });

  it("ilman otsakkeita osoitetta ei ole", () => {
    expect(clientIp(h({}))).toBeNull();
    expect(clientIp(h({ "x-forwarded-for": " , " }))).toBeNull();
  });
});

describe("rajan avain", () => {
  const ikkuna = windowStart(new Date("2026-09-26T13:45:00Z"), 10);

  it("ei sisällä osoitetta", () => {
    const avain = linkRateKey(IP, ikkuna, SECRET);
    expect(avain).toMatch(/^[0-9a-f]{32}$/);
    expect(avain).not.toContain("203");
  });

  it("on sama saman päivän ikkunoissa", () => {
    const toinen = windowStart(new Date("2026-09-26T22:15:00Z"), 10);
    expect(linkRateKey(IP, ikkuna, SECRET)).toBe(linkRateKey(IP, toinen, SECRET));
  });

  it("vaihtuu päivän vaihtuessa, jottei rivejä voi yhdistää", () => {
    const huomenna = windowStart(new Date("2026-09-27T00:05:00Z"), 10);
    expect(linkRateKey(IP, ikkuna, SECRET)).not.toBe(linkRateKey(IP, huomenna, SECRET));
  });

  it("riippuu salaisuudesta", () => {
    // Ilman salaisuutta avaimen voisi kääntää kokeilemalla kaikki osoitteet.
    expect(linkRateKey(IP, ikkuna, SECRET)).not.toBe(linkRateKey(IP, ikkuna, "toinen"));
  });

  it("eri osoitteet saavat eri avaimen", () => {
    expect(linkRateKey(IP, ikkuna, SECRET)).not.toBe(linkRateKey("203.0.113.8", ikkuna, SECRET));
  });
});

describe("rajat", () => {
  it("ovat väljiä, koska mobiiliverkon osoite on jaettu", () => {
    for (const raja of [KUTSULINKKIRAJA, JAKOLINKKIRAJA]) {
      expect(raja.limit / raja.windowMinutes).toBeGreaterThanOrEqual(5);
    }
  });

  it("kutsu- ja jakolinkillä on omat laskurit", () => {
    expect(KUTSULINKKIRAJA.endpoint).not.toBe(JAKOLINKKIRAJA.endpoint);
  });
});

describe("kun rajaa ei voi laskea, linkki avautuu", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.INVITE_TOKEN_SECRET;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.INVITE_TOKEN_SECRET;
    else process.env.INVITE_TOKEN_SECRET = saved;
  });

  it("ilman osoitetta", async () => {
    process.env.INVITE_TOKEN_SECRET = SECRET;
    expect(await checkLinkRateLimit(h({}), KUTSULINKKIRAJA)).toEqual({ allowed: true });
  });

  it("ilman salaisuutta", async () => {
    delete process.env.INVITE_TOKEN_SECRET;
    expect(await checkLinkRateLimit(h({ "x-real-ip": IP }), KUTSULINKKIRAJA)).toEqual({
      allowed: true,
    });
  });
});

/*
  Laskurin kasvatus oikeaa kantaa vasten. Ohittuu näkyvästi, jos migraatio
  0016 puuttuu (tests/migration-probe.ts).
*/
const RUN = hasSupabaseCredentials() && Boolean(process.env.INVITE_TOKEN_SECRET);

describe.skipIf(!RUN)("laskuri kannassa (migraatio 0016)", () => {
  it("raja täyttyy ja vapautuu seuraavassa ikkunassa", async (ctx) => {
    if (!(await hasColumn("rs_kutsurajat_linkit", "avain"))) {
      ctx.skip();
      return;
    }
    // Keksitty osoite ja oma endpoint, jottei testi osu oikeisiin laskureihin.
    const headers = h({ "x-real-ip": `testi-${Date.now()}` });
    const rule = { endpoint: "linkki.testi", limit: 2, windowMinutes: 10 };
    const now = new Date("2026-09-26T12:00:00Z");

    expect((await checkLinkRateLimit(headers, rule, now)).allowed).toBe(true);
    expect((await checkLinkRateLimit(headers, rule, now)).allowed).toBe(true);
    expect((await checkLinkRateLimit(headers, rule, now)).allowed).toBe(false);

    const later = new Date("2026-09-26T12:10:00Z");
    expect((await checkLinkRateLimit(headers, rule, later)).allowed).toBe(true);
  });
});
