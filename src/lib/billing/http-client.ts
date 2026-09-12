/**
 * Stripe-rajapinta suoraan REST:n yli.
 *
 * ===========================================================================
 * MIKSI EI `stripe`-KIRJASTOA
 *
 * Tuote tarvitsee Stripestä neljä asiaa: maksusivun, asiakasportaalin,
 * tilauksen määrän muutoksen ja palautuksen. Kirjasto toisi mukanaan koko
 * rajapinnan ja oman versiosyklinsä sitä varten. Nämä neljä ovat yksittäisiä
 * POST-kutsuja, ja webhookin allekirjoitus on HMAC-SHA256 — sama ratkaisu
 * kuin eSinetti-clientissä ja samasta syystä.
 *
 * LOMAKEKOODAUS, EI JSON
 *
 * Stripen rajapinta ottaa vastaan `application/x-www-form-urlencoded`, ja
 * sisäkkäiset rakenteet menevät hakasulkeilla: `metadata[tenancyId]=…`.
 * Siksi `encode` kirjoittaa ne käsin.
 *
 * IDEMPOTENSSI
 *
 * Jokaisessa kutsussa on `Idempotency-Key`. Ilman sitä verkkokatkos maksun
 * luonnin aikana voisi tuottaa kaksi maksusivua samasta vuokrasuhteesta —
 * ja pahimmillaan kaksi veloitusta.
 * ===========================================================================
 */

import { randomUUID } from "node:crypto";
import type {
  BillingClient,
  CheckoutInput,
  CheckoutSession,
  PortalSession,
} from "./types";

const API = "https://api.stripe.com/v1";

/** Tilaustuotteet ovat toistuvia, kertamaksu ei. */
const RECURRING: Record<CheckoutInput["product"], boolean> = {
  tenancy_29: false,
  plus_yearly: true,
  portfolio_yearly: true,
};

export class StripeHttpClient implements BillingClient {
  constructor(private readonly secretKey: string) {}

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const recurring = RECURRING[input.product];

    const fields: Record<string, string> = {
      mode: recurring ? "subscription" : "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][unit_amount]": String(input.amountCents),
      "line_items[0][price_data][product_data][name]": input.description,
      // Kuluttajakauppa: kuitti sähköpostiin ilman että sitä tarvitsee pyytää.
      locale: "fi",
    };

    if (recurring) {
      fields["line_items[0][price_data][recurring][interval]"] = "year";
    }

    if (input.customerId) {
      fields.customer = input.customerId;
    } else {
      fields.customer_email = input.email;
      // Asiakas luodaan maksun yhteydessä, jotta portaali toimii myöhemmin.
      fields.customer_creation = recurring ? "always" : "always";
    }

    /*
      Suostumus tallennetaan metadataan.

      Peruutusoikeuden raukeaminen on juridisesti merkityksellinen tosiasia,
      ja se on voitava todentaa jälkikäteen samasta paikasta kuin maksu —
      ei pelkästään omasta tietokannasta, jota me itse hallinnoimme.
    */
    const metadata = { ...input.metadata, consent: input.consentGiven ? "1" : "0" };
    for (const [key, value] of Object.entries(metadata)) {
      fields[`metadata[${key}]`] = value;
    }
    if (!recurring) {
      for (const [key, value] of Object.entries(metadata)) {
        fields[`payment_intent_data[metadata][${key}]`] = value;
      }
    }

    const session = await this.post<{ id: string; url: string | null }>(
      "/checkout/sessions",
      fields,
    );

    if (!session.url) throw new Error("Stripe ei palauttanut maksusivun osoitetta.");
    return { id: session.id, url: session.url };
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<PortalSession> {
    const session = await this.post<{ url: string }>("/billing_portal/sessions", {
      customer: customerId,
      return_url: returnUrl,
      locale: "fi",
    });

    return { url: session.url };
  }

  async updateSubscriptionQuantity(subscriptionId: string, quantity: number): Promise<void> {
    /*
      Tilausrivin id on haettava ennen päivitystä: Stripe ei päivitä määrää
      tilauksen id:llä vaan rivin id:llä. Yksi ylimääräinen kutsu, mutta
      vaihtoehto olisi tallentaa rivin id meille — ja silloin se voisi
      vanhentua ilman että kukaan huomaa.
    */
    const subscription = await this.get<{ items: { data: Array<{ id: string }> } }>(
      `/subscriptions/${subscriptionId}`,
    );

    const item = subscription.items.data[0];
    if (!item) throw new Error("Tilauksella ei ole rivejä.");

    await this.post(`/subscriptions/${subscriptionId}`, {
      "items[0][id]": item.id,
      "items[0][quantity]": String(quantity),
      // Erotus veloitetaan tai hyvitetään heti, jottei asuntomäärän muutos
      // jää roikkumaan seuraavaan vuosilaskuun asti.
      proration_behavior: "create_prorations",
    });
  }

  async refund(paymentIntentId: string, reason: string): Promise<void> {
    await this.post("/refunds", {
      payment_intent: paymentIntentId,
      "metadata[reason]": reason.slice(0, 200),
    });
  }

  /* ---------------------------------------------------------------------- */

  private async post<T>(path: string, fields: Record<string, string>): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": randomUUID(),
      },
      body: encode(fields),
    });
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();

    if (!response.ok) {
      /*
        Stripen virheviesti EI mene lokiin sellaisenaan: se voi sisältää
        asiakkaan sähköpostin tai nimen. Lokiin jää tyyppi ja koodi, jotka
        riittävät vian selvittämiseen.
      */
      let code = "tuntematon";
      try {
        const parsed = JSON.parse(text) as { error?: { code?: string; type?: string } };
        code = parsed.error?.code ?? parsed.error?.type ?? "tuntematon";
      } catch {
        // Vastaus ei ollut JSON:ia. Koodi jää tuntemattomaksi.
      }

      console.error(`[stripe] ${init.method} ${path} epäonnistui: ${response.status} ${code}`);
      throw new Error("Maksupalvelu ei vastannut odotetusti.");
    }

    return JSON.parse(text) as T;
  }
}

/** `a=1&b[c]=2`. Hakasulkeet kuuluvat Stripen muotoon eikä niitä koodata pois. */
function encode(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}
