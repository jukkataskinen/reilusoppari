/**
 * Allekirjoituskierros: sopimus ja katselmuspöytäkirja yhdessä (CLAUDE.md 5.4).
 *
 * ===========================================================================
 * MOLEMMAT ASIAKIRJAT SAMALLA KIERROKSELLA
 *
 * Sopimus ja alkukatselmus allekirjoitetaan yhtenä kokonaisuutena, yhdellä
 * tunnistautumisella. Syy ei ole mukavuus vaan se, että ne kuuluvat yhteen:
 * sopimus kertoo mistä sovittiin ja pöytäkirja missä kunnossa koti oli
 * silloin. Erikseen allekirjoitettuina jälkimmäinen jäisi tekemättä.
 *
 * JÄRJESTYS ON EHTO
 *
 * Kierrosta ei voi lähettää ennen kuin
 *   1. katselmus on lukittu — muuten pöytäkirjaa ei ole olemassa, ja
 *   2. osapuolten tiedot ovat kunnossa — muuten sopimukseen jäisi tyhjiä
 *      kohtia, joita ei allekirjoituksen jälkeen voi korjata.
 *
 * Molemmat tarkistetaan täällä eikä käyttöliittymässä: nappi on vihje,
 * tarkistus on portti.
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
import { getInspectionOverview } from "../db/inspections";
import {
  assertRealEsinetti,
  buildExternalRef,
  getEsinettiClient,
  type Round,
  type RoundSigner,
} from "../esinetti";
import {
  getTenancyBillingState,
  recordSigningStarted,
} from "../db/billing";
import { completeReferral } from "../db/referrals";
import { buildRentalAgreementData } from "./contract-document";
import { buildInspectionProtocolData } from "./inspection-document";
import { listPartyDetails, missingPartyDetails } from "./party-details";

export type SigningBlockReason =
  | "not_landlord"
  | "inspection_not_locked"
  | "party_details_missing"
  | "already_sent"
  | "contract_incomplete"
  | "not_paid";

export type SigningReadiness =
  | { ready: true }
  | { ready: false; reason: SigningBlockReason; message: string; missing?: string[] };

/** Onko allekirjoituskierros lähetettävissä? */
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

  const [overview, parties] = await Promise.all([
    getInspectionOverview(userId, tenancyId),
    listPartyDetails(userId, tenancyId),
  ]);

  if (overview.inspection.esinettiRoundId) {
    return {
      ready: false,
      reason: "already_sent",
      message: "Asiakirjat on jo lähetetty allekirjoitettavaksi.",
    };
  }

  if (overview.inspection.status === "open") {
    return {
      ready: false,
      reason: "inspection_not_locked",
      message: "Lukitse alkukatselmus ensin. Pöytäkirja allekirjoitetaan sopimuksen kanssa.",
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
 * Lähettää sopimuksen ja pöytäkirjan allekirjoitettavaksi.
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

  const [contract, protocol, parties] = await Promise.all([
    buildRentalAgreementData(userId, tenancyId),
    buildInspectionProtocolData(userId, tenancyId),
    listPartyDetails(userId, tenancyId),
  ]);

  if (!contract || !protocol) {
    return { ok: false, message: "Asiakirjoja ei voitu koota. Tarkista sopimuksen tiedot." };
  }

  const [contractPdf, protocolPdf] = await Promise.all([
    renderDocumentPdf(createElement(RentalAgreement, { data: contract })),
    renderDocumentPdf(createElement(InspectionProtocol, { data: protocol })),
  ]);

  /*
    Allekirjoittajat: vuokralaiset ensin, vuokranantaja viimeisenä.

    Sama järjestys kuin asiakirjojen allekirjoitusriveillä. Kierros ei ole
    peräkkäinen (`sequential: false`), joten järjestys ei rajoita ketään —
    se vain pitää listan samannäköisenä kuin paperi.
  */
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
      title: `Vuokrasopimus ja alkukatselmus – ${contract.property.street}`,
      documents: [
        { name: "Vuokrasopimus.pdf", pdfBytes: contractPdf.bytes },
        { name: "Alkukatselmus.pdf", pdfBytes: protocolPdf.bytes },
      ],
      signers,
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
    Kierroksen tunniste tallennetaan MOLEMMILLE riveille.

    Webhook löytää vuokrasuhteen `externalRef`-kentästä, mutta sopimus ja
    katselmus ovat eri taulussa. Ilman tunnistetta kummallakin rivillä ei
    tietäisi, kumpi asiakirja kuuluu mihinkin kierrokseen — ja niitä on
    myöhemmin kaksi, kun loppukatselmus allekirjoitetaan.
  */
  await Promise.all([
    supabase
      .from("rs_contracts")
      .update({ esinetti_round_id: round.id, updated_at: now })
      .eq("tenancy_id", tenancyId),
    supabase
      .from("rs_inspections")
      .update({ esinetti_round_id: round.id, updated_at: now })
      .eq("tenancy_id", tenancyId)
      .eq("kind", "initial"),
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

/** Yrityksen puolesta allekirjoittaa ihminen, ei yritys. */
function signerName(party: { name: string | null; partyType: string; signatoryName: string | null }) {
  if (party.partyType === "yritys" && party.signatoryName) return party.signatoryName;
  return party.name ?? "";
}

/** Kierroksen tila näytettäväksi. `null`, jos kierrosta ei ole lähetetty. */
export async function signingStatus(
  userId: string,
  tenancyId: string,
): Promise<Round | null> {
  const overview = await getInspectionOverview(userId, tenancyId);
  if (!overview.inspection.esinettiRoundId) return null;

  try {
    return await getEsinettiClient().getRound(overview.inspection.esinettiRoundId);
  } catch (err) {
    console.error(
      "[signing] kierroksen haku epäonnistui:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
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
