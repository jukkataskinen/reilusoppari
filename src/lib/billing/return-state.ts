/**
 * Mitä sivu kertoo, kun käyttäjä palaa Stripen maksusivulta (Jukka 10.10.2026).
 *
 * ===========================================================================
 * PALUUOSOITE EI MYÖNNÄ MITÄÄN
 *
 * `?plus=valmis` on pelkkä selaimen uudelleenohjaus, ja kuka tahansa voi
 * avata sen. Siksi se vain valitsee, mitä tekstiä näytetään. Se, onko maksu
 * oikeasti kirjattu, luetaan aina kannasta (webhookin kirjaama tila).
 *
 * KÄSITTELYN AIKANA EI TARJOTA UUTTA MAKSUA
 *
 * Maksu on tehty, mutta webhook voi viipyä hetken. Jos sivu näyttäisi sillä
 * välin saman maksunapin kuin ennen maksua, käyttäjä painaisi sitä — ja
 * maksaisi toiseen kertaan. Käsittelytilassa nappi piilotetaan ja sivu
 * päivittyy itse, kunnes kirjaus näkyy.
 *
 * Puhdas funktio, jotta jokainen tila voidaan testata ilman sivua.
 * ===========================================================================
 */

export type PaymentReturn = "valmis" | "peruttu";

/** Kuinka kauan maksettu maksusivu estää uuden. Webhook tulee yleensä sekunneissa. */
export const RECENT_CHECKOUT_MS = 10 * 60 * 1000;

/** Kun maksua yritetään uudelleen ennen kuin edellinen on kirjattu. */
export const PAYMENT_PROCESSING_MESSAGE =
  "Maksusi on vastaanotettu, ja sitä käsitellään. Päivitä sivu hetken kuluttua. Älä maksa uudelleen.";

/** Mitä maksettiin: teksti riippuu siitä, mitä käyttäjä oli tekemässä. */
export type PaymentReturnProduct = "plus" | "tenancy" | "portfolio";

export type PaymentReturnView =
  | { kind: "none" }
  /** Maksu on kirjattu. Käyttäjä voi jatkaa siihen, mitä oli tekemässä. */
  | { kind: "paid"; title: string; body: string | null }
  /** Maksu on kirjattu ja toiminto on jo tehty. */
  | { kind: "done"; title: string; body: string | null }
  /** Paluu onnistuneesta maksusta, mutta webhook ei ole vielä ehtinyt. */
  | { kind: "processing"; title: string; body: string }
  | { kind: "cancelled"; title: string; body: string | null };

/** Hakuparametri tilaksi. Muu kuin tunnettu arvo ohitetaan. */
export function readPaymentReturn(value: unknown): PaymentReturn | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "valmis" || first === "peruttu" ? first : null;
}

export const PROCESSING_TITLE = "Maksu on vastaanotettu, ja sitä käsitellään.";
export const PROCESSING_BODY = "Sivu päivittyy hetken kuluttua. Älä maksa uudelleen.";
/** Kun automaattinen päivitys on luovuttanut. */
export const PROCESSING_SLOW =
  "Käsittely kestää tavallista kauemmin. Päivitä sivu muutaman minuutin kuluttua. Maksua ei tarvitse tehdä uudelleen.";

/**
 * Näytettävä tila.
 *
 * - `active`: onko maksu kirjattu kantaan (Plus voimassa, vuokrasuhde
 *   maksettu, salkku voimassa).
 * - `completed`: onko se, mitä käyttäjä oli tekemässä, jo tehty
 *   (laskelma sinetöity, sopimus lähetetty).
 */
export function paymentReturnView(input: {
  product: PaymentReturnProduct;
  param: PaymentReturn | null;
  active: boolean;
  completed?: boolean;
}): PaymentReturnView {
  if (input.param === null) return { kind: "none" };

  if (input.param === "peruttu") {
    // Jos maksu on jo kirjattu (esim. vanha välilehti), peruutusviesti johtaisi harhaan.
    if (input.active) return { kind: "none" };
    return { kind: "cancelled", ...CANCELLED[input.product] };
  }

  if (!input.active) {
    return { kind: "processing", title: PROCESSING_TITLE, body: PROCESSING_BODY };
  }

  if (input.completed) return { kind: "done", ...DONE[input.product] };
  return { kind: "paid", ...PAID[input.product] };
}

const PAID: Record<PaymentReturnProduct, { title: string; body: string | null }> = {
  plus: {
    title: "Maksu vastaanotettu. Plus on käytössä tälle asunnolle.",
    body: "Viimeistele sinetöinti painamalla Sinetöi laskelma.",
  },
  tenancy: {
    title: "Maksu vastaanotettu.",
    body: "Voit nyt lähettää sopimuksen allekirjoitettavaksi.",
  },
  portfolio: {
    title: "Maksu vastaanotettu. Salkkutilaus on voimassa.",
    body: null,
  },
};

const DONE: Record<PaymentReturnProduct, { title: string; body: string | null }> = {
  plus: {
    title: "Laskelma on sinetöity.",
    body: "Voit tallentaa sen alempaa kohdasta Tallenna sinetöity.",
  },
  tenancy: {
    title: "Maksu vastaanotettu.",
    body: null,
  },
  portfolio: PAID.portfolio,
};

const CANCELLED: Record<PaymentReturnProduct, { title: string; body: string | null }> = {
  plus: {
    title: "Maksu peruttiin. Laskelmaa ei sinetöity.",
    body: "Mitään ei veloitettu. Voit yrittää uudelleen, kun haluat.",
  },
  tenancy: {
    title: "Maksu peruttiin. Sopimusta ei lähetetty allekirjoitettavaksi.",
    body: "Mitään ei veloitettu. Voit yrittää uudelleen, kun haluat.",
  },
  portfolio: {
    title: "Maksu peruttiin. Salkkutilausta ei aloitettu.",
    body: "Mitään ei veloitettu.",
  },
};
