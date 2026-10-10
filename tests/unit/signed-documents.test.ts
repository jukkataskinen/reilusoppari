import { describe, expect, it } from "vitest";
import {
  roundsMissingDocuments,
  roundToCompletedEvent,
  signedDocumentList,
  type SignedDocumentFacts,
} from "@/lib/tenancy/signed-documents";
import type { Round } from "@/lib/esinetti";

/**
 * Allekirjoitetut asiakirjat Reilusopparissa (Jukka 10.10.2026): eSinetti on
 * taustapalvelu, eikä kummankaan osapuolen tarvitse käydä siellä.
 */

const sopimus: SignedDocumentFacts = {
  kind: "sopimus",
  roundId: "r1",
  signedAt: "2026-10-10T08:00:00.000Z",
  sealedPath: "t/r1/Vuokrasopimus.pdf",
  sealedSha256: "abc",
};

describe("asiakirjalista", () => {
  it("näyttää vain allekirjoitetut, aina samassa järjestyksessä", () => {
    const list = signedDocumentList([
      { kind: "loppukatselmus", roundId: "r3", signedAt: null, sealedPath: null, sealedSha256: null },
      { ...sopimus, kind: "alkukatselmus", roundId: "r2" },
      sopimus,
    ]);
    expect(list.map((d) => [d.kind, d.title])).toEqual([
      ["sopimus", "Vuokrasopimus"],
      ["alkukatselmus", "Alkukatselmuksen pöytäkirja"],
    ]);
  });

  it("allekirjoitettu mutta tallentamaton näkyy, ei ladattavana", () => {
    const [doc] = signedDocumentList([{ ...sopimus, sealedPath: null }]);
    expect(doc.available).toBe(false);
  });
});

describe("puuttuvat asiakirjat", () => {
  it("valmiiksi merkitty ilman tiedostoa puuttuu", () => {
    expect(roundsMissingDocuments([{ ...sopimus, sealedPath: null }])).toEqual(["r1"]);
  });

  it("webhook ei tullut: eSinetin mukaan valmis, meillä ei merkintää", () => {
    const facts = [{ ...sopimus, signedAt: null, sealedPath: null }];
    expect(roundsMissingDocuments(facts)).toEqual([]);
    expect(roundsMissingDocuments(facts, ["r1"])).toEqual(["r1"]);
  });

  it("yhteinen kierros mainitaan kerran", () => {
    const facts = [
      { ...sopimus, sealedPath: null },
      { ...sopimus, kind: "alkukatselmus" as const, sealedPath: null },
    ];
    expect(roundsMissingDocuments(facts)).toEqual(["r1"]);
  });

  it("tallessa oleva ja lähettämätön eivät puutu", () => {
    expect(roundsMissingDocuments([sopimus])).toEqual([]);
    expect(
      roundsMissingDocuments([{ kind: "sopimus", roundId: null, signedAt: null, sealedPath: null, sealedSha256: null }]),
    ).toEqual([]);
  });
});

describe("kierros webhookin muotoon", () => {
  it("kantaa asiakirjat, allekirjoittajat ja viitteen", () => {
    const round: Round = {
      id: "r1",
      title: "Vuokrasopimus – Testikatu 1",
      status: "completed",
      sequential: false,
      externalRef: "tenancy:11111111-1111-1111-1111-111111111111:alku",
      expiresAt: null,
      completedAt: "2026-10-10T08:00:00.000Z",
      createdAt: "2026-10-09T08:00:00.000Z",
      documents: [
        {
          id: "d1",
          name: "Vuokrasopimus.pdf",
          position: 0,
          pageCount: 3,
          sizeBytes: 1000,
          originalSha256: "o",
          sealedSha256: "s",
        },
      ],
      signers: [
        {
          id: "s1",
          name: "Matti",
          email: "matti@example.invalid",
          roleLabel: "Vuokranantaja",
          authLevel: "strong",
          position: 0,
          status: "signed",
          openedAt: null,
          identifiedAt: null,
          signedAt: "2026-10-10T08:00:00.000Z",
          declinedAt: null,
        },
      ],
    };

    const event = roundToCompletedEvent(round);
    expect(event.event).toBe("round.completed");
    expect(event.roundId).toBe("r1");
    expect(event.externalRef).toBe(round.externalRef);
    expect(event.documents).toEqual([{ id: "d1", name: "Vuokrasopimus.pdf", sealedSha256: "s", downloadUrl: null }]);
    expect(event.signers[0]).toMatchObject({ email: "matti@example.invalid", status: "signed" });
  });
});
