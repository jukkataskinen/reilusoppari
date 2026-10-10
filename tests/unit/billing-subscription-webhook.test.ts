import { describe, expect, it } from "vitest";
import { parseBillingEvent, subscriptionChangeFromEvent } from "@/lib/billing";

/*
  Plus-maksu tilausmuodossa (Jukka 10.10.2026): maksu meni läpi Stripen
  testitilassa, mutta Plus ei tullut voimaan. Rungot ovat Stripen
  todellisten tapahtumien muotoisia (lyhennettyinä), jotta testi kaatuu, jos
  jokin kenttä luetaan väärästä paikasta.
*/
const PLUS_METADATA = {
  userId: "kayttaja-1",
  propertyId: "asunto-1",
  kind: "plus_yearly",
  consent: "0",
};

function checkoutTilaus(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "evt_1QplusCheckout",
    object: "event",
    api_version: "2025-03-31.basil",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_a1PlusMaksu",
        object: "checkout.session",
        mode: "subscription",
        status: "complete",
        payment_status: "paid",
        amount_total: 1200,
        currency: "eur",
        customer: "cus_PlusAsiakas",
        subscription: "sub_PlusTilaus",
        // Tilausmuodossa maksusivulla ei ole maksuaikomusta.
        payment_intent: null,
        invoice: "in_PlusLasku",
        metadata: PLUS_METADATA,
        ...overrides,
      },
    },
  });
}

function tilausTapahtuma(
  type: string,
  status: string,
  metadata: Record<string, string> = PLUS_METADATA,
): string {
  return JSON.stringify({
    id: `evt_${type}_${status}`,
    object: "event",
    type,
    data: {
      object: {
        id: "sub_PlusTilaus",
        object: "subscription",
        status,
        customer: "cus_PlusAsiakas",
        metadata,
        items: {
          object: "list",
          data: [
            {
              id: "si_PlusRivi",
              object: "subscription_item",
              quantity: 1,
              current_period_end: 1791676800,
            },
          ],
        },
      },
    },
  });
}

describe("Plus-tilauksen kirjaus webhookista", () => {
  it("maksettu tilausmaksusivu kirjaa Plussan voimaan heti", () => {
    const event = parseBillingEvent(checkoutTilaus());
    expect(event?.mode).toBe("subscription");
    expect(event?.paymentIntentId).toBeNull();
    expect(event?.subscriptionId).toBe("sub_PlusTilaus");

    expect(subscriptionChangeFromEvent(event!)).toEqual({
      write: "insert_if_missing",
      userId: "kayttaja-1",
      kind: "plus_yearly",
      stripeSubscriptionId: "sub_PlusTilaus",
      quantity: 1,
      status: "active",
      currentPeriodEnd: null,
      propertyId: "asunto-1",
    });
  });

  it("maksamaton maksusivu ei kirjaa mitään", () => {
    const event = parseBillingEvent(checkoutTilaus({ payment_status: "unpaid" }));
    expect(subscriptionChangeFromEvent(event!)).toBeNull();
  });

  it("vuokrasuhteen kertamaksu ei ole tilaus", () => {
    const event = parseBillingEvent(
      checkoutTilaus({
        mode: "payment",
        subscription: null,
        payment_intent: "pi_1",
        metadata: { tenancyId: "v1", userId: "kayttaja-1", consent: "1" },
      }),
    );
    expect(subscriptionChangeFromEvent(event!)).toBeNull();
  });

  it("salkkua ei kirjata maksusivusta, koska asuntomäärä on vain tilauksessa", () => {
    const event = parseBillingEvent(
      checkoutTilaus({ metadata: { userId: "kayttaja-1", kind: "portfolio_yearly", consent: "0" } }),
    );
    expect(subscriptionChangeFromEvent(event!)).toBeNull();
  });

  it("uusi tilaus (created) kirjataan, ei vain päivitys", () => {
    const event = parseBillingEvent(tilausTapahtuma("customer.subscription.created", "active"));
    expect(event?.type).toBe("subscription.updated");

    const change = subscriptionChangeFromEvent(event!);
    expect(change?.write).toBe("upsert");
    expect(change?.status).toBe("active");
    expect(change?.propertyId).toBe("asunto-1");
    expect(change?.currentPeriodEnd).toBe(new Date(1791676800 * 1000).toISOString());
  });

  it("kesken oleva tilaus ei anna käyttöoikeutta", () => {
    const event = parseBillingEvent(tilausTapahtuma("customer.subscription.created", "incomplete"));
    expect(subscriptionChangeFromEvent(event!)).toBeNull();
  });

  it("erääntynyt tilaus kirjataan erääntyneeksi eikä voimassa olevaksi", () => {
    const event = parseBillingEvent(tilausTapahtuma("customer.subscription.updated", "past_due"));
    expect(subscriptionChangeFromEvent(event!)?.status).toBe("past_due");
  });

  it("salkun tilaus kirjataan käyttäjälle ilman asuntoa", () => {
    const event = parseBillingEvent(
      tilausTapahtuma("customer.subscription.created", "active", {
        userId: "kayttaja-1",
        kind: "portfolio_yearly",
      }),
    );
    const change = subscriptionChangeFromEvent(event!);
    expect(change?.kind).toBe("portfolio_yearly");
    expect(change?.propertyId).toBeNull();
  });

  it("tilaus ilman käyttäjää ohitetaan", () => {
    const event = parseBillingEvent(tilausTapahtuma("customer.subscription.updated", "active", {}));
    expect(subscriptionChangeFromEvent(event!)).toBeNull();
  });
});
