/**
 * Laskutuksen mock kehitykseen ja testeihin.
 *
 * ===========================================================================
 * MOCK EI VELOITA EIKÄ TEESKENTELE VELOITTAVANSA
 *
 * Maksusivun osoite osoittaa sovelluksen omaan `/maksu/mock`-sivuun, joka
 * sanoo suoraan, ettei mitään veloitettu. Vaihtoehto — ohjata suoraan
 * `successUrl`:iin — olisi vaarallinen: kehityksessä maksupolku näyttäisi
 * toimivan täydellisesti, eikä kukaan huomaisi, ettei sitä ole koskaan
 * kokeiltu oikeasti.
 *
 * `assertRealBilling()` kaataa tuotannossa, jos avain puuttuu. Ilman sitä
 * tuotantoon voisi päätyä tila, jossa jokainen vuokrasuhde on ilmainen.
 * ===========================================================================
 */

import { randomUUID } from "node:crypto";
import type {
  ActiveSubscription,
  BillingClient,
  CompletedCheckout,
  CheckoutInput,
  CheckoutSession,
  PortalSession,
} from "./types";

export interface MockCheckout {
  input: CheckoutInput;
  sessionId: string;
}

export class BillingMockClient implements BillingClient {
  /** Testien luettavissa: mitä maksusivuja on luotu ja millä tiedoilla. */
  readonly checkouts: MockCheckout[] = [];
  readonly refunds: Array<{ paymentIntentId: string; reason: string }> = [];
  readonly quantityChanges: Array<{ subscriptionId: string; quantity: number }> = [];
  /**
   * Testit lisäävät tänne maksuja ja tilauksia, jotka "Stripessä" ovat jo
   * olemassa. Oletuksena tyhjä, jolloin kaikki toimii kuten ennenkin.
   */
  readonly completedCheckouts: Array<CompletedCheckout & { createdAt: Date }> = [];
  readonly activeSubscriptions: ActiveSubscription[] = [];

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const sessionId = `cs_mock_${randomUUID()}`;
    this.checkouts.push({ input, sessionId });

    const url = new URL(input.successUrl);
    url.searchParams.set("mock", "1");

    return {
      id: sessionId,
      /*
        Osoite vie sovelluksen omaan mock-näkymään, joka kertoo mitä
        tapahtui ja mitä EI tapahtunut. Onnistumisosoite kulkee mukana,
        jotta polun voi ajaa loppuun.
      */
      url: `/maksu/mock?istunto=${sessionId}&paluu=${encodeURIComponent(url.toString())}`,
    };
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<PortalSession> {
    return { url: `/maksu/mock?portaali=${encodeURIComponent(customerId)}&paluu=${encodeURIComponent(returnUrl)}` };
  }

  async updateSubscriptionQuantity(subscriptionId: string, quantity: number): Promise<void> {
    this.quantityChanges.push({ subscriptionId, quantity });
  }

  async refund(paymentIntentId: string, reason: string): Promise<void> {
    this.refunds.push({ paymentIntentId, reason });
  }

  async findCompletedCheckout(input: {
    metadata: Record<string, string>;
    since: Date;
  }): Promise<CompletedCheckout | null> {
    const found = this.completedCheckouts.find(
      (row) => row.createdAt >= input.since && matchesMetadata(row.metadata, input.metadata),
    );
    return found ? { id: found.id, subscriptionId: found.subscriptionId, metadata: found.metadata } : null;
  }

  async findActiveSubscription(input: {
    metadataKey: string;
    metadataValue: string;
  }): Promise<ActiveSubscription | null> {
    return this.activeSubscriptions.find((row) => row.metadata[input.metadataKey] === input.metadataValue) ?? null;
  }
}

/** Kaikki halutut avaimet löytyvät samoilla arvoilla. */
export function matchesMetadata(actual: Record<string, string>, wanted: Record<string, string>): boolean {
  return Object.entries(wanted).every(([key, value]) => actual[key] === value);
}
