import { describe, expect, it } from "vitest";
import {
  hasSeparateInspectionRound,
  includeInspectionWithContract,
  inspectionRoundBlock,
} from "@/lib/tenancy/signing-plan";

/**
 * Sopimus ja alkukatselmus erikseen (Jukan päätös 10.10.2026).
 *
 * Sopimus ei odota katselmusta. Lukittu katselmus lähtee sopimuksen mukana,
 * muuten pöytäkirja allekirjoitetaan omana kierroksenaan myöhemmin.
 */

describe("sopimuksen kierros", () => {
  it("ottaa lukitun pöytäkirjan mukaan", () => {
    expect(includeInspectionWithContract({ status: "locked", esinettiRoundId: null })).toBe(true);
  });

  it("lähtee ilman pöytäkirjaa, kun katselmus on kesken tai avaamatta", () => {
    expect(includeInspectionWithContract({ status: "open", esinettiRoundId: null })).toBe(false);
    expect(includeInspectionWithContract(null)).toBe(false);
  });

  it("ei ota pöytäkirjaa, jolla on jo oma kierros", () => {
    expect(includeInspectionWithContract({ status: "locked", esinettiRoundId: "r1" })).toBe(false);
    expect(includeInspectionWithContract({ status: "signed", esinettiRoundId: "r1" })).toBe(false);
  });
});

describe("pöytäkirjan oma kierros", () => {
  const locked = { status: "locked" as const, esinettiRoundId: null };

  it("onnistuu, kun sopimus on lähetetty ja katselmus lukittu", () => {
    expect(
      inspectionRoundBlock({ isLandlord: true, contractRoundId: "r1", inspection: locked }),
    ).toBeNull();
  });

  it("vain vuokranantajalle", () => {
    expect(
      inspectionRoundBlock({ isLandlord: false, contractRoundId: "r1", inspection: locked }),
    ).toBe("not_landlord");
  });

  it("odottaa lukitusta", () => {
    expect(
      inspectionRoundBlock({
        isLandlord: true,
        contractRoundId: "r1",
        inspection: { status: "open", esinettiRoundId: null },
      }),
    ).toBe("inspection_not_locked");
    expect(
      inspectionRoundBlock({ isLandlord: true, contractRoundId: "r1", inspection: null }),
    ).toBe("inspection_not_locked");
  });

  it("ei ennen sopimusta: silloin pöytäkirja lähtee sopimuksen mukana", () => {
    expect(
      inspectionRoundBlock({ isLandlord: true, contractRoundId: null, inspection: locked }),
    ).toBe("contract_not_sent");
  });

  it("ei kahdesti", () => {
    expect(
      inspectionRoundBlock({
        isLandlord: true,
        contractRoundId: "r1",
        inspection: { status: "locked", esinettiRoundId: "r2" },
      }),
    ).toBe("already_sent");
    expect(
      inspectionRoundBlock({
        isLandlord: true,
        contractRoundId: "r1",
        inspection: { status: "signed", esinettiRoundId: "r1" },
      }),
    ).toBe("already_signed");
  });
});

describe("erillinen kierros", () => {
  it("tunnistetaan eri tunnisteesta", () => {
    expect(hasSeparateInspectionRound("r1", "r2")).toBe(true);
    expect(hasSeparateInspectionRound("r1", "r1")).toBe(false);
    expect(hasSeparateInspectionRound("r1", null)).toBe(false);
  });
});
