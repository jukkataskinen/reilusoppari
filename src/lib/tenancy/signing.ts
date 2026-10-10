/**
 * Allekirjoituskierrokset: sopimus heti, pöytäkirja erikseen (CLAUDE.md 5.4,
 * Jukan päätös 10.10.2026).
 *
 * ===========================================================================
 * SOPIMUS EI ODOTA KATSELMUSTA
 *
 * Vuokrasopimus tehdään yleensä ennen muuttoa, ja vuokralainen kuvaa viat
 * vasta muuttaessaan. Aiemmin sopimus ja pöytäkirja allekirjoitettiin aina
 * yhdessä, jolloin sopimus jäi odottamaan katselmusta, jota ei vielä voinut
 * tehdä. Nyt sopimuksen voi lähettää heti, kun osapuolten tiedot ovat
 * valmiit.
 *
 * Jos katselmus on jo lukittu sopimusta lähetettäessä, pöytäkirja lähtee
 * samalla kierroksella (`signing-plan.ts`). Muuten se allekirjoitetaan omana
 * kierroksenaan lukituksen jälkeen, viimeistään 14 päivän kuluessa
 * vuokrasuhteen alkamisesta (`inspection/deadline.ts`).
 *
 * JÄRJESTYS ON EHTO
 *
 * Sopimusta ei voi lähettää ennen kuin osapuolten tiedot ovat kunnossa —
 * muuten sopimukseen jäisi tyhjiä kohtia, joita ei allekirjoituksen jälkeen
 * voi korjata. Maksu on viimeinen portti. Ehdot tarkistetaan täällä eikä
 * käyttöliittymässä: nappi on vihje, tarkistus on portti.
 *
 * TILA TULEE WEBHOOKISTA, EI KYSELEMÄLLÄ
 *
 * Kierroksen edistyminen päivittyy `round.completed`-webhookista
 * (`app/api/esinetti/webhook`). Reilusoppari ei kysele eSinetiltä tilaa
 * silmukassa — se olisi sekä hitaampaa että epäluotettavampaa.
 * ===========================================================================
 */

import { createElement } from "react";
import { InspectionProtocol } from "@/documents/InspectionProtocol";
import { RentalAgreement } from "@/documents/RentalAgreement";
import { renderDocumentPdf } from "@/documents/render";
import { getServiceClient } from "../db/supabase";
import { getTenancy } from "../db/tenancies";
import { findInspection, getInspectionOverview } from "../db/inspections";
import {
  assertRealEsinetti,
  buildExternalRef,
  getEsinettiClient,
  type Round,
  type RoundDocumentInput,
  type RoundSigner,
} from "../esinetti";
import {
  getTenancyBillingState,
  recordSigningStarted,
} from "../db/billing";
import { completeReferral } from "../db/referrals";
import { buildRentalAgreementData } from "./contract-document";
import { buildInspectionProtocolData } from "./inspection-document";
import { listPartyDetails, missingPartyDetails, type PartyDetailsView } from "./party-details";
import {
  includeInspectionWithContract,
  hasSeparateInspectionRound,
  INSPECTION_ROUND_MESSAGES,
  inspectionRoundBlock,
  type InspectionFacts,
  type InspectionRoundBlock,
} from "./signing-plan";

export type SigningBlockReason =
  | "not_landlord"
  | "party_details_missing"
  | "already_sent"
  | "contract_incomplete"
  | "not_paid";

export type SigningReadiness =
  | { ready: true }
  | { ready: false; reason: SigningBlockReason; message: string; missing?: string[] };

/** Sopimuksen kierroksen tunniste, jos sopimus on lähetetty. */
async function contractRoundId(tenancyId: string): Promise<string | null> {
  const { data } = await getServiceClient()
    .from("rs_contracts")
    .select("esinetti_round_id")
    .eq("tenancy_id", tenancyId)
    .maybeSingle();
  return (data as { esinetti_round_id: string | null } | null)?.esinetti_round_id ?? null;
}

function inspectionFacts(
  inspection: { status: InspectionFacts["status"]; esinettiRoundId: string | null } | null,
): InspectionFacts | null {
  return inspection ? { status: inspection.status, esinettiRoundId: inspection.esinettiRoundId } : null;
}

/** Onko sopimuksen allekirjoituskierros lähetettävissä? */
export async function signingReadiness(
  userId: string,
  tenancyId: string,
): Promise<SigningReadiness> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy) {
    return { ready: false, reason: "not_landlord", message: "Vuokrasuhdetta ei löytynyt." };
  }

  if (tenancy.landlordUserId !== userId) {
    return {
      ready: false,
      reason: "not_landlord",
      message: "Vain vuokranantaja voi lähettää asiakirjat allekirjoitettavaksi.",
    };
  }

  const [roundId, parties] = await Promise.all([
    contractRoundId(tenancyId),
    listPartyDetails(userId, tenancyId),
  ]);

  if (roundId) {
    return {
      ready: false,
      reason: "already_sent",
      message: "Sopimus on jo lähetetty allekirjoitettavaksi.",
    };
  }

  const missing = missingPartyDetails(parties);
  if (missing.length > 0) {
    return {
      ready: false,
      reason: "party_details_missing",
      message: "Osapuolten tiedot ovat kesken. Täydennä ne ennen allekirjoitusta.",
      missing,
    };
  }

  // Sähköposti on välttämätön: eSinetti lähettää allekirjoituslinkin siihen.
  if (parties.some((party) => !party.email)) {
    return {
      ready: false,
      reason: "party_details_missing",
      message: "Jokaiselta osapuolelta puuttuu sähköpostiosoite.",
      missing: ["Sähköpostiosoite allekirjoituslinkkiä varten"],
    };
  }

  /*
    Maksu on VIIMEINEN portti.

    Järjestys on tarkoituksellinen: rahaa ei oteta ennen kuin kaikki muu on
    valmista. Jos maksu kysyttäisiin ensin, käyttäjä voisi maksaa ja törmätä
    vasta sen jälkeen puuttuviin osapuolitietoihin — ja maksu olisi tehty
    asiasta, jota ei voi vielä lähettää.

    Ilmainen ensimmäinen, salkku ja krediitti merkitään samalla tavalla
    `paid_via`-sarakkeeseen, joten yksi tarkistus riittää kaikkiin.
    Pöytäkirjan oma kierros ei maksa erikseen.
  */
  const billing = await getTenancyBillingState(tenancyId);
  if (!billing?.paidVia) {
    return {
      ready: false,
      reason: "not_paid",
      message: "Vahvista vuokrasuhteen maksu ennen kuin lähetät asiakirjat allekirjoitettavaksi.",
    };
  }

  return { ready: true };
}

export interface SendResult {
  ok: boolean;
  round?: Round;
  message?: string;
}

/**
 * Allekirjoittajat: vuokralaiset ensin, vuokranantaja viimeisenä.
 *
 * Sama järjestys kuin asiakirjojen allekirjoitusriveillä. Kierros ei ole
 * peräkkäinen (`sequential: false`), joten järjestys ei rajoita ketään —
 * se vain pitää listan samannäköisenä kuin paperi.
 */
function buildSigners(parties: PartyDetailsView[]): RoundSigner[] {
  const toSigner = (party: PartyDetailsView, roleLabel: string): RoundSigner => ({
    name: signerName(party),
    email: party.email!,
    phone: party.phone ?? undefined,
    roleLabel,
    authLevel: "strong" as const,
  });

  return [
    ...parties.filter((party) => party.role === "tenant").map((party) => toSigner(party, "Vuokralainen")),
    ...parties.filter((party) => party.role === "landlord").map((party) => toSigner(party, "Vuokranantaja")),
  ];
}

/**
 * Lähettää sopimuksen allekirjoitettavaksi, ja lukitun pöytäkirjan samalla.
 *
 * Asiakirjat renderöidään tässä hetkessä eikä haeta valmiina: niiden on
 * oltava täsmälleen se, mitä esikatselussa näkyy. Renderöinti on
 * deterministinen (`documents/render.ts`), joten sama data tuottaa saman
 * tiivisteen — ja juuri sitä tiivistettä verrataan myöhemmin.
 */
export async function sendForSigning(userId: string, tenancyId: string): Promise<SendResult> {
  const readiness = await signingReadiness(userId, tenancyId);
  if (!readiness.ready) return { ok: false, message: readiness.message };

  // Tuotannossa ei allekirjoiteta mockilla: se näyttäisi onnistuvan ilman
  // että kukaan allekirjoittaa mitään.
  assertRealEsinetti();

  const inspection = await findInspection(userId, tenancyId, "initial");
  const withInspection = includeInspectionWithContract(inspectionFacts(inspection));

  const [contract, protocol, parties] = await Promise.all([
    buildRentalAgreementData(userId, tenancyId),
    withInspection ? buildInspectionProtocolData(userId, tenancyId) : Promise.resolve(null),
    listPartyDetails(userId, tenancyId),
  ]);

  if (!contract || (withInspection && !protocol)) {
    return { ok: false, message: "Asiakirjoja ei voitu koota. Tarkista sopimuksen tiedot." };
  }

  const documents: RoundDocumentInput[] = [
    {
      name: "Vuokrasopimus.pdf",
      pdfBytes: (await renderDocumentPdf(createElement(RentalAgreement, { data: contract }))).bytes,
    },
  ];
  if (protocol) {
    documents.push({
      name: "Alkukatselmus.pdf",
      pdfBytes: (await renderDocumentPdf(createElement(InspectionProtocol, { data: protocol }))).bytes,
    });
  }

  let round: Round;
  try {
    round = await getEsinettiClient().createRound({
      title: protocol
        ? `Vuokrasopimus ja alkukatselmus – ${contract.property.street}`
        : `Vuokrasopimus – ${contract.property.street}`,
      documents,
      signers: buildSigners(parties),
      sequential: false,
      externalRef: buildExternalRef(tenancyId, "alku"),
      send: true,
    });
  } catch (err) {
    console.error(
      "[signing] kierroksen luonti epäonnistui:",
      err instanceof Error ? err.message : err,
    );
    return { ok: false, message: "Allekirjoituskierroksen lähetys ei onnistunut." };
  }

  const supabase = getServiceClient();
  const now = new Date().toISOString();

  /*
    Kierroksen tunniste tallennetaan jokaiselle asiakirjalle, joka on
    kierroksella.

    Webhook löytää vuokrasuhteen `externalRef`-kentästä, mutta sopimus ja
    katselmus ovat eri taulussa. Tunnisteesta näkee, kuuluuko pöytäkirja tähän
    kierrokseen vai allekirjoitetaanko se myöhemmin omanaan.
  */
  await Promise.all([
    supabase
      .from("rs_contracts")
      .update({ esinetti_round_id: round.id, updated_at: now })
      .eq("tenancy_id", tenancyId),
    protocol
      ? supabase
          .from("rs_inspections")
          .update({ esinetti_round_id: round.id, updated_at: now })
          .eq("tenancy_id", tenancyId)
          .eq("kind", "initial")
      : Promise.resolve(),
    supabase
      .from("rs_tenancies")
      .update({ status: "signing", updated_at: now })
      .eq("id", tenancyId),
  ]);

  /*
    Palvelu on nyt aloitettu kuluttajan pyynnöstä: peruutusoikeus raukeaa
    tästä hetkestä (`billing/withdrawal.ts`). Merkintä tehdään vasta kun
    kierros on oikeasti lähtenyt — jos lähetys epäonnistui, mitään ei ole
    aloitettu eikä oikeutta ole menetetty.
  */
  await recordSigningStarted(tenancyId, new Date(now));

  /*
    Suosittelu täyttyy tässä, ei rekisteröitymisessä (CLAUDE.md 5.9).

    Ei heitetä, jos epäonnistuu: krediitin myöntäminen on etu, eikä sen
    kariutuminen saa tehdä juuri lähetetystä allekirjoituskierroksesta
    virhettä käyttäjän silmissä.
  */
  try {
    await completeReferral(userId, new Date(now));
  } catch (err) {
    console.error("[signing] suosittelun täyttö epäonnistui:", err instanceof Error ? err.message : err);
  }

  return { ok: true, round };
}

export type InspectionSigningReadiness =
  | { ready: true }
  | { ready: false; reason: InspectionRoundBlock; message: string };

/** Voiko alkukatselmuksen pöytäkirjan lähettää omana kierroksenaan? */
export async function inspectionSigningReadiness(
  userId: string,
  tenancyId: string,
): Promise<InspectionSigningReadiness> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy) {
    return { ready: false, reason: "not_landlord", message: INSPECTION_ROUND_MESSAGES.not_landlord };
  }

  const [roundId, inspection] = await Promise.all([
    contractRoundId(tenancyId),
    findInspection(userId, tenancyId, "initial"),
  ]);

  const block = inspectionRoundBlock({
    isLandlord: tenancy.landlordUserId === userId,
    contractRoundId: roundId,
    inspection: inspectionFacts(inspection),
  });

  return block ? { ready: false, reason: block, message: INSPECTION_ROUND_MESSAGES[block] } : { ready: true };
}

/**
 * Alkukatselmuksen pöytäkirja omana kierroksenaan (Jukan päätös 10.10.2026).
 *
 * Samat allekirjoittajat kuin sopimuksessa. Ei maksua: vuokrasuhde on
 * maksettu sopimusta lähetettäessä. Ei tilamuutosta: vuokrasuhde on voimassa
 * sopimuksen allekirjoituksesta, ja pöytäkirja vain kirjaa asunnon kunnon.
 */
export async function sendInspectionForSigning(
  userId: string,
  tenancyId: string,
): Promise<SendResult> {
  const readiness = await inspectionSigningReadiness(userId, tenancyId);
  if (!readiness.ready) return { ok: false, message: readiness.message };

  assertRealEsinetti();

  const [protocol, parties] = await Promise.all([
    buildInspectionProtocolData(userId, tenancyId),
    listPartyDetails(userId, tenancyId),
  ]);

  if (!protocol) return { ok: false, message: "Pöytäkirjaa ei voitu koota." };
  if (parties.some((party) => !party.email)) {
    return { ok: false, message: "Jokaiselta osapuolelta puuttuu sähköpostiosoite." };
  }

  const protocolPdf = await renderDocumentPdf(createElement(InspectionProtocol, { data: protocol }));

  let round: Round;
  try {
    round = await getEsinettiClient().createRound({
      title: `Alkukatselmus – ${protocol.property.street}`,
      documents: [{ name: "Alkukatselmus.pdf", pdfBytes: protocolPdf.bytes }],
      signers: buildSigners(parties),
      sequential: false,
      externalRef: buildExternalRef(tenancyId, "katselmus"),
      send: true,
    });
  } catch (err) {
    console.error(
      "[signing] pöytäkirjan kierroksen luonti epäonnistui:",
      err instanceof Error ? err.message : err,
    );
    return { ok: false, message: "Allekirjoituskierroksen lähetys ei onnistunut." };
  }

  await getServiceClient()
    .from("rs_inspections")
    .update({ esinetti_round_id: round.id, updated_at: new Date().toISOString() })
    .eq("tenancy_id", tenancyId)
    .eq("kind", "initial");

  return { ok: true, round };
}

/** Yrityksen puolesta allekirjoittaa ihminen, ei yritys. */
function signerName(party: { name: string | null; partyType: string; signatoryName: string | null }) {
  if (party.partyType === "yritys" && party.signatoryName) return party.signatoryName;
  return party.name ?? "";
}

async function fetchRound(roundId: string): Promise<Round | null> {
  try {
    return await getEsinettiClient().getRound(roundId);
  } catch (err) {
    console.error(
      "[signing] kierroksen haku epäonnistui:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Sopimuksen kierroksen tila näytettäväksi. `null`, jos sitä ei ole lähetetty. */
export async function signingStatus(
  userId: string,
  tenancyId: string,
): Promise<Round | null> {
  if (!(await getTenancy(userId, tenancyId))) return null;
  const roundId = await contractRoundId(tenancyId);
  return roundId ? fetchRound(roundId) : null;
}

/**
 * Pöytäkirjan oman kierroksen tila. `null`, jos pöytäkirjaa ei ole lähetetty
 * tai se on sopimuksen kanssa samalla kierroksella.
 */
export async function inspectionSigningStatus(
  userId: string,
  tenancyId: string,
): Promise<Round | null> {
  const inspection = await findInspection(userId, tenancyId, "initial");
  if (!inspection?.esinettiRoundId) return null;
  const roundId = await contractRoundId(tenancyId);
  if (!hasSeparateInspectionRound(roundId, inspection.esinettiRoundId)) return null;
  return fetchRound(inspection.esinettiRoundId);
}


/**
 * Loppukatselmuksen allekirjoituskierros (CLAUDE.md 5.8).
 *
 * ===========================================================================
 * YKSI ASIAKIRJA, SAMAT ALLEKIRJOITTAJAT
 *
 * Alussa allekirjoitetaan kaksi asiakirjaa, lopussa yksi: loppukatselmuksen
 * pöytäkirja. Sopimusta ei allekirjoiteta uudelleen — se on jo voimassa, ja
 * sen uudelleenallekirjoittaminen antaisi ymmärtää, että sen sisällöstä
 * neuvotellaan uudelleen.
 *
 * Tämä kierros vie vuokrasuhteen tilaan `ended`, ja vasta siitä alkaa
 * arvioiden ja todistusten vaihe.
 * ===========================================================================
 */
export async function sendFinalForSigning(
  userId: string,
  tenancyId: string,
): Promise<SendResult> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy) return { ok: false, message: "Vuokrasuhdetta ei löytynyt." };

  if (tenancy.landlordUserId !== userId) {
    return { ok: false, message: "Vain vuokranantaja voi lähettää pöytäkirjan allekirjoitettavaksi." };
  }

  const overview = await getInspectionOverview(userId, tenancyId, "final");

  if (overview.inspection.esinettiRoundId) {
    return { ok: false, message: "Pöytäkirja on jo lähetetty allekirjoitettavaksi." };
  }
  if (overview.inspection.status === "open") {
    return { ok: false, message: "Lukitse loppukatselmus ensin." };
  }

  assertRealEsinetti();

  const [protocol, parties] = await Promise.all([
    buildInspectionProtocolData(userId, tenancyId, "final"),
    listPartyDetails(userId, tenancyId),
  ]);

  if (!protocol) {
    return { ok: false, message: "Pöytäkirjaa ei voitu koota." };
  }

  if (parties.some((party) => !party.email)) {
    return { ok: false, message: "Jokaiselta osapuolelta puuttuu sähköpostiosoite." };
  }

  const protocolPdf = await renderDocumentPdf(
    createElement(InspectionProtocol, { data: protocol }),
  );

  const signers: RoundSigner[] = [
    ...parties
      .filter((party) => party.role === "tenant")
      .map((party) => ({
        name: signerName(party),
        email: party.email!,
        phone: party.phone ?? undefined,
        roleLabel: "Vuokralainen",
        authLevel: "strong" as const,
      })),
    ...parties
      .filter((party) => party.role === "landlord")
      .map((party) => ({
        name: signerName(party),
        email: party.email!,
        phone: party.phone ?? undefined,
        roleLabel: "Vuokranantaja",
        authLevel: "strong" as const,
      })),
  ];

  let round: Round;
  try {
    round = await getEsinettiClient().createRound({
      title: `Loppukatselmus – ${protocol.property.street}`,
      documents: [{ name: "Loppukatselmus.pdf", pdfBytes: protocolPdf.bytes }],
      signers,
      sequential: false,
      externalRef: buildExternalRef(tenancyId, "loppu"),
      send: true,
    });
  } catch (err) {
    console.error(
      "[signing] loppukierroksen luonti epäonnistui:",
      err instanceof Error ? err.message : err,
    );
    return { ok: false, message: "Allekirjoituskierroksen lähetys ei onnistunut." };
  }

  const now = new Date().toISOString();
  await getServiceClient()
    .from("rs_inspections")
    .update({ esinetti_round_id: round.id, updated_at: now })
    .eq("tenancy_id", tenancyId)
    .eq("kind", "final");

  return { ok: true, round };
}

/** Loppukierroksen tila näytettäväksi. */
export async function finalSigningStatus(
  userId: string,
  tenancyId: string,
): Promise<Round | null> {
  const overview = await getInspectionOverview(userId, tenancyId, "final");
  if (!overview.inspection.esinettiRoundId) return null;

  try {
    return await getEsinettiClient().getRound(overview.inspection.esinettiRoundId);
  } catch (err) {
    console.error(
      "[signing] loppukierroksen haku epäonnistui:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
