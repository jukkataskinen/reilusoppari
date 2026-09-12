import { NextResponse } from "next/server";
import { parseBillingEvent, verifyWebhookSignature } from "@/lib/billing";
import {
  cancelSubscription,
  markTenancyPaid,
  recordEvent,
  saveCustomerId,
  upsertSubscription,
} from "@/lib/db/billing";

/**
 * Stripen webhook (CLAUDE.md kohta 2 ja 6).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: vain Stripe. Todennus on allekirjoitettu otsake,
 *    ei IP-osoite eikä salainen polku.
 * 2. Henkilötieto: sähköposti ja nimi voivat olla rungossa. Ei lokiteta.
 * 3. Syöte: raaka runko luetaan merkkijonona ennen jäsentämistä —
 *    allekirjoitus lasketaan siitä, mitä lähetettiin.
 * 4. IDOR: vuokrasuhde tulee metadatasta, jonka me itse asetimme
 *    maksusivua luodessa. Tuntematon tai puuttuva ohitetaan.
 * 5. Salaisuus: `STRIPE_WEBHOOK_SECRET`. Ilman sitä kaikki hylätään —
 *    tyhjä arvo EI tarkoita "tarkistus ohi".
 * 6. Epäonnistuminen: 401 väärästä allekirjoituksesta, 400 rikkinäisestä
 *    rungosta. Muuten 200, myös silloin kun tapahtuma ohitetaan.
 * 7. Lokitus: tapahtuman tunniste ja tyyppi, ei sisältöä eikä summia.
 *
 * TÄMÄ REITTI MYÖNTÄÄ KÄYTTÖOIKEUDEN
 *
 * Maksettu vuokrasuhde merkitään maksetuksi TÄÄLLÄ eikä paluuosoitteessa.
 * Paluuosoite on pelkkä uudelleenohjaus selaimessa: kuka tahansa voi avata
 * sen ilman että mitään on maksettu.
 *
 * KÄSITTELY ON KERTALUONTEINEN
 *
 * Stripe toistaa tapahtuman, jos vastaus ei tule perille. `recordEvent`
 * kirjaa tunnisteen uniikkiin sarakkeeseen ja palauttaa `false`, jos se on
 * jo käsitelty. Ilman sitä toistettu tapahtuma voisi kuluttaa krediitin
 * kahdesti.
 * ===========================================================================
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";

  const payload = await request.text();
  const header = request.headers.get("stripe-signature") ?? "";

  if (!secret || !verifyWebhookSignature({ payload, header, secret })) {
    // Ei kerrota kumpi meni pieleen: puuttuva salaisuus vai väärä
    // allekirjoitus. Kumpikin on kutsujalle sama asia.
    return new NextResponse("Allekirjoitus ei kelpaa.", { status: 401 });
  }

  const event = parseBillingEvent(payload);
  if (!event) {
    // Joko rikkinäinen runko tai tapahtuma, joka ei kuulu meille. Kumpaankin
    // 200: 400 saisi Stripen yrittämään uudelleen loputtomiin.
    return NextResponse.json({ ok: true, ignored: true });
  }

  let fresh: boolean;
  try {
    fresh = await recordEvent(event.id, event.type);
  } catch {
    // Tietokanta ei vastannut. 500 saa Stripen yrittämään uudelleen, mikä on
    // oikea lopputulos: tapahtumaa ei ole käsitelty.
    return new NextResponse("Tapahtumaa ei voitu kirjata.", { status: 500 });
  }

  if (!fresh) return NextResponse.json({ ok: true, duplicate: true });

  try {
    await handle(event);
  } catch (err) {
    console.error(
      `[stripe] tapahtuman ${event.type} käsittely epäonnistui:`,
      err instanceof Error ? err.message : err,
    );
    return new NextResponse("Käsittely epäonnistui.", { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

type BillingEvent = NonNullable<ReturnType<typeof parseBillingEvent>>;

async function handle(event: BillingEvent): Promise<void> {
  const now = new Date();

  if (event.type === "checkout.completed") {
    const { tenancyId, userId } = event.metadata;

    // Asiakastunniste talteen, jotta portaali ja tilaukset toimivat myöhemmin.
    if (userId && event.customerId) await saveCustomerId(userId, event.customerId);

    if (tenancyId && userId) {
      await markTenancyPaid({
        tenancyId,
        userId,
        paidVia: "tenancy_29",
        stripePaymentId: event.paymentIntentId,
        now,
      });
    }

    /*
      Tilaus (salkku tai Plus) tulee erillisenä `subscription.updated`
      -tapahtumana, jossa on määrä ja kausi. Sitä ei yritetä päätellä tästä:
      checkout kertoo vain, että jotain ostettiin.
    */
    return;
  }

  if (event.type === "subscription.updated") {
    const { userId, kind } = event.metadata;
    if (!userId || !event.subscriptionId) return;

    await upsertSubscription({
      userId,
      kind: kind === "plus_yearly" ? "plus_yearly" : "portfolio_yearly",
      stripeSubscriptionId: event.subscriptionId,
      quantity: Number(event.metadata.quantity) || 1,
      status: "active",
      currentPeriodEnd: event.metadata.currentPeriodEnd || null,
    });
    return;
  }

  if (event.type === "subscription.deleted") {
    if (event.subscriptionId) await cancelSubscription(event.subscriptionId);
    return;
  }

  /*
    Palautus: maksu on peruttu, mutta vuokrasuhteen tilaa EI palauteta
    maksamattomaksi tässä. Palautus tehdään vain peruutuspyynnöstä, ja
    peruutus purkaa vuokrasuhteen omassa polussaan — jos tila nollattaisiin
    täältä, Stripessä tehty osittainen hyvitys sulkisi vuokrasuhteen, joka
    on jo allekirjoitettu.
  */
}
