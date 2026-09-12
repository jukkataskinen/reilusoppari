import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseBillingEvent,
  TOLERANCE_SECONDS,
  verifyWebhookSignature,
} from "@/lib/billing";

const SECRET = "whsec_testisalaisuus";
const NYT = new Date("2026-09-12T12:00:00.000Z");

/** Rakentaa aidon näköisen `stripe-signature`-otsakkeen. */
function allekirjoita(payload: string, at: Date = NYT, secret = SECRET): string {
  const t = Math.floor(at.getTime() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

const RUNKO = JSON.stringify({
  id: "evt_1",
  type: "checkout.session.completed",
  data: {
    object: {
      customer: "cus_123",
      payment_intent: "pi_456",
      amount_total: 2900,
      metadata: { tenancyId: "vuokrasuhde-1", userId: "kayttaja-1", consent: "1" },
    },
  },
});

describe("allekirjoituksen tarkistus", () => {
  it("hyväksyy aidon allekirjoituksen", () => {
    expect(
      verifyWebhookSignature({
        payload: RUNKO,
        header: allekirjoita(RUNKO),
        secret: SECRET,
        now: NYT,
      }),
    ).toBe(true);
  });

  it("hylkää, jos runkoa on muutettu yhdelläkin merkillä", () => {
    const header = allekirjoita(RUNKO);
    const muutettu = RUNKO.replace("2900", "2901");

    expect(
      verifyWebhookSignature({ payload: muutettu, header, secret: SECRET, now: NYT }),
    ).toBe(false);
  });

  it("hylkää väärällä salaisuudella tehdyn", () => {
    expect(
      verifyWebhookSignature({
        payload: RUNKO,
        header: allekirjoita(RUNKO, NYT, "whsec_vaara"),
        secret: SECRET,
        now: NYT,
      }),
    ).toBe(false);
  });

  it("hylkää vanhan allekirjoituksen", () => {
    /*
      Toiston esto: aito mutta vanha webhook voitaisiin muuten lähettää
      uudelleen myöhemmin. Koska maksuwebhook myöntää käyttöoikeuden, se
      tarkoittaisi ilmaista vuokrasuhdetta jokaiselle, joka sai yhden
      viestin talteen.
    */
    const vanha = new Date(NYT.getTime() - (TOLERANCE_SECONDS + 60) * 1000);

    expect(
      verifyWebhookSignature({
        payload: RUNKO,
        header: allekirjoita(RUNKO, vanha),
        secret: SECRET,
        now: NYT,
      }),
    ).toBe(false);
  });

  it("hylkää tulevaisuudesta tulevan", () => {
    const tuleva = new Date(NYT.getTime() + (TOLERANCE_SECONDS + 60) * 1000);

    expect(
      verifyWebhookSignature({
        payload: RUNKO,
        header: allekirjoita(RUNKO, tuleva),
        secret: SECRET,
        now: NYT,
      }),
    ).toBe(false);
  });

  it("hyväksyy, jos yksikin useasta allekirjoituksesta täsmää", () => {
    // Avainten kierrätyksen aikana Stripe lähettää kaksi `v1`-arvoa.
    const oikea = allekirjoita(RUNKO);
    const t = oikea.split(",")[0];
    const v1 = oikea.split("v1=")[1];

    expect(
      verifyWebhookSignature({
        payload: RUNKO,
        header: `${t},v1=0000000000000000000000000000000000000000000000000000000000000000,v1=${v1}`,
        secret: SECRET,
        now: NYT,
      }),
    ).toBe(true);
  });

  it("hylkää rikkinäisen otsakkeen kaatumatta", () => {
    for (const header of ["", "roskaa", "t=abc,v1=def", "v1=vain-tama", "t=123"]) {
      expect(
        verifyWebhookSignature({ payload: RUNKO, header, secret: SECRET, now: NYT }),
      ).toBe(false);
    }
  });

  it("hylkää eripituisen allekirjoituksen kaatumatta", () => {
    // `timingSafeEqual` heittää eripituisilla puskureilla.
    expect(
      verifyWebhookSignature({
        payload: RUNKO,
        header: `t=${Math.floor(NYT.getTime() / 1000)},v1=lyhyt`,
        secret: SECRET,
        now: NYT,
      }),
    ).toBe(false);
  });
});

describe("tapahtuman tulkinta", () => {
  it("poimii maksun tiedot", () => {
    const event = parseBillingEvent(RUNKO);

    expect(event?.type).toBe("checkout.completed");
    expect(event?.metadata.tenancyId).toBe("vuokrasuhde-1");
    expect(event?.customerId).toBe("cus_123");
    expect(event?.paymentIntentId).toBe("pi_456");
    expect(event?.amountCents).toBe(2900);
  });

  it("ohittaa tapahtuman, joka ei kuulu meille", () => {
    /*
      `null` eikä virhe: Stripe lähettää paljon tapahtumia, ja 400-vastaus
      saisi sen yrittämään uudelleen loputtomiin.
    */
    const muu = JSON.stringify({ id: "evt_2", type: "invoice.created", data: { object: {} } });
    expect(parseBillingEvent(muu)).toBeNull();
  });

  it("kestää rikkinäisen rungon", () => {
    expect(parseBillingEvent("{ ei json")).toBeNull();
    expect(parseBillingEvent("null")).toBeNull();
    expect(parseBillingEvent("[]")).toBeNull();
  });

  it("lukee id:n myös laajennetusta oliosta", () => {
    // Stripe palauttaa viittauksen joko merkkijonona tai laajennettuna.
    const laajennettu = JSON.stringify({
      id: "evt_3",
      type: "checkout.session.completed",
      data: { object: { customer: { id: "cus_789" }, metadata: {} } },
    });

    expect(parseBillingEvent(laajennettu)?.customerId).toBe("cus_789");
  });

  it("jättää ei-merkkijonoisen metadatan pois", () => {
    const outo = JSON.stringify({
      id: "evt_4",
      type: "checkout.session.completed",
      data: { object: { metadata: { tenancyId: "a", luku: 5, olio: { x: 1 } } } },
    });

    expect(parseBillingEvent(outo)?.metadata).toEqual({ tenancyId: "a" });
  });

  it("tilaustapahtumassa tilauksen id on objektin oma id", () => {
    const tilaus = JSON.stringify({
      id: "evt_5",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1", customer: "cus_1", metadata: { userId: "u1" } } },
    });

    expect(parseBillingEvent(tilaus)?.subscriptionId).toBe("sub_1");
  });
});

describe("tilauksen määrä ja kausi", () => {
  it("luetaan tilausoliosta eikä metadatasta", () => {
    /*
      Ensimmäinen versio luki nämä metadatasta, jonne Stripe ei niitä
      kirjoita. Vika olisi ollut hiljainen: jokainen salkkutilaus olisi
      tallentunut yhden asunnon tilauksena ja kausi tyhjänä, ilman virhettä.
    */
    const tilaus = JSON.stringify({
      id: "evt_6",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_2",
          customer: "cus_2",
          current_period_end: 1788134400,
          items: { data: [{ quantity: 8 }] },
          metadata: { userId: "u1", kind: "portfolio_yearly" },
        },
      },
    });

    const event = parseBillingEvent(tilaus);
    expect(event?.quantity).toBe(8);
    expect(event?.currentPeriodEnd).toBe(new Date(1788134400 * 1000).toISOString());
  });

  it("löytää kauden lopun myös tilausriviltä", () => {
    // Uudemmissa API-versioissa `current_period_end` on rivillä, ei juuressa.
    const tilaus = JSON.stringify({
      id: "evt_7",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_3",
          items: { data: [{ quantity: 5, current_period_end: 1788134400 }] },
          metadata: {},
        },
      },
    });

    expect(parseBillingEvent(tilaus)?.currentPeriodEnd).toBe(
      new Date(1788134400 * 1000).toISOString(),
    );
  });

  it("kestää puuttuvat rivit kaatumatta", () => {
    const tilaus = JSON.stringify({
      id: "evt_8",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_4", metadata: {} } },
    });

    const event = parseBillingEvent(tilaus);
    expect(event?.quantity).toBeNull();
    expect(event?.currentPeriodEnd).toBeNull();
  });
});
