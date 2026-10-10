/**
 * Vuokrasuhteen maksu (CLAUDE.md 5.1, vaihe 5).
 *
 * ===========================================================================
 * ILMAINEN JA KREDIITTI KIRJATAAN HETI, MAKSU VASTA WEBHOOKISSA
 *
 * Kun maksettavaa ei ole, käyttöoikeus voidaan myöntää saman tien: mitään ei
 * ole odotettavissa. Kun maksettavaa on, käyttöoikeus myönnetään vasta kun
 * Stripe kertoo maksun onnistuneen — paluuosoite selaimessa ei ole todiste
 * mistään, koska sen voi avata kuka tahansa.
 *
 * HINTA LASKETAAN UUDELLEEN PALVELIMELLA
 *
 * Käyttöliittymä näyttää hinnan, mutta se ei kulje lomakkeessa. Hinta
 * lasketaan tässä uudelleen käyttäjän todellisesta tilanteesta — muuten
 * summan voisi vaihtaa selaimen kehitystyökaluilla.
 * ===========================================================================
 */

import {
  getBillingProfile,
  getTenancyBillingState,
  markTenancyPaid,
  recordWithdrawalConsent,
} from "../db/billing";
import { getTenancy } from "../db/tenancies";
import { assertRealBilling, getBillingClient } from "./index";
import { priceForTenancy, requiresPayment, type PriceDecision } from "./pricing";
import { PAYMENT_PROCESSING_MESSAGE, RECENT_CHECKOUT_MS } from "./return-state";

export type CheckoutResult =
  | { ok: true; paid: true; decision: PriceDecision }
  | { ok: true; paid: false; url: string; decision: PriceDecision }
  | { ok: false; message: string };

/** Mitä tämä vuokrasuhde maksaisi juuri nyt. Ei muuta mitään. */
export async function quoteTenancy(
  userId: string,
  tenancyId: string,
): Promise<PriceDecision | null> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy || tenancy.landlordUserId !== userId) return null;

  return priceForTenancy(await getBillingProfile(userId));
}

/**
 * Aloittaa vuokrasuhteen maksun.
 *
 * Palauttaa joko valmiin maksun (ilmainen, salkku, krediitti) tai osoitteen,
 * johon käyttäjä ohjataan maksamaan.
 */
export async function startTenancyCheckout(input: {
  userId: string;
  tenancyId: string;
  /** Kuluttajan suostumus palvelun aloittamiseen. */
  consentGiven: boolean;
  /** Sovelluksen osoite paluulinkkejä varten. */
  appUrl: string;
  now?: Date;
}): Promise<CheckoutResult> {
  const now = input.now ?? new Date();

  const tenancy = await getTenancy(input.userId, input.tenancyId);
  if (!tenancy || tenancy.landlordUserId !== input.userId) {
    return { ok: false, message: "Vuokrasuhdetta ei löytynyt." };
  }

  const state = await getTenancyBillingState(input.tenancyId);
  if (state?.paidVia) {
    return { ok: false, message: "Tämä vuokrasuhde on jo maksettu." };
  }

  const profile = await getBillingProfile(input.userId);
  const decision = priceForTenancy(profile);

  if (!requiresPayment(decision)) {
    await markTenancyPaid({
      tenancyId: input.tenancyId,
      userId: input.userId,
      paidVia: decision.paidVia,
      stripePaymentId: null,
      now,
    });

    return { ok: true, paid: true, decision };
  }

  /*
    Suostumus on ehto maksulle eikä sen jälkeinen muodollisuus.

    Kuluttajansuojalaki 6:14: peruutusoikeus raukeaa vain, jos kuluttaja on
    pyytänyt palvelun aloittamista JA saanut tiedon oikeuden raukeamisesta.
    Jos tätä ei vaadittaisi tässä, tieto tulisi vasta kuitissa — ja silloin
    oikeus ei raukeaisi lainkaan.
  */
  if (!input.consentGiven) {
    return {
      ok: false,
      message: "Hyväksy palvelun aloittaminen ennen maksua.",
    };
  }

  assertRealBilling();

  /*
    Maksettu mutta vielä kirjaamaton maksu estää uuden (Jukka 10.10.2026).
    Webhook voi viipyä hetken, ja sillä välin painettu Maksa veloittaisi
    toisen kerran. Jos Stripe ei vastaa, uutta maksua ei avata.
  */
  try {
    const recent = await getBillingClient().findCompletedCheckout({
      metadata: { tenancyId: input.tenancyId },
      since: new Date(now.getTime() - RECENT_CHECKOUT_MS),
    });
    if (recent) return { ok: false, message: PAYMENT_PROCESSING_MESSAGE };
  } catch (err) {
    console.error("[laskutus] maksun tarkistus epäonnistui:", err instanceof Error ? err.message : err);
    return { ok: false, message: "Maksun tilaa ei voitu tarkistaa. Yritä hetken kuluttua uudelleen." };
  }

  await recordWithdrawalConsent(input.tenancyId, now);

  try {
    const session = await getBillingClient().createCheckout({
      product: "tenancy_29",
      amountCents: decision.amountCents,
      description: "Reilusoppari – vuokrasuhde",
      customerId: profile.stripeCustomerId,
      email: profile.email,
      // Paluu samalle sivulle, jolla maksu aloitettiin: siellä kerrotaan tilanne.
      successUrl: `${input.appUrl}/vuokrasuhteet/${input.tenancyId}/allekirjoitus?maksu=valmis`,
      cancelUrl: `${input.appUrl}/vuokrasuhteet/${input.tenancyId}/allekirjoitus?maksu=peruttu`,
      // Ei nimiä eikä osoitteita: metadata päätyy Stripen järjestelmiin.
      metadata: { tenancyId: input.tenancyId, userId: input.userId },
      consentGiven: true,
    });

    return { ok: true, paid: false, url: session.url, decision };
  } catch (err) {
    console.error("[laskutus] maksusivun luonti epäonnistui:", err instanceof Error ? err.message : err);
    return { ok: false, message: "Maksusivua ei voitu avata. Yritä hetken kuluttua uudelleen." };
  }
}
