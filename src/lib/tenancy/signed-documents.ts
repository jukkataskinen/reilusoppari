/**
 * Allekirjoitetut asiakirjat Reilusopparissa (Jukka 10.10.2026).
 *
 * ===========================================================================
 * eSINETTI ON TAUSTAPALVELU
 *
 * Kumpikaan osapuoli ei saa joutua käymään eSinetissä. Kun kierros on
 * valmis, sinetöidyt PDF:t ladataan omaan Storageen (`round-completed.ts`),
 * ja ne näytetään täällä: vuokrasuhteen sivulla ja Allekirjoitus-sivulla.
 *
 * PUUTTUVAN ASIAKIRJAN HAKU
 *
 * Jos webhook ei ehtinyt perille tai tallennus epäonnistui, kierros on
 * eSinetissä valmis mutta asiakirjaa ei ole meillä. Vuokranantaja voi hakea
 * sen napilla: kierros luetaan eSinetiltä ja ajetaan sama käsittely kuin
 * webhookissa. Käsittely on idempotentti, joten nappi ei voi tehdä mitään
 * kahdesti.
 * ===========================================================================
 */

import { getServiceClient } from "../db/supabase";
import { requireTenancyParty } from "../db/access";
import { getTenancy } from "../db/tenancies";
import { getEsinettiClient, type Round, type WebhookEvent } from "../esinetti";
import {
  handleFinalRoundCompleted,
  handleInspectionRoundCompleted,
  handleRoundCompleted,
  storeMissingSealedDocuments,
} from "./round-completed";

export type SignedDocumentKind = "sopimus" | "alkukatselmus" | "loppukatselmus";

export const SIGNED_DOCUMENT_TITLES: Record<SignedDocumentKind, string> = {
  sopimus: "Vuokrasopimus",
  alkukatselmus: "Alkukatselmuksen pöytäkirja",
  loppukatselmus: "Loppukatselmuksen pöytäkirja",
};

export interface SignedDocumentFacts {
  kind: SignedDocumentKind;
  roundId: string | null;
  signedAt: string | null;
  sealedPath: string | null;
  sealedSha256: string | null;
}

export interface SignedDocument {
  kind: SignedDocumentKind;
  title: string;
  signedAt: string;
  /** Ladattavissa omasta Storagesta. */
  available: boolean;
}

/**
 * Näytettävät asiakirjat: vain allekirjoitetut, aina samassa järjestyksessä.
 * Allekirjoitettu mutta tallentamaton näkyy, jotta puute ei jää huomaamatta.
 */
export function signedDocumentList(facts: SignedDocumentFacts[]): SignedDocument[] {
  const order: SignedDocumentKind[] = ["sopimus", "alkukatselmus", "loppukatselmus"];
  return order.flatMap((kind) => {
    const fact = facts.find((row) => row.kind === kind);
    if (!fact?.signedAt) return [];
    return [
      {
        kind,
        title: SIGNED_DOCUMENT_TITLES[kind],
        signedAt: fact.signedAt,
        available: Boolean(fact.sealedPath),
      },
    ];
  });
}

/**
 * Kierrokset, joiden asiakirja puuttuu meiltä. `completedRoundIds` on
 * eSinetiltä luettu tieto valmiista kierroksista; tallennettu `signedAt`
 * kertoo saman ilman eSinettiä.
 */
export function roundsMissingDocuments(
  facts: SignedDocumentFacts[],
  completedRoundIds: string[] = [],
): string[] {
  const missing = facts.filter(
    (row) =>
      row.roundId !== null &&
      !row.sealedPath &&
      (row.signedAt !== null || completedRoundIds.includes(row.roundId)),
  );
  return [...new Set(missing.map((row) => row.roundId!))];
}

/** Rivit kannasta. Vain osapuolelle. */
export async function loadSignedDocumentFacts(
  userId: string,
  tenancyId: string,
): Promise<SignedDocumentFacts[]> {
  await requireTenancyParty(userId, tenancyId);
  const supabase = getServiceClient();

  const [{ data: contract }, { data: inspections }] = await Promise.all([
    supabase
      .from("rs_contracts")
      .select("esinetti_round_id, signed_at, sealed_path, sealed_sha256")
      .eq("tenancy_id", tenancyId)
      .maybeSingle(),
    supabase
      .from("rs_inspections")
      .select("kind, esinetti_round_id, signed_at, sealed_path, sealed_sha256")
      .eq("tenancy_id", tenancyId),
  ]);

  type Row = {
    esinetti_round_id: string | null;
    signed_at: string | null;
    sealed_path: string | null;
    sealed_sha256: string | null;
  };
  const toFacts = (kind: SignedDocumentKind, row: Row): SignedDocumentFacts => ({
    kind,
    roundId: row.esinetti_round_id,
    signedAt: row.signed_at,
    sealedPath: row.sealed_path,
    sealedSha256: row.sealed_sha256,
  });

  const facts: SignedDocumentFacts[] = [];
  if (contract) facts.push(toFacts("sopimus", contract as Row));
  for (const row of (inspections ?? []) as Array<Row & { kind: "initial" | "final" }>) {
    facts.push(toFacts(row.kind === "initial" ? "alkukatselmus" : "loppukatselmus", row));
  }
  return facts;
}

export async function listSignedDocuments(userId: string, tenancyId: string): Promise<SignedDocument[]> {
  return signedDocumentList(await loadSignedDocumentFacts(userId, tenancyId));
}

/** Asiakirjan polku Storagessa latausta varten. `null`, jos ei ole. */
export async function signedDocumentFile(
  userId: string,
  tenancyId: string,
  kind: SignedDocumentKind,
): Promise<{ path: string; sha256: string | null } | null> {
  const fact = (await loadSignedDocumentFacts(userId, tenancyId)).find((row) => row.kind === kind);
  if (!fact?.signedAt || !fact.sealedPath) return null;
  return { path: fact.sealedPath, sha256: fact.sealedSha256 };
}

/** Kierros webhookin muotoon, jotta käsittely on täsmälleen sama. */
export function roundToCompletedEvent(round: Round): WebhookEvent {
  return {
    id: `haku_${round.id}`,
    event: "round.completed",
    createdAt: round.completedAt ?? new Date().toISOString(),
    roundId: round.id,
    externalRef: round.externalRef,
    status: round.status,
    signers: round.signers.map((signer) => ({
      id: signer.id,
      name: signer.name,
      email: signer.email,
      roleLabel: signer.roleLabel,
      status: signer.status,
      openedAt: signer.openedAt,
      identifiedAt: signer.identifiedAt,
      signedAt: signer.signedAt,
      declinedAt: signer.declinedAt,
    })),
    documents: round.documents.map((document) => ({
      id: document.id,
      name: document.name,
      sealedSha256: document.sealedSha256,
      downloadUrl: null,
    })),
  };
}

/**
 * "Hae allekirjoitetut asiakirjat": vain vuokranantaja.
 *
 * Kierrokset luetaan omasta kannasta, ei pyynnöstä. Keskeneräistä kierrosta
 * ei käsitellä: allekirjoitus ei ole valmis, vaikka nappia painettaisiin.
 */
export async function fetchMissingSignedDocuments(
  userId: string,
  tenancyId: string,
): Promise<{ ok: boolean; message: string }> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy || tenancy.landlordUserId !== userId) {
    return { ok: false, message: "Vain vuokranantaja voi hakea asiakirjat." };
  }

  const facts = await loadSignedDocumentFacts(userId, tenancyId);
  const roundIds = [...new Set(facts.filter((row) => row.roundId && !row.sealedPath).map((row) => row.roundId!))];
  if (roundIds.length === 0) return { ok: true, message: "Asiakirjat on jo haettu." };

  let fetched = 0;
  let unfinished = 0;
  for (const roundId of roundIds) {
    let round: Round;
    try {
      round = await getEsinettiClient().getRound(roundId);
    } catch {
      return { ok: false, message: "Allekirjoituspalveluun ei saatu yhteyttä. Yritä hetken kuluttua uudelleen." };
    }
    if (round.status !== "completed") {
      unfinished += 1;
      continue;
    }

    const event = roundToCompletedEvent(round);
    const kinds = facts.filter((row) => row.roundId === roundId).map((row) => row.kind);
    if (kinds.includes("sopimus")) await handleRoundCompleted(event, tenancyId);
    else if (kinds.includes("alkukatselmus")) await handleInspectionRoundCompleted(event, tenancyId);
    else if (kinds.includes("loppukatselmus")) await handleFinalRoundCompleted(event, tenancyId);

    // Webhook voi olla ajettu, mutta tallennus epäonnistunut: täydennetään.
    await storeMissingSealedDocuments(event, tenancyId);
    fetched += 1;
  }

  const after = await loadSignedDocumentFacts(userId, tenancyId);
  const stillMissing = after.some((row) => row.signedAt && !row.sealedPath);
  if (stillMissing) {
    return { ok: false, message: "Kaikkia asiakirjoja ei saatu haettua. Yritä hetken kuluttua uudelleen." };
  }
  if (fetched === 0 && unfinished > 0) {
    return { ok: false, message: "Allekirjoitus on vielä kesken. Asiakirjat voi hakea, kun kaikki ovat allekirjoittaneet." };
  }
  return { ok: true, message: "Allekirjoitetut asiakirjat on haettu." };
}

/**
 * Näytetäänkö vuokranantajalle "Hae allekirjoitetut asiakirjat"?
 *
 * Kierrokset, joita emme ole merkinneet valmiiksi, tarkistetaan eSinetiltä:
 * juuri ne ovat niitä, joiden webhook ei ehkä tullut perille. Valmiiksi
 * merkityt ilman tiedostoa näkyvät ilman eSinetin kutsua.
 */
export async function shouldOfferFetch(userId: string, tenancyId: string, facts: SignedDocumentFacts[]): Promise<boolean> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy || tenancy.landlordUserId !== userId) return false;
  if (roundsMissingDocuments(facts).length > 0) return true;

  const unconfirmed = [
    ...new Set(facts.filter((row) => row.roundId && !row.signedAt && !row.sealedPath).map((row) => row.roundId!)),
  ];
  const completed: string[] = [];
  for (const roundId of unconfirmed) {
    try {
      if ((await getEsinettiClient().getRound(roundId)).status === "completed") completed.push(roundId);
    } catch {
      // eSinetti ei vastaa: nappia ei näytetä, sivu toimii muuten.
    }
  }
  return roundsMissingDocuments(facts, completed).length > 0;
}
