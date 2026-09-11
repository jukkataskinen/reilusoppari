import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildExternalRef,
  isKnownWebhookEvent,
  parseExternalRef,
  parseWebhookPayload,
  verifyWebhookSignature,
} from "@/lib/esinetti/webhook";

/**
 * Webhookin allekirjoituksen testit.
 *
 * Tämä on Reilusopparin ainoa suoja sitä vastaan, että kuka tahansa
 * internetistä ilmoittaisi vuokrasuhteen allekirjoitetuksi. Siksi testataan
 * nimenomaan hylkäykset — hyväksyminen on helppoa, hylkääminen on se osa,
 * joka voi hiljaa lakata toimimasta.
 */

const SECRET = "whsec_testi_ei_oikea_salaisuus";

const PAYLOAD = {
  id: "evt_1",
  event: "round.completed",
  created_at: "2026-10-01T10:00:00.000Z",
  data: {
    round_id: "33333333-3333-4333-8333-333333333333",
    external_ref: "tenancy:22222222-2222-4222-8222-222222222222:alku",
    status: "completed",
    signers: [
      {
        id: "s1",
        name: "Vuokranantaja",
        email: "omistaja@example.invalid",
        role_label: "Vuokranantaja",
        status: "signed",
        opened_at: "2026-10-01T09:00:00.000Z",
        identified_at: "2026-10-01T09:01:00.000Z",
        signed_at: "2026-10-01T09:02:00.000Z",
        declined_at: null,
      },
    ],
    documents: [
      {
        id: "d1",
        name: "Vuokrasopimus",
        sealed_sha256: "a".repeat(64),
        download_url: "https://example.invalid/signed",
      },
    ],
  },
};

const RAW = JSON.stringify(PAYLOAD);
const NOW = 1_790_000_000;

function sign(body: string, timestamp: number, secret = SECRET): string {
  const v1 = createHmac("sha256", secret)
    .update(timestamp + "." + body, "utf8")
    .digest("hex");
  return "t=" + timestamp + ",v1=" + v1;
}

describe("webhookin allekirjoitus", () => {
  it("hyväksyy oikean allekirjoituksen", () => {
    expect(verifyWebhookSignature(SECRET, sign(RAW, NOW), RAW, NOW)).toBe(true);
  });

  it("hylkää muutetun rungon", () => {
    const header = sign(RAW, NOW);
    const tampered = RAW.replace('"completed"', '"cancelled"');
    expect(verifyWebhookSignature(SECRET, header, tampered, NOW)).toBe(false);
  });

  it("hylkää väärällä salaisuudella tehdyn allekirjoituksen", () => {
    const header = sign(RAW, NOW, "whsec_vaara");
    expect(verifyWebhookSignature(SECRET, header, RAW, NOW)).toBe(false);
  });

  it("hylkää vanhan aikaleiman", () => {
    // 6 minuuttia vanha: toistohyökkäys tallennetulla pyynnöllä ei mene läpi.
    expect(verifyWebhookSignature(SECRET, sign(RAW, NOW - 360), RAW, NOW)).toBe(false);
  });

  it("hylkää tulevaisuuteen sijoitetun aikaleiman", () => {
    expect(verifyWebhookSignature(SECRET, sign(RAW, NOW + 360), RAW, NOW)).toBe(false);
  });

  it("hylkää puuttuvan otsikon ja roskan", () => {
    expect(verifyWebhookSignature(SECRET, null, RAW, NOW)).toBe(false);
    expect(verifyWebhookSignature(SECRET, "", RAW, NOW)).toBe(false);
    expect(verifyWebhookSignature(SECRET, "v1=abc", RAW, NOW)).toBe(false);
    expect(verifyWebhookSignature(SECRET, "t=" + NOW + ",v1=zz", RAW, NOW)).toBe(false);
  });

  it("hylkää kaiken, jos salaisuutta ei ole asetettu", () => {
    // Tyhjä `ESINETTI_WEBHOOK_SECRET` ei saa tarkoittaa "tarkistus ohi".
    expect(verifyWebhookSignature("", sign(RAW, NOW), RAW, NOW)).toBe(false);
  });

  it("uudelleensarjallistettu runko ei kelpaa", () => {
    // Muistutus siitä, että reitin on käytettävä raakaa runkoa: sama sisältö
    // eri välilyönneillä on eri tavut ja siten eri allekirjoitus.
    const reserialized = JSON.stringify(JSON.parse(RAW), null, 2);
    expect(verifyWebhookSignature(SECRET, sign(RAW, NOW), reserialized, NOW)).toBe(false);
  });
});

describe("webhookin jäsennys", () => {
  it("muuntaa payloadin camelCaseen", () => {
    const event = parseWebhookPayload(RAW);
    expect(event).not.toBeNull();
    expect(event!.id).toBe("evt_1");
    expect(event!.roundId).toBe(PAYLOAD.data.round_id);
    expect(event!.externalRef).toBe(PAYLOAD.data.external_ref);
    expect(event!.signers[0].signedAt).toBe("2026-10-01T09:02:00.000Z");
    expect(event!.documents[0].sealedSha256).toBe("a".repeat(64));
    expect(event!.documents[0].downloadUrl).toBe("https://example.invalid/signed");
  });

  it("palauttaa null kelvottomasta rungosta", () => {
    expect(parseWebhookPayload("ei json")).toBeNull();
    expect(parseWebhookPayload("{}")).toBeNull();
    expect(parseWebhookPayload(JSON.stringify({ id: "x", event: "y" }))).toBeNull();
  });

  it("hyväksyy tuntemattoman tapahtuman muodon, mutta tunnistaa sen tuntemattomaksi", () => {
    // eSinetti voi lisätä uusia tapahtumia. Jos jäsennys kaatuisi, se palauttaisi
    // 400:n ja eSinetti yrittäisi samaa 24 tuntia turhaan.
    const raw = JSON.stringify({ ...PAYLOAD, event: "round.something_new" });
    const event = parseWebhookPayload(raw);
    expect(event).not.toBeNull();
    expect(isKnownWebhookEvent(event!.event)).toBe(false);
    expect(isKnownWebhookEvent("round.completed")).toBe(true);
  });
});

describe("external_ref sitoo kierroksen vuokrasuhteeseen", () => {
  const tenancyId = "22222222-2222-4222-8222-222222222222";

  it("kulkee edestakaisin", () => {
    expect(parseExternalRef(buildExternalRef(tenancyId, "alku"))).toEqual({
      tenancyId,
      phase: "alku",
    });
    expect(parseExternalRef(buildExternalRef(tenancyId, "loppu"))).toEqual({
      tenancyId,
      phase: "loppu",
    });
  });

  it("tuntematon muoto on null eikä arvaus", () => {
    expect(parseExternalRef(null)).toBeNull();
    expect(parseExternalRef("")).toBeNull();
    expect(parseExternalRef("tenancy:" + tenancyId)).toBeNull();
    expect(parseExternalRef("tenancy:" + tenancyId + ":valissa")).toBeNull();
    expect(parseExternalRef("jotain-muuta")).toBeNull();
  });
});
