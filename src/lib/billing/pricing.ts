/**
 * Hinnoittelu: mitä vuokrasuhde maksaa ja kuka maksaa (CLAUDE.md kohta 2).
 *
 * ===========================================================================
 * VUOKRALAINEN EI MAKSA KOSKAAN
 *
 * Tämä ei ole hinnoittelupäätös vaan tuotteen perusta. Vuokralainen on
 * heikompi osapuoli, ja maksumuuri hänen puolellaan tarkoittaisi, että
 * kuvien ottaminen omaksi suojaksi maksaa. Koko sovelluksessa ei ole yhtään
 * kohtaa, jossa vuokralaiselta kysyttäisiin maksua.
 *
 * ENSIMMÄINEN VUOKRASUHDE ON ILMAINEN
 *
 * Vuokranantaja näkee koko kaaren — sopimus, katselmus, allekirjoitus,
 * kuittaukset, todistus — ennen kuin maksaa mitään. Tämä on myös se, mikä
 * tekee todistuksen jakamisesta hankintakanavan (CLAUDE.md 5.10): uusi
 * vuokranantaja ohjautuu palveluun, ja hänen ensimmäinen vuokrasuhteensa on
 * yhden napin päässä.
 *
 * JÄRJESTYS ON RATKAISEVA
 *
 * Ilmainen ensimmäinen → salkku → krediitti → maksu. Jos krediitti kuluisi
 * ennen ilmaista ensimmäistä, käyttäjä menettäisi suositteluetunsa siihen,
 * mikä oli muutenkin ilmaista — ja huomaisi sen vasta kun seuraava
 * vuokrasuhde yllättäen maksaa.
 * ===========================================================================
 */

/** Miten vuokrasuhde on maksettu. Sama arvojoukko kuin `rs_tenancies.paid_via`. */
export type PaidVia = "free" | "tenancy_29" | "portfolio" | "credit";

/** Kertamaksun hinta sentteinä, sisältää ALV 25,5 %. */
export const TENANCY_PRICE_CENTS = 2900;

/** Plus-laskelma asunnolta vuodessa, sentteinä. */
export const PLUS_YEARLY_CENTS = 1200;

/** Salkkuhinta asunnolta vuodessa, sentteinä. Vähintään `PORTFOLIO_MIN_PROPERTIES`. */
export const PORTFOLIO_YEARLY_CENTS = 1500;
export const PORTFOLIO_MIN_PROPERTIES = 5;

/** ALV-kanta. Hinnat ovat verollisia: vastapuoli on kuluttaja. */
export const VAT_RATE = 0.255;

export interface PricingContext {
  /** Onko vuokranantaja jo käyttänyt ilmaisen ensimmäisen vuokrasuhteensa? */
  freeTenancyUsed: boolean;
  /** Onko asunto voimassa olevan salkkutilauksen piirissä? */
  portfolioActive: boolean;
  /** Käyttämättömiä krediittejä (suositteluista). */
  availableCredits: number;
}

export interface PriceDecision {
  paidVia: PaidVia;
  /** Sentteinä. Nolla, jos maksua ei tarvita. */
  amountCents: number;
  /** Miksi tämä hinta — näytetään käyttäjälle sellaisenaan. */
  reason: string;
}

/**
 * Mitä uusi vuokrasuhde maksaa tälle vuokranantajalle juuri nyt.
 *
 * Puhdas funktio: ei kysele tietokannasta eikä Stripeltä. Se on tarkoitus —
 * hinnoittelusäännöt ovat se osa laskutusta, joka on testattava ilman että
 * mikään ulkoinen palvelu on pystyssä.
 */
export function priceForTenancy(context: PricingContext): PriceDecision {
  if (!context.freeTenancyUsed) {
    return {
      paidVia: "free",
      amountCents: 0,
      reason: "Ensimmäinen vuokrasuhteesi on ilmainen.",
    };
  }

  if (context.portfolioActive) {
    return {
      paidVia: "portfolio",
      amountCents: 0,
      reason: "Sisältyy salkkutilaukseesi.",
    };
  }

  if (context.availableCredits > 0) {
    return {
      paidVia: "credit",
      amountCents: 0,
      reason:
        context.availableCredits === 1
          ? "Käytetään suositteluetusi. Tämän jälkeen etuja ei ole jäljellä."
          : `Käytetään yksi suosittelueduistasi. Jäljelle jää ${context.availableCredits - 1}.`,
    };
  }

  return {
    paidVia: "tenancy_29",
    amountCents: TENANCY_PRICE_CENTS,
    reason: "Kertamaksu tästä vuokrasuhteesta. Vuokralainen ei maksa mitään.",
  };
}

/** Vaatiiko päätös Stripe-maksun? */
export function requiresPayment(decision: PriceDecision): boolean {
  return decision.amountCents > 0;
}

/** Salkkutilauksen vuosihinta annetulle asuntomäärälle, sentteinä. */
export function portfolioPriceCents(properties: number): number {
  if (properties < PORTFOLIO_MIN_PROPERTIES) {
    throw new Error(
      `Salkkuhinta vaatii vähintään ${PORTFOLIO_MIN_PROPERTIES} asuntoa.`,
    );
  }
  return properties * PORTFOLIO_YEARLY_CENTS;
}

/**
 * Kannattaisiko salkkuhinta tälle käyttäjälle?
 *
 * Vertailu on rehellinen eikä myyvä: salkku kannattaa vain, jos se on
 * halvempi kuin kertamaksut ja Plus-maksut erikseen. Jos ei kannata, sitä ei
 * ehdoteta — ehdotus, joka maksaa käyttäjälle enemmän, on huono ehdotus,
 * vaikka se olisi meille parempi.
 */
export function portfolioWorthIt(input: {
  properties: number;
  /** Arvio uusista vuokrasuhteista vuodessa. */
  tenanciesPerYear: number;
  /** Montako asuntoa käyttää Plus-laskelmaa. */
  plusProperties: number;
}): boolean {
  if (input.properties < PORTFOLIO_MIN_PROPERTIES) return false;

  const separate =
    input.tenanciesPerYear * TENANCY_PRICE_CENTS + input.plusProperties * PLUS_YEARLY_CENTS;

  return portfolioPriceCents(input.properties) < separate;
}

/** `29,00 €`. Sentit näytetään aina, koska kyse on hinnasta. */
export function formatPrice(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, "0");
  return `${String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${rest} €`;
}

/**
 * ALV:n osuus verollisesta hinnasta, sentteinä.
 *
 * Pyöristys tehdään lähimpään senttiin: kuitissa lukeva ALV:n määrä on
 * summa, jonka on täsmättävä, eikä katkaisu alaspäin täsmää.
 */
export function vatShareCents(grossCents: number): number {
  return Math.round(grossCents - grossCents / (1 + VAT_RATE));
}
