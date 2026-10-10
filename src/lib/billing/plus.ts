/**
 * Plus-tilauksen käyttöoikeus asunnolle (CLAUDE.md 5.7, vaihe 5).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: asunnon omistaja. Tarkistus on `requireExpenseAccess`,
 *    sama raja kuin kulujen ja verolaskelman lukemisessa.
 * 2. Henkilötieto: sähköposti kulkee Stripelle kuittia varten. Ei lokiteta.
 * 3. Syöte: asunnon id ja käyttäjän id istunnosta. Hinta lasketaan
 *    palvelimella uudelleen eikä oteta lomakkeelta.
 * 4. IDOR: asunnon id tarkistetaan ensimmäisenä tässä tiedostossa.
 * 5. Salaisuus: `STRIPE_SECRET_KEY` luetaan vain palvelimella
 *    (`getBillingClient`).
 * 6. Epäonnistuminen: neutraali viesti.
 * 7. Lokitus: ei summia eikä sähköposteja.
 *
 * TILAUS ON ASUNNON, EI KÄYTTÄJÄN
 *
 * "12 €/asunto/v" (CLAUDE.md kohta 2) on asuntokohtainen, toisin kuin
 * salkkutilaus. Plus-tilaus tallennetaan `rs_subscriptions.property_id`
 * -sarakkeeseen (migraatio 0019) sen sijaan että luotettaisiin pelkkään
 * käyttäjän tilaukseen — muuten toisen asunnon maksu näyttäisi kattavan
 * kaikki käyttäjän asunnot.
 * ===========================================================================
 */

import { requireExpenseAccess } from "../db/access";
import { getBillingProfile, getPropertySubscription, upsertSubscription } from "../db/billing";
import { assertRealBilling, getBillingClient } from "./index";
import { PAYMENT_PROCESSING_MESSAGE, RECENT_CHECKOUT_MS } from "./return-state";
import {
  priceForPlus,
  requiresPlusPayment,
  type PlusPaidVia,
  type PlusPriceDecision,
} from "./pricing";

export type PlusAccessResult =
  | { ok: true; paidVia: PlusPaidVia }
  | { ok: false; redirectUrl: string }
  | { ok: false; message: string };

async function plusDecision(
  userId: string,
  propertyId: string,
): Promise<{
  profile: Awaited<ReturnType<typeof getBillingProfile>>;
  decision: PlusPriceDecision;
}> {
  const [profile, subscription] = await Promise.all([
    getBillingProfile(userId),
    getPropertySubscription(propertyId),
  ]);

  return {
    profile,
    decision: priceForPlus({
      portfolioActive: profile.portfolioActive,
      propertySubscriptionActive: subscription?.status === "active",
    }),
  };
}

/** Mitä laskelman sinetöinti maksaisi tälle asunnolle juuri nyt. `null`, jos asuntoa ei ole. */
export async function quotePlus(
  userId: string,
  propertyId: string,
): Promise<PlusPriceDecision | null> {
  try {
    await requireExpenseAccess(userId, propertyId);
  } catch {
    return null;
  }

  const { decision } = await plusDecision(userId, propertyId);
  return decision;
}

/**
 * Varmistaa Plus-käyttöoikeuden tai aloittaa maksun.
 *
 * Käyttöoikeus myönnetään heti, jos maksua ei tarvita (salkku tai asunnolla
 * jo voimassa oleva Plus-tilaus). Muuten palautetaan osoite, johon selain
 * ohjataan: tilaus syntyy vasta webhookista (`subscription.updated`), ei
 * paluuosoitteesta — kuka tahansa voisi avata sen ilman että mitään on
 * maksettu.
 */
export async function ensurePlusAccess(input: {
  userId: string;
  propertyId: string;
  appUrl: string;
  /** Vuosi, jota käyttäjä oli sinetöimässä. Paluusivu avautuu samaan vuoteen. */
  year?: number;
  now?: Date;
}): Promise<PlusAccessResult> {
  try {
    await requireExpenseAccess(input.userId, input.propertyId);
  } catch {
    return { ok: false, message: "Asuntoa ei löytynyt." };
  }

  const { profile, decision } = await plusDecision(input.userId, input.propertyId);

  if (!requiresPlusPayment(decision)) {
    return { ok: true, paidVia: decision.paidVia };
  }

  assertRealBilling();

  /*
    ENNEN UUTTA MAKSUSIVUA KYSYTÄÄN STRIPELTÄ (Jukka 10.10.2026)

    Kanta tietää maksusta vasta, kun webhook on käsitelty. Sitä ennen
    painettu Sinetöi avaisi uuden maksusivun ja veloittaisi toisen kerran.
    Siksi Stripeltä kysytään kaksi asiaa:

    1. Onko asunnolla jo voimassa oleva Plus-tilaus? Jos on, se kirjataan
       meille ja sinetöinti jatkuu. Tieto tulee Stripeltä omalla
       salaisella avaimellamme, joten siihen voi luottaa — toisin kuin
       paluuosoitteeseen. Tämä korjaa myös tilauksen, jonka webhook jäi
       aikanaan kirjaamatta.
    2. Onko asunnolle maksettu maksusivu viimeisen kymmenen minuutin
       aikana? Silloin tilaus on vielä syntymässä, eikä uutta maksua avata.

    Jos Stripe ei vastaa, uutta maksusivua ei avata: varmuus siitä, ettei
    veloiteta kahdesti, on tärkeämpi kuin yksi epäonnistunut yritys.
  */
  const now = input.now ?? new Date();
  try {
    const client = getBillingClient();
    const existing = await client.findActiveSubscription({
      metadataKey: "propertyId",
      metadataValue: input.propertyId,
    });

    if (existing && existing.metadata.kind === "plus_yearly" && existing.metadata.userId === input.userId) {
      await upsertSubscription({
        userId: input.userId,
        kind: "plus_yearly",
        stripeSubscriptionId: existing.id,
        quantity: 1,
        status: "active",
        currentPeriodEnd: existing.currentPeriodEnd,
        propertyId: input.propertyId,
      });
      return { ok: true, paidVia: "plus_yearly" };
    }

    const recent = await client.findCompletedCheckout({
      metadata: { propertyId: input.propertyId, kind: "plus_yearly" },
      since: new Date(now.getTime() - RECENT_CHECKOUT_MS),
    });
    if (recent) return { ok: false, message: PAYMENT_PROCESSING_MESSAGE };
  } catch (err) {
    console.error("[plus] maksun tarkistus epäonnistui:", err instanceof Error ? err.message : err);
    return { ok: false, message: "Maksun tilaa ei voitu tarkistaa. Yritä hetken kuluttua uudelleen." };
  }

  const yearQuery = input.year ? `vuosi=${input.year}&` : "";

  try {
    const session = await getBillingClient().createCheckout({
      product: "plus_yearly",
      amountCents: decision.amountCents,
      description: "Reilusoppari Plus – verolaskelma",
      customerId: profile.stripeCustomerId,
      email: profile.email,
      successUrl: `${input.appUrl}/asunnot/${input.propertyId}/verolaskelma?${yearQuery}plus=valmis`,
      cancelUrl: `${input.appUrl}/asunnot/${input.propertyId}/verolaskelma?${yearQuery}plus=peruttu`,
      // Ei nimiä eikä osoitteita: metadata päätyy Stripen järjestelmiin.
      metadata: { userId: input.userId, propertyId: input.propertyId, kind: "plus_yearly" },
      /*
        Tilaus ei ole kertaluonteinen palvelu, jonka aloittaminen kuluttaisi
        peruutusoikeuden — se laskutetaan vuosittain ja sen voi irtisanoa
        asiakasportaalista (sama linjaus kuin `startPortfolioAction`issa).
      */
      consentGiven: false,
    });

    return { ok: false, redirectUrl: session.url };
  } catch (err) {
    console.error("[plus] maksusivun luonti epäonnistui:", err instanceof Error ? err.message : err);
    return { ok: false, message: "Maksusivua ei voitu avata. Yritä hetken kuluttua uudelleen." };
  }
}
