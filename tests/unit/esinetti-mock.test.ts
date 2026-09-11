import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  completeMockRound,
  EsinettiMockClient,
  resetMockEsinetti,
  signMockRound,
} from "@/lib/esinetti/mock";
import { isEsinettiError } from "@/lib/esinetti/errors";
import type { RoundDocumentInput } from "@/lib/esinetti/types";

/**
 * Mockin testit. Nämä eivät testaa eSinettiä vaan sitä, että mock käyttäytyy
 * riittävän samalla tavalla, jotta vaiheiden 0 ja 1 päälle voi rakentaa.
 *
 * Tärkein yksittäinen väite on `renderDocument`-testin PDF-rakenteen tarkistus:
 * jos mock palauttaisi tavuja jotka eivät ole PDF, esikatselunäkymää ei voisi
 * kehittää ilman eSinetti-tunnuksia — ja koko mockin olemassaolon syy
 * katoaisi.
 */

const client = new EsinettiMockClient();
const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function renderSample() {
  return client.renderDocument({
    templateId: TEMPLATE_ID,
    entityName: "Jukka Taskinen",
    today: "2026-10-01",
    data: { vuokra: 850, osoite: "Testikatu 1 A 4", määräaikainen: false },
  });
}

function pdfDoc(name: string, bytes: Uint8Array): RoundDocumentInput {
  return { name, pdfBytes: bytes };
}

beforeEach(() => {
  resetMockEsinetti();
});

describe("mock-renderöinti tuottaa aidon PDF:n", () => {
  it("alkaa PDF-otsikolla ja päättyy EOF-merkintään", async () => {
    const result = await renderSample();
    const text = Buffer.from(result.pdfBytes).toString("latin1");

    expect(text.startsWith("%PDF-1.")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(result.sizeBytes).toBe(result.pdfBytes.length);
    expect(result.sha256).toBe(sha256(result.pdfBytes));
  });

  it("xref-taulun siirtymät osoittavat oikeisiin objekteihin", async () => {
    // Tämä on se kohta, jossa käsin kirjoitettu PDF yleensä menee rikki:
    // väärä tavusiirtymä näyttää oikealta tekstinä mutta ei avaudu.
    const text = Buffer.from((await renderSample()).pdfBytes).toString("latin1");

    const startxref = /startxref\s+(\d+)/.exec(text);
    expect(startxref).not.toBeNull();
    expect(text.slice(Number(startxref![1]), Number(startxref![1]) + 4)).toBe("xref");

    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((offset, index) => {
      expect(text.slice(offset)).toMatch(new RegExp("^" + (index + 1) + " 0 obj"));
    });
  });

  it("sisältää annetut arvot ja on deterministinen", async () => {
    const first = await renderSample();
    const second = await renderSample();

    // Sama syöte → sama tiiviste. Ilman tätä esikatselun ja allekirjoitettavan
    // asiakirjan vertaaminen tiivisteellä ei tarkoittaisi mitään.
    expect(second.sha256).toBe(first.sha256);

    const text = Buffer.from(first.pdfBytes).toString("latin1");
    expect(text).toContain("Jukka Taskinen");
    expect(text).toContain("2026-10-01");
    // ä on WinAnsi-oktaalina, ei raakana merkkinä.
    expect(text).toContain("m\\344\\344r\\344aikainen");
  });
});

describe("mock-sinetöinti", () => {
  it("muuttaa tiivisteen ja tekee asiakirjasta löydettävän", async () => {
    const rendered = await renderSample();
    const sealedDoc = await client.sealDocument({
      name: "Vuokratodistus",
      pdfBytes: rendered.pdfBytes,
      metadata: { tenancy_id: "abc" },
    });

    // Sinetöinti muuttaa tavut — muuten sinetti ei olisi missään.
    expect(sealedDoc.sealedSha256).not.toBe(rendered.sha256);

    const verified = await client.verifyDocument(sealedDoc.sealedSha256);
    expect(verified.found).toBe(true);
    if (verified.found) {
      expect(verified.document.kind).toBe("standalone");
      expect(verified.document.name).toBe("Vuokratodistus");
      // Kierroksetonta asiakirjaa ei ole allekirjoittanut kukaan.
      expect(verified.round).toBeNull();
      expect(verified.signers).toEqual([]);
    }
  });

  it("latauslinkistä saa samat tavut kuin sinetöitiin", async () => {
    const rendered = await renderSample();
    const sealedDoc = await client.sealDocument({ name: "Todistus", pdfBytes: rendered.pdfBytes });

    // data:-URL, jotta sovelluskoodi voi käyttää samaa `fetch`iä kuin oikeassa
    // maailmassa allekirjoitettua Storage-linkkiä vasten.
    const bytes = new Uint8Array(await (await fetch(sealedDoc.downloadUrl)).arrayBuffer());
    expect(sha256(bytes)).toBe(sealedDoc.sealedSha256);
  });

  it("tuntematonta tiivistettä ei löydy", async () => {
    const result = await client.verifyDocument("0".repeat(64));
    expect(result).toEqual({ found: false });
  });

  it("tyhjää asiakirjaa ei sinetöidä", async () => {
    await expect(client.sealDocument({ name: "Tyhjä", pdfBytes: new Uint8Array() })).rejects.toThrow(
      /tyhjä/i,
    );
  });
});

describe("mock-allekirjoituskierros", () => {
  async function createSample() {
    const rendered = await renderSample();
    return client.createRound({
      title: "Vuokrasopimus ja alkukatselmus",
      externalRef: "tenancy:22222222-2222-4222-8222-222222222222:alku",
      documents: [
        pdfDoc("Vuokrasopimus", rendered.pdfBytes),
        pdfDoc("Alkukatselmus", rendered.pdfBytes),
      ],
      signers: [
        { name: "Vuokranantaja", email: "omistaja@example.invalid", roleLabel: "Vuokranantaja" },
        { name: "Vuokralainen", email: "asukas@example.invalid", roleLabel: "Vuokralainen" },
      ],
    });
  }

  it("luo kierroksen luonnoksena, allekirjoittajat odottavat", async () => {
    const round = await createSample();

    expect(round.status).toBe("draft");
    expect(round.documents).toHaveLength(2);
    expect(round.signers.map((s) => s.status)).toEqual(["pending", "pending"]);
    // Vahva tunnistus on oletus: todistusten arvo perustuu siihen.
    expect(round.signers.every((s) => s.authLevel === "strong")).toBe(true);
    // Sinetöityä ei ole ennen kuin kierros on valmis.
    expect(round.documents.every((d) => d.sealedSha256 === null)).toBe(true);
    expect(round.documents.every((d) => d.originalSha256?.length === 64)).toBe(true);
  });

  it("ei palauta mockin sisäisiä tavuja", async () => {
    const round = await createSample();
    // Jos `bytesById` vuotaisi, testi voisi nojata kenttään jota oikeassa
    // clientissä ei ole — ja huomaisi sen vasta tuotannossa.
    expect(Object.keys(round)).not.toContain("bytesById");
  });

  it("yksi allekirjoitus jättää kierroksen kesken, toinen viimeistelee sen", async () => {
    const round = await createSample();

    const afterFirst = signMockRound(round.id, round.signers[0].id);
    expect(afterFirst.status).toBe("partially_signed");
    expect(afterFirst.completedAt).toBeNull();
    expect(afterFirst.documents.every((d) => d.sealedSha256 === null)).toBe(true);

    const afterSecond = signMockRound(round.id, round.signers[1].id);
    expect(afterSecond.status).toBe("completed");
    expect(afterSecond.completedAt).not.toBeNull();
    expect(afterSecond.documents.every((d) => d.sealedSha256?.length === 64)).toBe(true);
  });

  it("valmiin kierroksen asiakirja löytyy verify-haulla allekirjoittajineen", async () => {
    const round = await createSample();
    const completed = completeMockRound(round.id);

    const verified = await client.verifyDocument(completed.documents[0].sealedSha256!);
    expect(verified.found).toBe(true);
    if (verified.found) {
      expect(verified.document.kind).toBe("round");
      expect(verified.round?.status).toBe("completed");
      expect(verified.signers.map((s) => s.name).sort()).toEqual(["Vuokralainen", "Vuokranantaja"]);
    }
  });

  it("lataus antaa alkuperäisen ennen valmistumista ja sinetöidyn sen jälkeen", async () => {
    const round = await createSample();
    const documentId = round.documents[0].id;

    const before = await client.downloadRoundDocument(round.id, documentId);
    expect(sha256(before)).toBe(round.documents[0].originalSha256);

    const completed = completeMockRound(round.id);
    const after = await client.downloadRoundDocument(round.id, documentId);
    expect(sha256(after)).toBe(completed.documents[0].sealedSha256);
  });

  it("tuntematon kierros on not_found eikä uudelleenyritettävä", async () => {
    const error = await client.getRound("ei-ole").catch((e: unknown) => e);
    expect(isEsinettiError(error)).toBe(true);
    if (isEsinettiError(error)) {
      expect(error.code).toBe("not_found");
      // Uudelleenyritys ei auta olemattomaan kierrokseen.
      expect(error.retryable).toBe(false);
    }
  });

  it("valmista kierrosta ei voi perua", async () => {
    const round = await createSample();
    completeMockRound(round.id);

    const error = await client.cancelRound(round.id).catch((e: unknown) => e);
    expect(isEsinettiError(error) && error.code).toBe("conflict");
  });

  it("kierros ilman allekirjoittajia hylätään", async () => {
    const rendered = await renderSample();
    await expect(
      client.createRound({
        title: "Ei allekirjoittajia",
        documents: [pdfDoc("Sopimus", rendered.pdfBytes)],
        signers: [],
      }),
    ).rejects.toThrow(/allekirjoittaja/i);
  });

  it("tila ei vuoda testien välillä", async () => {
    const round = await createSample();
    resetMockEsinetti();
    await expect(client.getRound(round.id)).rejects.toThrow();
  });
});
