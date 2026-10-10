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

  it("tilauksen metadata kopioidaan myös tilaukselle", async () => {
    // Ilman tätä tilaustapahtuma tulisi tyhjällä metadatalla, eikä Plus
    // tietäisi, mitä asuntoa se koskee.
    const bodies = captureBody();
    await new StripeHttpClient("sk_test_x").createCheckout({
      ...base,
      product: "plus_yearly",
      metadata: { propertyId: "asunto-1", userId: "u1", kind: "plus_yearly" },
    } as never);
    expect(bodies[0].get("subscription_data[metadata][propertyId]")).toBe("asunto-1");
    expect(bodies[0].get("metadata[propertyId]")).toBe("asunto-1");
  });
});

/*
  Toisen veloituksen esto (Jukka 10.10.2026): ennen uutta maksusivua
  Stripeltä kysytään, onko maksu jo tehty.
*/
function stubResponses(responses: unknown[]) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const body = responses.shift() ?? { data: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return urls;
}

describe("maksettu maksusivu", () => {
  it("löytää maksun metadatan perusteella ja hakee vain aikaikkunasta", async () => {
    const urls = stubResponses([
      {
        data: [
          { id: "cs_muu", subscription: "sub_muu", metadata: { propertyId: "toinen", kind: "plus_yearly" } },
          { id: "cs_oikea", subscription: "sub_oikea", metadata: { propertyId: "asunto-1", kind: "plus_yearly" } },
        ],
        has_more: false,
      },
    ]);

    const since = new Date("2026-10-10T10:00:00.000Z");
    const found = await new StripeHttpClient("sk_test_x").findCompletedCheckout({
      metadata: { propertyId: "asunto-1", kind: "plus_yearly" },
      since,
    });

    expect(found).toEqual({
      id: "cs_oikea",
      subscriptionId: "sub_oikea",
      metadata: { propertyId: "asunto-1", kind: "plus_yearly" },
    });
    const query = new URL(urls[0]).searchParams;
    expect(query.get("status")).toBe("complete");
    expect(query.get("created[gte]")).toBe(String(since.getTime() / 1000));
  });

  it("selaa seuraavan sivun, jos ensimmäisellä ei ollut", async () => {
    const urls = stubResponses([
      { data: [{ id: "cs_1", metadata: {} }], has_more: true },
      { data: [{ id: "cs_2", metadata: { tenancyId: "v1" } }], has_more: false },
    ]);

    const found = await new StripeHttpClient("sk_test_x").findCompletedCheckout({
      metadata: { tenancyId: "v1" },
      since: new Date(),
    });

    expect(found?.id).toBe("cs_2");
    expect(new URL(urls[1]).searchParams.get("starting_after")).toBe("cs_1");
  });

  it("palauttaa null, kun maksua ei ole", async () => {
    stubResponses([{ data: [], has_more: false }]);
    const found = await new StripeHttpClient("sk_test_x").findCompletedCheckout({
      metadata: { tenancyId: "v1" },
      since: new Date(),
    });
    expect(found).toBeNull();
  });
});

describe("voimassa oleva tilaus", () => {
  it("hakee asunnon tilauksen Stripen haulla", async () => {
    const urls = stubResponses([
      {
        data: [
          {
            id: "sub_1",
            metadata: { propertyId: "asunto-1", userId: "u1", kind: "plus_yearly" },
            items: { data: [{ current_period_end: 1791676800 }] },
          },
        ],
      },
    ]);

    const found = await new StripeHttpClient("sk_test_x").findActiveSubscription({
      metadataKey: "propertyId",
      metadataValue: "asunto-1",
    });

    expect(found?.id).toBe("sub_1");
    expect(found?.currentPeriodEnd).toBe(new Date(1791676800 * 1000).toISOString());
    expect(new URL(urls[0]).searchParams.get("query")).toBe(
      "status:'active' AND metadata['propertyId']:'asunto-1'",
    );
  });

  it("ei päästä lainausmerkkiä hakukyselyyn", async () => {
    const urls = stubResponses([]);
    const found = await new StripeHttpClient("sk_test_x").findActiveSubscription({
      metadataKey: "propertyId",
      metadataValue: "x' OR status:'canceled",
    });
    expect(found).toBeNull();
    expect(urls).toHaveLength(0);
  });
});
