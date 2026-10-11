import { afterEach, describe, expect, it, vi } from "vitest";
import { hasEmailCredentials, sendEmail } from "@/lib/notifications/email";

/**
 * Sähköposti varakanavana (CLAUDE.md kohta 2).
 *
 * Jukan havainto 10.10.2026: kutsun sähköposti ei lähtenyt, ja virhe jäi
 * ilman syytä lokissa (`BLOCKERS.md`). Testit vahtivat, että epäonnistunut
 * lähetys kertoo Resendin virheen nimen, mutta ei vastaanottajaa.
 */

const message = {
  to: "vuokralainen@example.invalid",
  title: "Otsikko",
  body: "Viesti",
  path: "/vuokrasuhteet/1",
};

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("hasEmailCredentials", () => {
  it("vaatii RESEND_API_KEY:n", () => {
    delete process.env.RESEND_API_KEY;
    expect(hasEmailCredentials()).toBe(false);
    process.env.RESEND_API_KEY = "avain";
    expect(hasEmailCredentials()).toBe(true);
  });
});

describe("sendEmail", () => {
  it("ei lähetä eikä kaada kutsujaa, jos avain puuttuu", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(await sendEmail(message)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("palauttaa true ja lähettää onnistuneesti", async () => {
    process.env.RESEND_API_KEY = "avain";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 })),
    );

    expect(await sendEmail(message)).toBe(true);
  });

  it("epäonnistuessa lokittaa virhekoodin ja Resendin virheen nimen, ei vastaanottajaa", async () => {
    process.env.RESEND_API_KEY = "avain";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ statusCode: 422, name: "validation_error" }), {
            status: 422,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await sendEmail(message)).toBe(false);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls[0].join(" ");
    expect(logged).toContain("422");
    expect(logged).toContain("validation_error");
    expect(logged).not.toContain(message.to);
  });

  it("epäonnistuu siististi, jos virhevastaus ei ole JSON:ia", async () => {
    process.env.RESEND_API_KEY = "avain";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("palvelin ei vastaa", { status: 502 })));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await sendEmail(message)).toBe(false);
    expect(errorSpy.mock.calls[0].join(" ")).toContain("502");
  });
});
