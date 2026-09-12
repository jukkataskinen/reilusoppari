/**
 * Salkkutilaus (CLAUDE.md 5.9).
 *
 * ===========================================================================
 * SALKKUA EI TARJOTA, JOS SE ON KÄYTTÄJÄLLE KALLIIMPI
 *
 * Vertailu tehdään käyttäjän TOTEUTUNEELLA käytöllä: montako vuokrasuhdetta
 * hän on tehnyt viimeisen vuoden aikana ja monestako asunnosta hän on
 * tulostanut verolaskelman. Jos salkku ei ole halvempi, sitä ei ehdoteta —
 * ehdotus, joka maksaa käyttäjälle enemmän, on huono ehdotus, vaikka se
 * olisi meille parempi.
 *
 * Luvut myös NÄYTETÄÄN. Ilman niitä vertailu olisi väite, jonka voi vain
 * uskoa tai olla uskomatta; lukujen kanssa sen voi tarkistaa ja olla eri
 * mieltä. Käyttäjä saa tilata salkun siitä huolimatta, jos hän tietää
 * suunnitelmistaan jotain, mitä historia ei kerro.
 *
 * ASUNTOMÄÄRÄN MUUTOS KYSYTÄÄN, EI TEHDÄ VAIETEN
 *
 * Salkun hinta riippuu asuntojen määrästä. Kun asuntoja tulee lisää,
 * tilauksen määrää EI päivitetä automaattisesti: se olisi veloitus, jota
 * käyttäjä ei ole hyväksynyt. Ero näytetään ja päivitys on yhden napin
 * takana.
 * ===========================================================================
 */

import {
  PLUS_YEARLY_CENTS,
  PORTFOLIO_MIN_PROPERTIES,
  PORTFOLIO_YEARLY_CENTS,
  portfolioPriceCents,
  TENANCY_PRICE_CENTS,
} from "./pricing";

export interface PortfolioSubscription {
  /** Montako asuntoa tilaus kattaa. */
  quantity: number;
  status: "active" | "past_due" | "canceled";
  /** Kauden loppu ISO-muodossa, jos tiedossa. */
  currentPeriodEnd: string | null;
}

export interface PortfolioState {
  /** Asuntoja juuri nyt. */
  properties: number;
  /** Vuokrasuhteita viimeisen 12 kuukauden aikana. */
  tenanciesLastYear: number;
  /** Asuntoja, joista on tulostettu verolaskelma viimeisen vuoden aikana. */
  plusProperties: number;
  subscription: PortfolioSubscription | null;
}

/**
 * Mitä erikseen maksaminen maksaisi vuodessa.
 *
 * Kertamaksut vuokrasuhteista ja Plus-maksut niistä asunnoista, joista
 * laskelma on tulostettu. Arvio perustuu toteutuneeseen vuoteen — se on
 * paras käytettävissä oleva ennuste seuraavasta.
 */
export function separateCostCents(state: PortfolioState): number {
  return (
    state.tenanciesLastYear * TENANCY_PRICE_CENTS + state.plusProperties * PLUS_YEARLY_CENTS
  );
}

export type PortfolioView =
  | { kind: "too_few"; properties: number; missing: number }
  | {
      kind: "not_worth_it";
      properties: number;
      portfolioCents: number;
      separateCents: number;
    }
  | {
      kind: "offer";
      properties: number;
      portfolioCents: number;
      separateCents: number;
      savingCents: number;
    }
  | {
      kind: "active";
      properties: number;
      quantity: number;
      /** Kattaako tilaus kaikki asunnot? */
      covered: boolean;
      priceCents: number;
      currentPeriodEnd: string | null;
      pastDue: boolean;
    };

/**
 * Mitä laskutusnäkymässä näytetään.
 *
 * Puhdas funktio: kaikki tieto tulee parametreina. Juuri tämä päätös on se,
 * joka on testattava ilman tietokantaa — väärin päin menevä vertailu
 * ehdottaisi käyttäjälle kalliimpaa vaihtoehtoa.
 */
export function portfolioView(state: PortfolioState): PortfolioView {
  const { subscription } = state;

  /*
    Voimassa oleva tilaus näytetään aina, vaikka asuntoja olisi alle viisi.

    Tilaus on sopimus, joka jatkuu kunnes se irtisanotaan. Sen piilottaminen
    siksi, että asuntoja on myyty, jättäisi käyttäjän maksamaan jotain, mitä
    hän ei näe missään.
  */
  if (subscription && subscription.status !== "canceled") {
    return {
      kind: "active",
      properties: state.properties,
      quantity: subscription.quantity,
      covered: subscription.quantity >= state.properties,
      // Hinta on määrä kertaa asuntohinta; `portfolioPriceCents` ei kelpaa
      // tähän, koska se vaatii viittä asuntoa eikä tilauksen määrä ole
      // sama asia kuin nykyinen asuntomäärä.
      priceCents: subscription.quantity * PORTFOLIO_YEARLY_CENTS,
      currentPeriodEnd: subscription.currentPeriodEnd,
      pastDue: subscription.status === "past_due",
    };
  }

  if (state.properties < PORTFOLIO_MIN_PROPERTIES) {
    return {
      kind: "too_few",
      properties: state.properties,
      missing: PORTFOLIO_MIN_PROPERTIES - state.properties,
    };
  }

  const portfolioCents = portfolioPriceCents(state.properties);
  const separateCents = separateCostCents(state);

  if (portfolioCents >= separateCents) {
    return { kind: "not_worth_it", properties: state.properties, portfolioCents, separateCents };
  }

  return {
    kind: "offer",
    properties: state.properties,
    portfolioCents,
    separateCents,
    savingCents: separateCents - portfolioCents,
  };
}
