/**
 * Laskutusliitännän rajapinta (CLAUDE.md kohta 2).
 *
 * ===========================================================================
 * MAKSUTIEDOT EIVÄT TULE TÄNNE
 *
 * Reilusoppari ei näe eikä tallenna korttinumeroita. Kaikki maksaminen
 * tapahtuu Stripen omalla sivulla (Checkout) ja tilausten hallinta Stripen
 * omassa portaalissa (Customer Portal). Tänne jää vain `stripe_customer_id`
 * ja maksun tunniste — ne eivät ole maksuvälinetietoja.
 *
 * MIKSI OMA RAJAPINTA EIKÄ STRIPEN KIRJASTO SUORAAN
 *
 * Sama syy kuin eSinetissä: testeissä ja kehityksessä on oltava mock, joka
 * ei soita mihinkään. Rajapinta on tarkoituksella kapea — vain ne neljä
 * asiaa, joita tuote tekee — jottei koodiin hiivi Stripe-riippuvuutta
 * paikkoihin, joissa sitä ei tarvita.
 * ===========================================================================
 */

/** Mitä ollaan maksamassa. Sama nimistö kuin Stripen tuotteissa. */
export type BillingProduct = "tenancy_29" | "plus_yearly" | "portfolio_yearly";

export interface CheckoutInput {
  product: BillingProduct;
  /** Sentteinä, verollisena. Salkussa riippuu asuntomäärästä. */
  amountCents: number;
  /** Kuvaus, joka näkyy Stripen sivulla ja kuitissa. */
  description: string;
  /** Olemassa oleva asiakas, jos sellainen on. */
  customerId: string | null;
  /** Sähköposti, jos asiakasta ei vielä ole. Kuitti lähtee tähän. */
  email: string;
  /** Mihin palataan onnistuneen maksun jälkeen. */
  successUrl: string;
  /** Mihin palataan, jos maksu keskeytetään. */
  cancelUrl: string;
  /**
   * Mihin maksu liittyy. Palautuu webhookissa sellaisenaan.
   *
   * Ei nimiä eikä osoitteita: metadata päätyy Stripen järjestelmiin ja
   * kuitteihin, eikä sinne kuulu enempää kuin tarvitaan maksun
   * kohdistamiseen.
   */
  metadata: Record<string, string>;
  /**
   * Kuluttajan nimenomainen suostumus palvelun aloittamiseen.
   *
   * Tallennetaan metadataan, jotta se on todennettavissa jälkikäteen samasta
   * paikasta kuin maksu (`billing/withdrawal.ts`).
   */
  consentGiven: boolean;
}

export interface CheckoutSession {
  id: string;
  /** Osoite, johon käyttäjä ohjataan maksamaan. */
  url: string;
}

export interface PortalSession {
  url: string;
}

export interface BillingClient {
  /** Luo maksusivun. Ei veloita mitään — veloitus tapahtuu Stripen sivulla. */
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  /** Asiakasportaali: tilausten ja korttien hallinta Stripen sivulla. */
  createPortalSession(customerId: string, returnUrl: string): Promise<PortalSession>;
  /** Salkkutilauksen asuntomäärän muutos. */
  updateSubscriptionQuantity(subscriptionId: string, quantity: number): Promise<void>;
  /** Maksun palautus peruutustapauksessa. */
  refund(paymentIntentId: string, reason: string): Promise<void>;
}

/** Webhookista poimittu tapahtuma siinä muodossa, jossa sovellus sen käsittelee. */
export interface BillingEvent {
  id: string;
  type:
    | "checkout.completed"
    | "subscription.updated"
    | "subscription.deleted"
    | "payment.refunded";
  /** `CheckoutInput.metadata` sellaisenaan. */
  metadata: Record<string, string>;
  customerId: string | null;
  paymentIntentId: string | null;
  subscriptionId: string | null;
  amountCents: number | null;
  /** Tilauksen määrä (asuntoja salkussa). `null`, jos tapahtuma ei ole tilaus. */
  quantity: number | null;
  /** Tilauskauden loppu ISO-muodossa. `null`, jos tapahtuma ei ole tilaus. */
  currentPeriodEnd: string | null;
}
