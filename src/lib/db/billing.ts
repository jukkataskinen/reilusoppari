/**
 * Laskutuksen tila tietokannassa (CLAUDE.md kohta 2, vaihe 5).
 *
 * ===========================================================================
 * KÄYTTÖOIKEUS MYÖNNETÄÄN WEBHOOKISSA, EI PALUUOSOITTEESSA
 *
 * Onnistumisosoite (`success_url`) on pelkkä uudelleenohjaus selaimessa.
 * Kuka tahansa voi avata sen ilman että mitään on maksettu. Jos
 * käyttöoikeus myönnettäisiin siinä, vuokrasuhde olisi ilmainen jokaiselle,
 * joka arvaa osoitteen.
 *
 * Siksi `markTenancyPaid` kutsutaan VAIN webhookista, jonka allekirjoitus on
 * tarkistettu. Paluusivu vain kertoo käyttäjälle, että maksu on käsittelyssä.
 *
 * IDEMPOTENSSI ON PAKOLLINEN
 *
 * Stripe toistaa tapahtuman, jos vastaus ei tule perille. `recordEvent`
 * palauttaa `false`, jos tapahtuma on jo käsitelty — ilman sitä toistettu
 * webhook voisi antaa saman krediitin kahdesti tai kuluttaa kaksi.
 * ===========================================================================
 */

import { getServiceClient } from "./supabase";
import type { PaidVia } from "../billing/pricing";

/**
 * Kirjaa webhook-tapahtuman käsitellyksi.
 *
 * `true` = uusi tapahtuma, käsittele. `false` = tämä on jo käsitelty, älä
 * tee mitään. Ehto on tietokannan uniikki indeksi eikä koodin tarkistus:
 * kaksi rinnakkaista webhookia voi olla käsittelyssä samaan aikaan, ja
 * "katso ensin, kirjoita sitten" häviäisi siinä kilvassa.
 */
export async function recordEvent(eventId: string, eventType: string): Promise<boolean> {
  const { error } = await getServiceClient()
    .from("rs_billing_events")
    .insert({ stripe_event_id: eventId, event_type: eventType });

  if (!error) return true;

  // 23505 = unique_violation. Tapahtuma on jo käsitelty.
  if (error.code === "23505") return false;

  console.error("[laskutus] tapahtuman kirjaus epäonnistui:", error.message);
  throw new Error("Tapahtuman kirjaus epäonnistui.");
}

export interface BillingProfile {
  freeTenancyUsed: boolean;
  stripeCustomerId: string | null;
  email: string;
  availableCredits: number;
  portfolioActive: boolean;
}

/** Kaikki, mitä hinnoittelupäätös tarvitsee, yhdellä kutsulla. */
export async function getBillingProfile(userId: string): Promise<BillingProfile> {
  const supabase = getServiceClient();

  const [{ data: user }, { data: credits }, { data: subscriptions }] = await Promise.all([
    supabase
      .from("rs_users")
      .select("free_tenancy_used, stripe_customer_id, email")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("rs_credits").select("id").eq("user_id", userId).is("used_at", null),
    supabase
      .from("rs_subscriptions")
      .select("kind, status")
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);

  const row = user as
    | { free_tenancy_used: boolean; stripe_customer_id: string | null; email: string }
    | null;

  return {
    freeTenancyUsed: row?.free_tenancy_used ?? false,
    stripeCustomerId: row?.stripe_customer_id ?? null,
    email: row?.email ?? "",
    availableCredits: (credits ?? []).length,
    portfolioActive: ((subscriptions ?? []) as Array<{ kind: string }>).some(
      (item) => item.kind === "portfolio_yearly",
    ),
  };
}

/**
 * Merkitsee vuokrasuhteen maksetuksi ja kuluttaa sen, mitä maksuun käytettiin.
 *
 * Kaikki kolme kirjausta — vuokrasuhde, ilmainen ensimmäinen ja krediitti —
 * kuuluvat yhteen: jos vuokrasuhde merkitään maksetuksi mutta krediittiä ei
 * kuluteta, sama krediitti kelpaa seuraavaankin.
 *
 * Ne tehdään silti peräkkäin eikä transaktiossa: PostgREST ei tarjoa
 * transaktiota useaan tauluun. Järjestys on siksi valittu niin, että
 * keskeytyminen on käyttäjän eduksi eikä tappioksi — krediitti kulutetaan
 * ENSIN, ja jos vuokrasuhteen merkintä jää tekemättä, käyttäjä on menettänyt
 * krediitin mutta webhookin toisto korjaa tilanteen. Päinvastainen järjestys
 * antaisi ilmaisen vuokrasuhteen joka kerta.
 */
export async function markTenancyPaid(input: {
  tenancyId: string;
  userId: string;
  paidVia: PaidVia;
  stripePaymentId: string | null;
  now: Date;
}): Promise<void> {
  const supabase = getServiceClient();
  const timestamp = input.now.toISOString();

  if (input.paidVia === "credit") {
    const { data: credit } = await supabase
      .from("rs_credits")
      .select("id")
      .eq("user_id", input.userId)
      .is("used_at", null)
      .limit(1)
      .maybeSingle();

    const row = credit as { id: string } | null;
    if (row) {
      await supabase
        .from("rs_credits")
        .update({ used_at: timestamp, used_on_tenancy_id: input.tenancyId, updated_at: timestamp })
        .eq("id", row.id)
        // Ehto uudelleen: kaksi rinnakkaista kutsua ei saa kuluttaa samaa
        // krediittiä kahteen vuokrasuhteeseen.
        .is("used_at", null);
    }
  }

  if (input.paidVia === "free") {
    await supabase
      .from("rs_users")
      .update({ free_tenancy_used: true, updated_at: timestamp })
      .eq("id", input.userId);
  }

  await supabase
    .from("rs_tenancies")
    .update({
      paid_via: input.paidVia,
      paid_at: timestamp,
      stripe_payment_id: input.stripePaymentId,
      updated_at: timestamp,
    })
    .eq("id", input.tenancyId)
    // Maksettua vuokrasuhdetta ei makseta uudelleen: toistettu webhook ei saa
    // siirtää maksuhetkeä eteenpäin ja pidentää peruutusaikaa.
    .is("paid_at", null);
}

/** Tallentaa Stripe-asiakastunnisteen, jotta portaali toimii myöhemmin. */
export async function saveCustomerId(userId: string, customerId: string): Promise<void> {
  await getServiceClient()
    .from("rs_users")
    .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
    .eq("id", userId);
}

/** Kirjaa suostumuksen palvelun aloittamiseen (peruutusoikeus raukeaa). */
export async function recordWithdrawalConsent(tenancyId: string, now: Date): Promise<void> {
  const timestamp = now.toISOString();

  await getServiceClient()
    .from("rs_tenancies")
    .update({ withdrawal_consent_at: timestamp, updated_at: timestamp })
    .eq("id", tenancyId)
    // Ensimmäinen suostumus jää voimaan: se on se hetki, jolloin tieto
    // annettiin, eikä sitä kirjoiteta uusiksi myöhemmillä käynneillä.
    .is("withdrawal_consent_at", null);
}

/** Kirjaa allekirjoituskierroksen lähetyksen. Tästä hetkestä palvelu on aloitettu. */
export async function recordSigningStarted(tenancyId: string, now: Date): Promise<void> {
  const timestamp = now.toISOString();

  await getServiceClient()
    .from("rs_tenancies")
    .update({ signing_started_at: timestamp, updated_at: timestamp })
    .eq("id", tenancyId)
    .is("signing_started_at", null);
}

export interface TenancyBillingState {
  paidVia: PaidVia | null;
  paidAt: string | null;
  signingStartedAt: string | null;
  stripePaymentId: string | null;
}

/** Vuokrasuhteen maksutila. Ei osapuolitarkistusta — kutsuja on jo tarkistanut. */
export async function getTenancyBillingState(
  tenancyId: string,
): Promise<TenancyBillingState | null> {
  const { data } = await getServiceClient()
    .from("rs_tenancies")
    .select("paid_via, paid_at, signing_started_at, stripe_payment_id")
    .eq("id", tenancyId)
    .maybeSingle();

  const row = data as {
    paid_via: PaidVia | null;
    paid_at: string | null;
    signing_started_at: string | null;
    stripe_payment_id: string | null;
  } | null;

  if (!row) return null;

  return {
    paidVia: row.paid_via,
    paidAt: row.paid_at,
    signingStartedAt: row.signing_started_at,
    stripePaymentId: row.stripe_payment_id,
  };
}

/* -------------------------------------------------------------------------
   Tilaukset
   ------------------------------------------------------------------------- */

export async function upsertSubscription(input: {
  userId: string;
  kind: "portfolio_yearly" | "plus_yearly";
  stripeSubscriptionId: string;
  quantity: number;
  status: "active" | "past_due" | "canceled";
  currentPeriodEnd: string | null;
}): Promise<void> {
  const { error } = await getServiceClient()
    .from("rs_subscriptions")
    .upsert(
      {
        user_id: input.userId,
        kind: input.kind,
        stripe_subscription_id: input.stripeSubscriptionId,
        quantity: input.quantity,
        status: input.status,
        current_period_end: input.currentPeriodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    );

  if (error) {
    console.error("[laskutus] tilauksen tallennus epäonnistui:", error.message);
    throw new Error("Tilauksen tallennus epäonnistui.");
  }
}

/** Merkitsee tilauksen päättyneeksi. Käyttöoikeus loppuu kauden lopussa. */
export async function cancelSubscription(stripeSubscriptionId: string): Promise<void> {
  await getServiceClient()
    .from("rs_subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", stripeSubscriptionId);
}

/** Käyttäjän tilaus lajeittain. `null`, jos sellaista ei ole. */
export async function getSubscription(
  userId: string,
  kind: "portfolio_yearly" | "plus_yearly",
): Promise<{
  stripeSubscriptionId: string;
  quantity: number;
  status: "active" | "past_due" | "canceled";
  currentPeriodEnd: string | null;
} | null> {
  const { data } = await getServiceClient()
    .from("rs_subscriptions")
    .select("stripe_subscription_id, quantity, status, current_period_end")
    .eq("user_id", userId)
    .eq("kind", kind)
    /*
      Uusin ensin.

      Päättynyt tilaus jää riviksi, ja jos käyttäjä tilaa uudelleen, rivejä on
      kaksi. Vanhempi näyttäisi tilauksen päättyneeltä, vaikka uusi on
      voimassa.
    */
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as {
    stripe_subscription_id: string;
    quantity: number;
    status: "active" | "past_due" | "canceled";
    current_period_end: string | null;
  } | null;

  if (!row) return null;

  return {
    stripeSubscriptionId: row.stripe_subscription_id,
    quantity: row.quantity,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
  };
}

/**
 * Salkkunäkymän tiedot yhdellä kutsulla.
 *
 * Vertailuluvut ovat TOTEUTUNEITA eivätkä arvioita: vuokrasuhteet viimeisen
 * vuoden ajalta ja asunnot, joista laskelma on tulostettu. Arvattu luku
 * näyttäisi laskelmassa samalta kuin mitattu, eikä käyttäjä voisi tietää
 * kumpi on kyseessä.
 */
export async function getPortfolioState(userId: string, now: Date = new Date()) {
  const supabase = getServiceClient();
  const vuosiSitten = new Date(now);
  vuosiSitten.setFullYear(vuosiSitten.getFullYear() - 1);

  const [{ data: properties }, { data: tenancies }, subscription] = await Promise.all([
    supabase.from("rs_properties").select("id").eq("owner_user_id", userId).is("archived_at", null),
    supabase
      .from("rs_tenancies")
      .select("id")
      .eq("landlord_user_id", userId)
      .gte("created_at", vuosiSitten.toISOString()),
    getSubscription(userId, "portfolio_yearly"),
  ]);

  const propertyIds = ((properties ?? []) as Array<{ id: string }>).map((row) => row.id);

  /*
    Plus-asunnot: ne, joista on tulostettu laskelma viimeisen vuoden aikana.

    `generated_at` eikä pelkkä rivin olemassaolo: laskelma voi olla tallessa
    ilman että sitä on koskaan sinetöity, ja veloitus syntyy vasta
    tulostuksesta.
  */
  let plusProperties = 0;
  if (propertyIds.length > 0) {
    const { data: reports } = await supabase
      .from("rs_tax_reports")
      .select("property_id")
      .in("property_id", propertyIds)
      .gte("generated_at", vuosiSitten.toISOString());

    plusProperties = new Set(
      ((reports ?? []) as Array<{ property_id: string }>).map((row) => row.property_id),
    ).size;
  }

  return {
    properties: propertyIds.length,
    tenanciesLastYear: (tenancies ?? []).length,
    plusProperties,
    subscription,
  };
}
