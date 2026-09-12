"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { assertRealBilling, getBillingClient } from "@/lib/billing";
import { portfolioView } from "@/lib/billing/portfolio";
import { portfolioPriceCents } from "@/lib/billing/pricing";
import {
  getBillingProfile,
  getPortfolioState,
  upsertSubscription,
} from "@/lib/db/billing";

/**
 * Salkkutilauksen toiminnot (CLAUDE.md 5.9).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: kirjautunut käyttäjä, ja vain omaa tilaustaan.
 *    Käyttäjän tunniste tulee istunnosta eikä lomakkeesta.
 * 2. Henkilötieto: sähköposti kulkee Stripelle kuittia varten. Ei lokiteta.
 * 3. Syöte: ei mitään, mikä vaikuttaisi hintaan. Asuntomäärä ja hinta
 *    lasketaan palvelimella uudelleen.
 * 4. IDOR: ei kohde-id:tä lainkaan.
 * 5. Salaisuus: `STRIPE_SECRET_KEY` luetaan vain palvelimella.
 * 6. Epäonnistuminen: neutraali viesti.
 * 7. Lokitus: ei summia eikä sähköposteja.
 *
 * HINTA LASKETAAN PALVELIMELLA
 *
 * Näkymä näyttää hinnan, mutta se ei kulje lomakkeessa. Asuntomäärä luetaan
 * kannasta ja hinta lasketaan siitä — muuten summan voisi vaihtaa selaimen
 * kehitystyökaluilla.
 * ===========================================================================
 */

/*
  Toiminnot eivät ota lomakedataa, joten ne ovat tavallisia funktioita eivätkä
  `useActionState`-toimintoja. Kaikki tarvittava — asuntomäärä, tilaus,
  hinta — luetaan palvelimella; lomakkeesta tuleva luku olisi selaimen
  kertoma, ja juuri sitä ei haluta hinnoitteluun.

  Odotustila hoidetaan selaimessa `useTransition`illa.
*/
export interface PortfolioActionState {
  message?: string;
  done?: boolean;
}

const appUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.reilusoppari.fi";

/**
 * Aloittaa salkkutilauksen.
 *
 * Tilaus syntyy vasta webhookista (`subscription.updated`), ei tästä eikä
 * paluuosoitteesta: paluuosoite on pelkkä uudelleenohjaus selaimessa, ja
 * kuka tahansa voi avata sen.
 */
export async function startPortfolioAction(): Promise<PortfolioActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const state = await getPortfolioState(user.id);
  const view = portfolioView(state);

  /*
    Tilaus sallitaan vain, jos näkymä oikeasti tarjoaa sitä.

    Ilman tätä lomakkeen voisi lähettää suoraan ja tilata salkun tilanteessa,
    jossa se on käyttäjälle kalliimpi — eli juuri se, mitä vertailulla
    yritetään estää. Käyttäjä saa silti tilata sen tietoisesti: näkymä
    näyttää tarjouksen myös silloin, kun säästö on pieni.
  */
  if (view.kind === "active") {
    return { message: "Salkkutilaus on jo voimassa." };
  }
  if (view.kind === "too_few") {
    return {
      message: `Salkkuhinta vaatii vähintään ${state.properties + view.missing} asuntoa.`,
    };
  }

  assertRealBilling();

  const profile = await getBillingProfile(user.id);

  let url: string;
  try {
    const session = await getBillingClient().createCheckout({
      product: "portfolio_yearly",
      amountCents: portfolioPriceCents(state.properties),
      description: `Reilusoppari-salkku, ${state.properties} asuntoa`,
      customerId: profile.stripeCustomerId,
      email: profile.email,
      successUrl: `${appUrl()}/laskutus?tilaus=valmis`,
      cancelUrl: `${appUrl()}/laskutus?tilaus=peruttu`,
      // Ei nimiä eikä osoitteita: metadata päätyy Stripen järjestelmiin.
      metadata: { userId: user.id, kind: "portfolio_yearly" },
      /*
        Tilaus ei ole kertaluonteinen palvelu, jonka aloittaminen kuluttaisi
        peruutusoikeuden — se laskutetaan kaudittain ja sen voi irtisanoa
        asiakasportaalista. Siksi suostumusta palvelun välittömään
        aloittamiseen ei kysytä.
      */
      consentGiven: false,
    });

    url = session.url;
  } catch (err) {
    console.error("[salkku] maksusivun luonti epäonnistui:", err instanceof Error ? err.message : err);
    return { message: "Maksusivua ei voitu avata. Yritä hetken kuluttua uudelleen." };
  }

  /*
    `redirect` on try-lohkon ULKOPUOLELLA.

    Se toimii heittämällä erityisen virheen, jonka Next käsittelee. Try-lohkon
    sisällä oma `catch` nappaisi sen ja muuttaisi uudelleenohjauksen
    virheilmoitukseksi — ja maksusivu jäisi avaamatta.
  */
  redirect(url);
}

/**
 * Päivittää tilauksen kattamaan nykyisen asuntomäärän.
 *
 * Tätä EI tehdä automaattisesti asuntoa lisättäessä: se olisi veloitus, jota
 * käyttäjä ei ole hyväksynyt. Ero näytetään näkymässä ja päivitys on tämän
 * napin takana.
 */
export async function updatePortfolioQuantityAction(): Promise<PortfolioActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const state = await getPortfolioState(user.id);
  const subscription = state.subscription;

  if (!subscription || subscription.status === "canceled") {
    return { message: "Voimassa olevaa salkkutilausta ei löytynyt." };
  }

  if (subscription.quantity === state.properties) {
    return { message: "Tilaus kattaa jo kaikki asuntosi." };
  }

  assertRealBilling();

  try {
    await getBillingClient().updateSubscriptionQuantity(
      subscription.stripeSubscriptionId,
      state.properties,
    );
  } catch (err) {
    console.error("[salkku] määrän päivitys epäonnistui:", err instanceof Error ? err.message : err);
    return { message: "Päivitys ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  /*
    Oma kanta päivitetään heti eikä jäädä odottamaan webhookia.

    Stripe lähettää `subscription.updated`-tapahtuman, ja se on lopullinen
    totuus — mutta se voi tulla sekuntien päästä, ja siihen asti näkymä
    näyttäisi, ettei painallus tehnyt mitään. Webhook kirjoittaa saman arvon
    uudelleen, joten kahta totuutta ei synny.
  */
  await upsertSubscription({
    userId: user.id,
    kind: "portfolio_yearly",
    stripeSubscriptionId: subscription.stripeSubscriptionId,
    quantity: state.properties,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
  });

  revalidatePath("/laskutus");
  return { done: true };
}

/**
 * Avaa Stripen asiakasportaalin.
 *
 * Kortin vaihto, laskujen katselu ja tilauksen irtisanominen tehdään siellä.
 * Niitä ei rakenneta tänne: maksuvälineen käsittely omassa
 * käyttöliittymässä tarkoittaisi maksukorttitietojen kulkemista tämän
 * palvelun läpi, ja juuri sitä vältetään (CLAUDE.md kohta 6).
 */
export async function openPortalAction(): Promise<PortfolioActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const profile = await getBillingProfile(user.id);

  if (!profile.stripeCustomerId) {
    return { message: "Sinulla ei ole vielä laskutustietoja hallittavaksi." };
  }

  assertRealBilling();

  let url: string;
  try {
    const session = await getBillingClient().createPortalSession(
      profile.stripeCustomerId,
      `${appUrl()}/laskutus`,
    );
    url = session.url;
  } catch (err) {
    console.error("[salkku] portaalin avaus epäonnistui:", err instanceof Error ? err.message : err);
    return { message: "Asiakasportaalia ei voitu avata." };
  }

  redirect(url);
}
