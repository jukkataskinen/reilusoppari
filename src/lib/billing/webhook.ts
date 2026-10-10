/**
 * Stripe-webhookien tarkistus ja tulkinta (CLAUDE.md kohta 6).
 *
 * ===========================================================================
 * ALLEKIRJOITUS TARKISTETAAN RAAKATAVUISTA
 *
 * Stripe allekirjoittaa pyynnön rungon merkki merkiltä. Jos runko luetaan
 * JSON:ksi ja kirjoitetaan takaisin merkkijonoksi, välilyönnit ja avainten
 * järjestys muuttuvat — ja allekirjoitus ei täsmää, vaikka mitään ei olisi
 * peukaloitu. Siksi tarkistus tehdään AINA siitä merkkijonosta, joka tuli,
 * eikä uudelleen sarjallistetusta.
 *
 * AIKAIKKUNA ON OSA ALLEKIRJOITUSTA
 *
 * Allekirjoitus lasketaan aikaleiman ja rungon yli yhdessä. Ilman
 * aikaikkunan tarkistusta vanha, aito webhook voitaisiin toistaa
 * myöhemmin — ja koska maksuwebhook myöntää käyttöoikeuden, se tarkoittaisi
 * ilmaista vuokrasuhdetta jokaiselle, joka sai yhden viestin talteen.
 *
 * VERTAILU ON AIKAVAKIO
 *
 * Tavallinen `===` kertoo vastausajallaan, montako merkkiä täsmäsi. Se on
 * hyökkääjälle riittävä palaute allekirjoituksen arvaamiseen merkki
 * kerrallaan.
 * ===========================================================================
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingEvent } from "./types";

/** Kuinka vanha webhook hyväksytään. Stripen oma suositus on viisi minuuttia. */
export const TOLERANCE_SECONDS = 300;

/**
 * Tarkistaa Stripen `stripe-signature`-otsakkeen.
 *
 * `payload` on pyynnön runko sellaisenaan, ei jäsennettynä.
 */
export function verifyWebhookSignature(input: {
  payload: string;
  header: string;
  secret: string;
  now?: Date;
}): boolean {
  const parts = new Map<string, string[]>();
  for (const piece of input.header.split(",")) {
    const index = piece.indexOf("=");
    if (index === -1) continue;
    const key = piece.slice(0, index).trim();
    const value = piece.slice(index + 1).trim();
    parts.set(key, [...(parts.get(key) ?? []), value]);
  }

  const timestamp = parts.get("t")?.[0];
  // `v1` voi esiintyä useasti avainten kierrätyksen aikana.
  const signatures = parts.get("v1") ?? [];

  if (!timestamp || signatures.length === 0) return false;

  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;

  const now = Math.floor((input.now?.getTime() ?? Date.now()) / 1000);
  if (Math.abs(now - seconds) > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", input.secret)
    .update(`${timestamp}.${input.payload}`)
    .digest("hex");

  return signatures.some((candidate) => timingSafeEqualHex(candidate, expected));
}

/** Aikavakio vertailu. `false`, jos pituudet eroavat — `timingSafeEqual` heittäisi. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** Stripen tapahtumatyyppi sovelluksen tyypiksi. `null` = ei kiinnosta meitä. */
function eventType(stripeType: string): BillingEvent["type"] | null {
  if (stripeType === "checkout.session.completed") return "checkout.completed";
  /*
    Uusi tilaus tulee `created`-tapahtumana. Ensimmäinen versio kuunteli vain
    `updated`ia, jota Stripe ei lähetä jokaisen maksun jälkeen — Plus jäi
    silloin kirjaamatta, vaikka maksu meni läpi (Jukka 10.10.2026). Molemmat
    käsitellään samoin: tilausolion tila ratkaisee.
  */
  if (stripeType === "customer.subscription.created") return "subscription.updated";
  if (stripeType === "customer.subscription.updated") return "subscription.updated";
  if (stripeType === "customer.subscription.deleted") return "subscription.deleted";
  if (stripeType === "charge.refunded") return "payment.refunded";
  return null;
}

/**
 * Poimii webhookista sen, mitä sovellus tarvitsee.
 *
 * `null`, jos tapahtuma ei kuulu meille. Tuntematon tapahtuma ei ole virhe:
 * Stripe lähettää niitä paljon, ja 400-vastaus saisi sen yrittämään
 * uudelleen loputtomiin.
 */
export function parseBillingEvent(payload: string): BillingEvent | null {
  let body: unknown;
  try {
    body = JSON.parse(payload);
  } catch {
    return null;
  }

  if (typeof body !== "object" || body === null) return null;

  const event = body as {
    id?: unknown;
    type?: unknown;
    data?: { object?: Record<string, unknown> };
  };

  if (typeof event.id !== "string" || typeof event.type !== "string") return null;

  const type = eventType(event.type);
  if (!type) return null;

  const object = event.data?.object ?? {};

  return {
    id: event.id,
    type,
    metadata: readMetadata(object.metadata),
    customerId: readId(object.customer),
    paymentIntentId: readId(object.payment_intent),
    subscriptionId: type.startsWith("subscription")
      ? readId(object.id)
      : readId(object.subscription),
    amountCents: typeof object.amount_total === "number" ? object.amount_total : null,
    /*
      Määrä ja kausi luetaan tilausoliosta, EI metadatasta.

      Ensimmäinen versio luki ne metadatasta, jonne Stripe ei niitä kirjoita.
      Lopputulos olisi ollut hiljainen: jokainen salkkutilaus olisi
      tallentunut yhden asunnon tilauksena ja kausi tyhjänä, ilman virhettä.
    */
    quantity: readQuantity(object),
    currentPeriodEnd: readPeriodEnd(object),
    status: typeof object.status === "string" ? object.status : null,
    mode: typeof object.mode === "string" ? object.mode : null,
    paymentStatus: typeof object.payment_status === "string" ? object.payment_status : null,
  };
}

/** Mitä tilaukselle tehdään kannassa. */
export interface SubscriptionChange {
  /**
   * `upsert` kirjoittaa Stripen tilausolion tiedot sellaisinaan.
   * `insert_if_missing` lisää rivin vain, jos sitä ei vielä ole: maksusivun
   * tapahtumassa ei ole kautta, eikä se saa pyyhkiä sitä, jos
   * tilaustapahtuma ehti ensin.
   */
  write: "upsert" | "insert_if_missing";
  userId: string;
  kind: "plus_yearly" | "portfolio_yearly";
  stripeSubscriptionId: string;
  quantity: number;
  status: "active" | "past_due" | "canceled";
  currentPeriodEnd: string | null;
  propertyId: string | null;
}

/**
 * Stripen tilauksen tila meidän kolmeen tilaamme. `null` = ei kirjata vielä.
 *
 * `incomplete` tarkoittaa, että ensimmäinen maksu on kesken. Sitä ei kirjata
 * voimassa olevaksi. Ensimmäinen versio kirjasi kaiken `active`ksi, jolloin
 * myös erääntynyt tai kesken jäänyt tilaus olisi antanut käyttöoikeuden.
 */
function mapStatus(status: string | null): SubscriptionChange["status"] | null {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return null;
}

/**
 * Tilausmuutos webhookista, tai `null` jos tapahtuma ei muuta tilausta.
 *
 * Puhdas funktio, jotta tilausten käsittely voidaan testata Stripen
 * oikeannäköisillä tapahtumilla ilman kantaa.
 *
 * PLUS KIRJATAAN JO MAKSUSIVUN TAPAHTUMASTA
 *
 * `checkout.session.completed` tulee varmimmin, ja siinä on sama metadata
 * (asunto ja käyttäjä). Jos Plus odottaisi vain tilaustapahtumaa, maksanut
 * käyttäjä näkisi paluusivulla "käsitellään" niin kauan kuin se viipyy —
 * tai ikuisesti, jos Stripen webhook-asetuksista puuttuvat tilaustapahtumat.
 * Salkkua ei kirjata tästä, koska sen asuntomäärä on vain tilausoliossa.
 */
export function subscriptionChangeFromEvent(event: BillingEvent): SubscriptionChange | null {
  const { userId, kind, propertyId } = event.metadata;
  if (!userId || !event.subscriptionId) return null;

  if (event.type === "checkout.completed") {
    if (event.mode !== "subscription") return null;
    if (event.paymentStatus !== "paid" && event.paymentStatus !== "no_payment_required") return null;
    if (kind !== "plus_yearly" || !propertyId) return null;

    return {
      write: "insert_if_missing",
      userId,
      kind: "plus_yearly",
      stripeSubscriptionId: event.subscriptionId,
      quantity: 1,
      status: "active",
      currentPeriodEnd: null,
      propertyId,
    };
  }

  if (event.type === "subscription.updated") {
    const status = mapStatus(event.status);
    if (!status) return null;

    const isPlus = kind === "plus_yearly";
    return {
      write: "upsert",
      userId,
      kind: isPlus ? "plus_yearly" : "portfolio_yearly",
      stripeSubscriptionId: event.subscriptionId,
      quantity: event.quantity ?? 1,
      status,
      currentPeriodEnd: event.currentPeriodEnd,
      // Plus on asunnon tilaus (migraatio 0019), salkku käyttäjän.
      propertyId: isPlus ? (propertyId ?? null) : null,
    };
  }

  return null;
}

/** Tilauksen määrä ensimmäiseltä riviltä. Salkussa se on asuntojen määrä. */
function readQuantity(object: Record<string, unknown>): number | null {
  const items = object.items;
  if (typeof items !== "object" || items === null) return null;

  const data = (items as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) return null;

  const first = data[0] as { quantity?: unknown };
  return typeof first.quantity === "number" ? first.quantity : null;
}

/**
 * Kauden loppu ISO-muotoon.
 *
 * Stripe antaa sen unix-sekunteina. `current_period_end` on tilauksen
 * juuressa vanhemmissa API-versioissa ja rivillä uudemmissa, joten
 * kumpikin paikka katsotaan.
 */
function readPeriodEnd(object: Record<string, unknown>): string | null {
  const direct = object.current_period_end;
  if (typeof direct === "number") return new Date(direct * 1000).toISOString();

  const items = object.items;
  if (typeof items !== "object" || items === null) return null;

  const data = (items as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) return null;

  const onItem = (data[0] as { current_period_end?: unknown }).current_period_end;
  return typeof onItem === "number" ? new Date(onItem * 1000).toISOString() : null;
}

/** Stripe palauttaa id:n joko merkkijonona tai laajennettuna oliona. */
function readId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

/** Metadata on Stripessä aina merkkijonoja; muu jätetään pois. */
function readMetadata(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) return {};

  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") result[key] = item;
  }
  return result;
}
