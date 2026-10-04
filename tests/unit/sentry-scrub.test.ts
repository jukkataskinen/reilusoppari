import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubEvent, scrubText, scrubUrl } from "@/lib/sentry/scrub";
import { sentryOptions } from "@/lib/sentry/options";

/**
 * Sentryyn ei saa päätyä henkilötietoja eikä julkisten linkkien avaimia
 * (DECISIONS.md 2026-10-04). Nämä testit ovat se lukko: jos joku lisää
 * uuden kentän tai unohtaa reitin, tapahtuma lähtisi sellaisenaan.
 */

const TOKEN = "AbCdEf0123456789_-AbCdEf0123456789xyz";

describe("scrubUrl", () => {
  it("korvaa julkisten linkkien avaimen", () => {
    expect(scrubUrl(`https://app.reilusoppari.fi/kutsu/${TOKEN}`)).toBe(
      "https://app.reilusoppari.fi/kutsu/[token]",
    );
    expect(scrubUrl(`/todistus/lyhyt/pdf`)).toBe("/todistus/[token]/pdf");
    expect(scrubUrl(`/todistus/${TOKEN}/kysy`)).toBe("/todistus/[token]/kysy");
    expect(scrubUrl(`/suosittelu/ABC123`)).toBe("/suosittelu/[token]");
  });

  it("poistaa hakuparametrit ja #-osan", () => {
    expect(scrubUrl("/asunnot?haku=Kotikatu%201&email=a@b.fi#x")).toBe("/asunnot");
    expect(scrubUrl("https://app.reilusoppari.fi/?code=abc")).toBe("https://app.reilusoppari.fi/");
  });

  it("peittää pitkät satunnaiset polun osat muttei rivien UUID-tunnisteita", () => {
    const uuid = "4ee576fb-b08f-4580-a596-c4ab4778918b";
    expect(scrubUrl(`/vuokrasuhteet/${uuid}/katselmus`)).toBe(`/vuokrasuhteet/${uuid}/katselmus`);
    expect(scrubUrl(`/api/jokin/${TOKEN}`)).toBe("/api/jokin/[token]");
  });

  it("jättää muut kuin merkkijonot ennalleen", () => {
    expect(scrubUrl(undefined)).toBeUndefined();
    expect(scrubUrl("")).toBe("");
  });
});

describe("scrubText", () => {
  it("peittää sähköpostin ja henkilötunnuksen", () => {
    expect(scrubText("Key (email)=(matti@example.com) 131052-308T, uusi 010203A123B")).toBe(
      "Key (email)=([email]) [hetu], uusi [hetu]",
    );
  });
});

describe("scrubEvent", () => {
  const original = {
    type: undefined,
    message: "Virhe käyttäjälle matti@example.com",
    user: { id: "u1", email: "matti@example.com", ip_address: "1.2.3.4" },
    server_name: "vercel-abc",
    request: {
      url: `https://app.reilusoppari.fi/kutsu/${TOKEN}?x=1`,
      method: "GET",
      cookies: { appSession: "salainen" },
      headers: { cookie: "appSession=salainen", authorization: "Bearer x" },
      data: { hetu: "131052-308T" },
      query_string: "x=1",
      env: { REMOTE_ADDR: "1.2.3.4" },
    },
    transaction: `/todistus/${TOKEN}`,
    tags: { url: `https://app.reilusoppari.fi/kutsu/${TOKEN}`, runtime: "node" },
    exception: { values: [{ type: "Error", value: "henkilötunnus 131052-308T virheellinen" }] },
    breadcrumbs: [
      { category: "console", message: "osapuoli Matti Meikäläinen" },
      { category: "fetch", data: { url: `/api/kuitti/lue?tiedosto=${TOKEN}`, method: "POST" } },
      { category: "navigation", data: { from: `/kutsu/${TOKEN}`, to: "/vuokrasuhteet?uusi=1" } },
    ],
  } as unknown as ErrorEvent;

  const event = scrubEvent(original);

  it("poistaa käyttäjän ja pyynnön henkilötiedot", () => {
    expect(event.user).toBeUndefined();
    expect(event.server_name).toBeUndefined();
    expect(event.request).toEqual({
      url: "https://app.reilusoppari.fi/kutsu/[token]",
      method: "GET",
    });
  });

  it("siistii polut, viestit ja murut", () => {
    expect(event.transaction).toBe("/todistus/[token]");
    expect(event.tags).toEqual({ url: "https://app.reilusoppari.fi/kutsu/[token]", runtime: "node" });
    expect(event.message).toBe("Virhe käyttäjälle [email]");
    expect(event.exception?.values?.[0].value).toBe("henkilötunnus [hetu] virheellinen");
    expect(event.breadcrumbs).toHaveLength(2);
    expect(event.breadcrumbs?.[0].data).toEqual({ url: "/api/kuitti/lue", method: "POST" });
    expect(event.breadcrumbs?.[1].data).toEqual({ from: "/kutsu/[token]", to: "/vuokrasuhteet" });
  });

  it("ei muuta alkuperäistä tapahtumaa", () => {
    expect(original.user?.email).toBe("matti@example.com");
    expect(original.request?.cookies).toEqual({ appSession: "salainen" });
  });

  it("koko tapahtumassa ei ole avainta, sähköpostia eikä henkilötunnusta", () => {
    const json = JSON.stringify(event);
    expect(json).not.toContain(TOKEN);
    expect(json).not.toContain("example.com");
    expect(json).not.toContain("131052");
    expect(json).not.toContain("salainen");
  });
});

describe("sentryOptions", () => {
  it("ei lähetä henkilötietoja eikä suorituskykydataa", () => {
    const options = sentryOptions("https://k@o1.ingest.sentry.io/1", "preview");
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.environment).toBe("preview");
    expect(options.beforeSend).toBe(scrubEvent);
    expect(sentryOptions("x", undefined).environment).toBe("development");
  });
});
