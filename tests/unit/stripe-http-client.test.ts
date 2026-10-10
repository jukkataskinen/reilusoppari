import { afterEach, describe, expect, it, vi } from "vitest";
import { StripeHttpClient } from "@/lib/billing/http-client";

/*
  Stripe hylkää tilauksen maksusivun, jos pyynnössä on `customer_creation`
  (sallittu vain kertamaksussa). Plus-maksu kaatui siihen 10.10.2026.
*/
function captureBody() {
  const bodies: URLSearchParams[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(new URLSearchParams(init.body));
      return new Response(JSON.stringify({ id: "cs_test", url: "https://checkout.stripe.com/x" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return bodies;
}

const base = {
  amountCents: 1200,
  description: "Plus",
  successUrl: "https://app.reilusoppari.fi/ok",
  cancelUrl: "https://app.reilusoppari.fi/peru",
  email: "vuokranantaja@example.test",
  consentGiven: true,
  metadata: { kind: "plus" },
};

afterEach(() => vi.unstubAllGlobals());

describe("Stripen maksusivu", () => {
  it("tilaus ei lähetä customer_creation-kenttää", async () => {
    const bodies = captureBody();
    await new StripeHttpClient("sk_test_x").createCheckout({ ...base, product: "plus_yearly" } as never);
    expect(bodies[0].get("mode")).toBe("subscription");
    expect(bodies[0].has("customer_creation")).toBe(false);
  });

  it("kertamaksu luo asiakkaan", async () => {
    const bodies = captureBody();
    await new StripeHttpClient("sk_test_x").createCheckout({ ...base, product: "tenancy_29" } as never);
    expect(bodies[0].get("mode")).toBe("payment");
    expect(bodies[0].get("customer_creation")).toBe("always");
  });
});
