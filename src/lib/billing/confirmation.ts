/**
 * Tilausvahvistus sähköpostiin (CLAUDE.md kohta 2, "Laskutus").
 *
 * ===========================================================================
 * KUITTI ON OMA VIESTINSÄ, EI ILMOITUS
 *
 * Muut sähköpostit (`notifications/deliver.ts`) ovat push-ilmoituksen
 * varakanava: ne lähtevät vain, jos push ei mennyt perille. Maksun
 * vahvistus on toista — se on kuluttajakaupan kuitti, ja sen on mentävä
 * sähköpostiin aina, riippumatta siitä onko käyttäjällä push käytössä.
 *
 * SISÄLTÖ ON PUHDAS FUNKTIO
 *
 * Viestin teksti ei riipu tietokannasta eikä Stripestä — kaikki tieto tulee
 * webhookin tapahtumasta. Niin sisältö on testattavissa ilman että mikään
 * ulkoinen palvelu on pystyssä, samaan tapaan kuin hinnoittelusäännöt
 * (`pricing.ts`).
 * ===========================================================================
 */

import { formatPrice } from "./pricing";
import type { BillingProduct } from "./types";

export interface OrderConfirmationInput {
  product: BillingProduct;
  /** Sentteinä, verollisena — sama summa kuin Stripen kuitissa. */
  amountCents: number;
  /** Polku sovelluksessa, jota viestin linkki osoittaa. */
  path: string;
}

export interface OrderConfirmationMessage {
  title: string;
  body: string;
  path: string;
}

const PRODUCT_LABEL: Record<BillingProduct, string> = {
  tenancy_29: "Vuokrasuhteen kertamaksu",
  plus_yearly: "Plus-tilaus",
  portfolio_yearly: "Salkkutilaus",
};

const PRODUCT_DETAIL: Record<BillingProduct, string> = {
  tenancy_29: "Tämä on kertamaksu yhdestä vuokrasuhteesta. Vuokralainen ei maksa koskaan mitään.",
  plus_yearly:
    "Tilaus jatkuu vuosittain, kunnes irtisanot sen. Löydät laskut ja irtisanomisen kohdasta Laskut ja maksutapa.",
  portfolio_yearly:
    "Tilaus jatkuu vuosittain, kunnes irtisanot sen. Löydät laskut ja irtisanomisen kohdasta Laskut ja maksutapa.",
};

/** Maksun vahvistusviesti. Lähetetään aina `checkout.completed`-tapahtumasta. */
export function orderConfirmationEmail(input: OrderConfirmationInput): OrderConfirmationMessage {
  return {
    title: `Maksu vastaanotettu: ${PRODUCT_LABEL[input.product]}`,
    body: `Maksoit ${formatPrice(input.amountCents)} (${PRODUCT_LABEL[input.product]}). ${PRODUCT_DETAIL[input.product]}`,
    path: input.path,
  };
}
