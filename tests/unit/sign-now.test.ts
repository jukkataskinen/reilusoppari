import { afterEach, describe, expect, it } from "vitest";
import {
  esinettiOrigin,
  fetchSigningLink,
  pendingSignerFor,
  signingLinksEnabled,
  toEmbedSigningUrl,
} from "@/lib/esinetti/signing-link";
import { isCompletionMessage } from "@/lib/esinetti/embed-message";
import type { RoundSignerState } from "@/lib/esinetti";

/**
 * "Allekirjoita nyt" (Jukan havainto 10.10.2026): vuokranantajan oma
 * allekirjoituslinkki eSinetiltä ja sen avaaminen upotuksena.
 */

const ORIGIN = "https://app.esinetti.fi";

function signer(overrides: Partial<RoundSignerState>): RoundSignerState {
  return {
    id: "s1",
    name: "Matti Virtanen",
    email: "matti@example.invalid",
    roleLabel: "Vuokranantaja",
    authLevel: "strong",
    position: 1,
    status: "pending",
    openedAt: null,
    identifiedAt: null,
    signedAt: null,
    declinedAt: null,
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("käyttöönotto", () => {
  it("pois päältä ilman lippua ja ilman oikeaa eSinettiä", () => {
    delete process.env.ESINETTI_SIGNING_LINKS;
    process.env.ESINETTI_API_KEY = "avain";
    expect(signingLinksEnabled()).toBe(false);

    process.env.ESINETTI_SIGNING_LINKS = "1";
    delete process.env.ESINETTI_API_KEY;
    expect(signingLinksEnabled()).toBe(false);

    process.env.ESINETTI_API_KEY = "avain";
    expect(signingLinksEnabled()).toBe(true);
  });

  it("origin tulee rajapinnan osoitteesta", () => {
    expect(esinettiOrigin("https://app.esinetti.fi/api/v1")).toBe(ORIGIN);
    expect(esinettiOrigin("https://testi.esinetti.fi/api/v1")).toBe("https://testi.esinetti.fi");
    expect(esinettiOrigin("")).toBe(ORIGIN);
  });
});

describe("upotettava osoite", () => {
  it("lisää embed=1 eSinetin allekirjoitussivulle", () => {
    expect(toEmbedSigningUrl(`${ORIGIN}/sign/abc123`, ORIGIN)).toBe(`${ORIGIN}/sign/abc123?embed=1`);
    // Pelkkä polku tulkitaan eSinetin originissa.
    expect(toEmbedSigningUrl("/sign/abc123", ORIGIN)).toBe(`${ORIGIN}/sign/abc123?embed=1`);
  });

  it("hylkää muun kuin eSinetin oman allekirjoitussivun", () => {
    expect(toEmbedSigningUrl("https://huijaus.example/sign/abc", ORIGIN)).toBeNull();
    expect(toEmbedSigningUrl(`${ORIGIN}/dashboard`, ORIGIN)).toBeNull();
    expect(toEmbedSigningUrl(`${ORIGIN}/sign/abc/../../admin`, ORIGIN)).toBeNull();
    expect(toEmbedSigningUrl("javascript:alert(1)", ORIGIN)).toBeNull();
  });
});

describe("vuokranantajan allekirjoittaja", () => {
  it("löytyy sähköpostilla kirjainkoosta riippumatta", () => {
    const signers = [
      signer({ id: "t1", email: "maija@example.invalid", roleLabel: "Vuokralainen" }),
      signer({ id: "l1", email: "Matti@Example.invalid" }),
    ];
    expect(pendingSignerFor(signers, "matti@example.invalid")?.id).toBe("l1");
  });

  it("ei kelpaa, jos on jo allekirjoittanut tai kieltäytynyt", () => {
    expect(pendingSignerFor([signer({ status: "signed" })], "matti@example.invalid")).toBeNull();
    expect(pendingSignerFor([signer({ status: "declined" })], "matti@example.invalid")).toBeNull();
    expect(pendingSignerFor([signer({ status: "opened" })], "matti@example.invalid")?.id).toBe("s1");
  });

  it("ei arvaa ilman sähköpostia", () => {
    expect(pendingSignerFor([signer({})], null)).toBeNull();
  });
});

describe("linkin haku eSinetiltä", () => {
  const options = (fetchImpl: typeof fetch) => ({
    apiUrl: "https://app.esinetti.fi/api/v1",
    apiKey: "avain",
    fetchImpl,
  });

  it("kutsuu kierroksen allekirjoittajan päätepistettä avaimella", async () => {
    let called: { url: string; init?: RequestInit } | null = null;
    const fake = (async (url: string, init?: RequestInit) => {
      called = { url, init };
      return jsonResponse(200, { data: { url: `${ORIGIN}/sign/xyz` } });
    }) as unknown as typeof fetch;

    expect(await fetchSigningLink("round_1", "s1", options(fake))).toEqual({
      ok: true,
      url: `${ORIGIN}/sign/xyz`,
    });
    expect(called!.url).toBe("https://app.esinetti.fi/api/v1/rounds/round_1/signers/s1/signing-link");
    expect(called!.init?.method).toBe("POST");
    expect((called!.init?.headers as Record<string, string>).authorization).toBe("Bearer avain");
  });

  it("hyväksyy myös pelkän tunnisteen", async () => {
    const fake = (async () => jsonResponse(200, { data: { token: "xyz" } })) as unknown as typeof fetch;
    expect(await fetchSigningLink("r", "s", options(fake))).toEqual({ ok: true, url: "/sign/xyz" });
  });

  it("puuttuva päätepiste on 'ei käytettävissä', ei virhe", async () => {
    const fake = (async () => jsonResponse(404, { error: { code: "not_found" } })) as unknown as typeof fetch;
    expect(await fetchSigningLink("r", "s", options(fake))).toEqual({ ok: false, reason: "unavailable" });
  });

  it("palvelinvirhe ja verkkovirhe eivät kaada", async () => {
    const error500 = (async () => jsonResponse(500, {})) as unknown as typeof fetch;
    const network = (async () => {
      throw new Error("verkko");
    }) as unknown as typeof fetch;
    expect(await fetchSigningLink("r", "s", options(error500))).toEqual({ ok: false, reason: "error" });
    expect(await fetchSigningLink("r", "s", options(network))).toEqual({ ok: false, reason: "error" });
  });

  it("ilman avainta ei kutsuta mitään", async () => {
    let calls = 0;
    const fake = (async () => {
      calls += 1;
      return jsonResponse(200, {});
    }) as unknown as typeof fetch;
    expect(await fetchSigningLink("r", "s", { apiKey: "", fetchImpl: fake })).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(calls).toBe(0);
  });
});

describe("valmistumisviesti", () => {
  it("hyväksytään vain eSinetin originista ja oikealla tyypillä", () => {
    expect(isCompletionMessage(ORIGIN, { type: "esinetti:completed", roundId: "r" }, ORIGIN)).toBe(true);
    expect(isCompletionMessage("https://huijaus.example", { type: "esinetti:completed" }, ORIGIN)).toBe(
      false,
    );
    expect(isCompletionMessage(ORIGIN, { type: "jotain" }, ORIGIN)).toBe(false);
    expect(isCompletionMessage(ORIGIN, "esinetti:completed", ORIGIN)).toBe(false);
    expect(isCompletionMessage(ORIGIN, null, ORIGIN)).toBe(false);
  });
});
