import { afterEach, describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, createNonce } from "@/lib/security/csp";

/**
 * CSP:n testit.
 *
 * Nämä testaavat nimenomaan sitä, mitä policyssä EI saa olla. Yksi
 * `'unsafe-inline'` skriptiosiossa tekee koko otsikosta koristeen, eikä sitä
 * huomaisi mistään — sivu toimisi edelleen.
 */

const ORIGINAL_SUPABASE_URL = process.env.SUPABASE_URL;

function parse(csp: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const part of csp.split(";").map((p) => p.trim())) {
    if (!part) continue;
    const [name, ...values] = part.split(/\s+/);
    result[name] = values;
  }
  return result;
}

afterEach(() => {
  if (ORIGINAL_SUPABASE_URL === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = ORIGINAL_SUPABASE_URL;
});

describe("CSP tuotannossa", () => {
  const csp = buildContentSecurityPolicy("TESTINONCE", false);
  const directives = parse(csp);

  it("ei salli inline-skriptejä eikä evalia", () => {
    expect(directives["script-src"]).not.toContain("'unsafe-inline'");
    expect(directives["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("sitoo skriptit nonceen ja strict-dynamiciin", () => {
    expect(directives["script-src"]).toContain("'nonce-TESTINONCE'");
    expect(directives["script-src"]).toContain("'strict-dynamic'");
  });

  it("estää upottamisen, base-tagin ja pluginit", () => {
    expect(directives["frame-ancestors"]).toEqual(["'none'"]);
    expect(directives["base-uri"]).toEqual(["'none'"]);
    expect(directives["object-src"]).toEqual(["'none'"]);
  });

  it("rajaa lomakelähetykset omaan alkuperään", () => {
    // Estää sen, että injektoitu lomake lähettäisi vuokrasuhteen tiedot muualle.
    expect(directives["form-action"]).toEqual(["'self'"]);
  });

  it("pakottaa https:n", () => {
    expect(csp).toContain("upgrade-insecure-requests");
  });
});

describe("CSP kehityksessä", () => {
  it("sallii evalin ja websocketin, koska Next.js tarvitsee ne", () => {
    const directives = parse(buildContentSecurityPolicy("N", true));
    expect(directives["script-src"]).toContain("'unsafe-eval'");
    expect(directives["connect-src"]).toContain("ws:");
  });

  it("ei pakota https:ää", () => {
    expect(buildContentSecurityPolicy("N", true)).not.toContain("upgrade-insecure-requests");
  });
});

describe("Supabase-alkuperä", () => {
  it("lisätään kuviin ja yhteyksiin, kun se on määritelty", () => {
    process.env.SUPABASE_URL = "https://abcdefgh.supabase.co";
    const directives = parse(buildContentSecurityPolicy("N", false));

    // Vain alkuperä, ei polkua: allekirjoitetun URL:in polku ei kuulu otsikkoon.
    expect(directives["img-src"]).toContain("https://abcdefgh.supabase.co");
    expect(directives["connect-src"]).toContain("https://abcdefgh.supabase.co");
  });

  it("puuttuva tai rikkinäinen arvo ei kaada policya", () => {
    process.env.SUPABASE_URL = "ei-ole-url";
    const directives = parse(buildContentSecurityPolicy("N", false));
    expect(directives["img-src"]).toEqual(["'self'", "blob:", "data:"]);

    delete process.env.SUPABASE_URL;
    expect(parse(buildContentSecurityPolicy("N", false))["connect-src"]).toEqual(["'self'"]);
  });
});

describe("nonce", () => {
  it("on eri joka kerta ja riittävän pitkä", () => {
    const values = new Set(Array.from({ length: 50 }, () => createNonce()));
    expect(values.size).toBe(50);
    // 16 tavua base64:na on 24 merkkiä.
    expect([...values][0]).toHaveLength(24);
  });
});
