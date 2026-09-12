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
  };
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
