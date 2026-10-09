import { describe, expect, it } from "vitest";
import {
  DEV_SUGGESTION_EVENTS,
  DEV_SUGGESTION_STATUSES,
  isDevSuggestionStatus,
  isFinalStatus,
  nextStatus,
  type DevSuggestionStatus,
} from "@/lib/dev-suggestions/state-machine";

/**
 * Kehitysehdotusten tilakone (docs/kehitysehdotukset.md). Käydään LÄPI
 * KAIKKI tila × tapahtuma -yhdistelmät, ei vain odotetut polut: tilakoneen
 * koko arvo on siinä, että kielletyt siirtymät eivät ole mahdollisia.
 */

const ALLOWED: Record<DevSuggestionStatus, Partial<Record<(typeof DEV_SUGGESTION_EVENTS)[number], DevSuggestionStatus>>> = {
  uusi: { hyvaksy: "hyvaksytty", hylkaa: "hylatty" },
  hyvaksytty: { hylkaa: "hylatty", pr_avattu: "tyon_alla" },
  tyon_alla: { hylkaa: "hylatty", pr_yhdistetty: "testattavana" },
  testattavana: {
    hylkaa: "hylatty",
    pr_avattu: "tyon_alla",
    toimii: "valmis",
    tarvitsee_muutoksen: "tyon_alla",
  },
  valmis: {},
  hylatty: {},
};

describe("kehitysehdotuksen tilakone", () => {
  for (const status of DEV_SUGGESTION_STATUSES) {
    for (const event of DEV_SUGGESTION_EVENTS) {
      const expected = ALLOWED[status][event] ?? null;
      it(`${status} + ${event} -> ${expected ?? "ei siirtymää"}`, () => {
        expect(nextStatus(status, event)).toBe(expected);
      });
    }
  }

  it("lopputilat eivät siirry mihinkään", () => {
    for (const event of DEV_SUGGESTION_EVENTS) {
      expect(nextStatus("valmis", event)).toBeNull();
      expect(nextStatus("hylatty", event)).toBeNull();
    }
    expect(isFinalStatus("valmis")).toBe(true);
    expect(isFinalStatus("hylatty")).toBe(true);
    expect(isFinalStatus("tyon_alla")).toBe(false);
  });

  it("hylkäys on mahdollinen joka avoimesta tilasta mutta ei lopputilasta", () => {
    expect(nextStatus("uusi", "hylkaa")).toBe("hylatty");
    expect(nextStatus("hyvaksytty", "hylkaa")).toBe("hylatty");
    expect(nextStatus("tyon_alla", "hylkaa")).toBe("hylatty");
    expect(nextStatus("testattavana", "hylkaa")).toBe("hylatty");
  });

  it("testattavana voi palata työn alle kahdella reitillä", () => {
    expect(nextStatus("testattavana", "tarvitsee_muutoksen")).toBe("tyon_alla");
    expect(nextStatus("testattavana", "pr_avattu")).toBe("tyon_alla");
  });

  it("tunnistaa kelvolliset tilat merkkijonosta", () => {
    expect(isDevSuggestionStatus("tyon_alla")).toBe(true);
    expect(isDevSuggestionStatus("in_progress")).toBe(false);
    expect(isDevSuggestionStatus(42)).toBe(false);
  });
});
