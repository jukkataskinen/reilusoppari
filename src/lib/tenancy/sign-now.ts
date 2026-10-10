/**
 * "Allekirjoita nyt": vuokranantaja allekirjoittaa heti sovelluksessa
 * (Jukan havainto 10.10.2026).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: vain vuokrasuhteen vuokranantaja, ja vain omaan
 *    paikkaansa allekirjoittajana. Vuokralainen saa linkkinsä sähköpostilla.
 * 2. Henkilötieto: allekirjoituslinkki on avain allekirjoittajan paikalle.
 *    Sitä ei tallenneta, ei lokiteta eikä laiteta osoitteeseen.
 * 3. Syöte: vuokrasuhteen tunniste ja asiakirjan laji. Kierroksen tunniste
 *    luetaan omasta kannasta, ei pyynnöstä — käyttäjä ei voi pyytää linkkiä
 *    toisen vuokrasuhteen kierrokseen.
 * 4. IDOR: vuokranantajuus tarkistetaan `getTenancy`n kautta, ja
 *    allekirjoittaja valitaan vuokranantajan osapuolirivin sähköpostilla.
 * 5. Salaisuus: eSinetin API-avain palvelimella.
 * 6. Epäonnistuminen: käyttäjälle kerrotaan, että linkki on myös
 *    sähköpostissa. Mitään ei jää puolitiehen.
 * 7. Lokitus: vain HTTP-tila, ei osoitetta eikä linkkiä.
 * ===========================================================================
 */

import { getServiceClient } from "../db/supabase";
import { getTenancy } from "../db/tenancies";
import { getEsinettiClient, type Round } from "../esinetti";
import {
  esinettiOrigin,
  fetchSigningLink,
  pendingSignerFor,
  signingLinksEnabled,
  toEmbedSigningUrl,
} from "../esinetti/signing-link";
import { listPartyDetails } from "./party-details";

export type SignNowDocument = "sopimus" | "katselmus";

export const SIGN_NOW_FALLBACK_MESSAGE =
  "Allekirjoitusta ei voitu avata sovelluksessa. Allekirjoituslinkki on myös sähköpostissasi.";

async function roundIdFor(tenancyId: string, document: SignNowDocument): Promise<string | null> {
  const supabase = getServiceClient();
  if (document === "sopimus") {
    const { data } = await supabase
      .from("rs_contracts")
      .select("esinetti_round_id")
      .eq("tenancy_id", tenancyId)
      .maybeSingle();
    return (data as { esinetti_round_id: string | null } | null)?.esinetti_round_id ?? null;
  }
  const { data } = await supabase
    .from("rs_inspections")
    .select("esinetti_round_id")
    .eq("tenancy_id", tenancyId)
    .eq("kind", "initial")
    .maybeSingle();
  return (data as { esinetti_round_id: string | null } | null)?.esinetti_round_id ?? null;
}

async function landlordEmail(userId: string, tenancyId: string): Promise<string | null> {
  const parties = await listPartyDetails(userId, tenancyId);
  return parties.find((party) => party.role === "landlord")?.email ?? null;
}

/**
 * Näytetäänkö "Allekirjoita nyt" tälle kierrokselle?
 *
 * Vain vuokranantajalle, vain kun toiminto on käytössä, ja vain jos hän ei
 * ole vielä allekirjoittanut. `round` on sama, joka sivulla jo näytetään,
 * joten eSinetiltä ei kysytä toista kertaa.
 */
export async function canSignNow(userId: string, tenancyId: string, round: Round): Promise<boolean> {
  if (!signingLinksEnabled()) return false;
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy || tenancy.landlordUserId !== userId) return false;
  return pendingSignerFor(round.signers, await landlordEmail(userId, tenancyId)) !== null;
}

/**
 * Vuokranantajan oma upotettava allekirjoitusosoite.
 *
 * Kierros haetaan joka kerta eSinetiltä: allekirjoittajan tila voi olla
 * muuttunut sivun latauksen jälkeen.
 */
export async function landlordSigningUrl(
  userId: string,
  tenancyId: string,
  document: SignNowDocument,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  if (!signingLinksEnabled()) return { ok: false, message: SIGN_NOW_FALLBACK_MESSAGE };

  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy || tenancy.landlordUserId !== userId) {
    return { ok: false, message: "Vain vuokranantaja voi allekirjoittaa tästä." };
  }

  const roundId = await roundIdFor(tenancyId, document);
  if (!roundId) return { ok: false, message: "Asiakirjaa ei ole vielä lähetetty allekirjoitettavaksi." };

  let round: Round;
  try {
    round = await getEsinettiClient().getRound(roundId);
  } catch {
    return { ok: false, message: SIGN_NOW_FALLBACK_MESSAGE };
  }

  const signer = pendingSignerFor(round.signers, await landlordEmail(userId, tenancyId));
  if (!signer) return { ok: false, message: "Olet jo allekirjoittanut tämän asiakirjan." };

  const link = await fetchSigningLink(roundId, signer.id);
  if (!link.ok) return { ok: false, message: SIGN_NOW_FALLBACK_MESSAGE };

  const url = toEmbedSigningUrl(link.url, esinettiOrigin());
  if (!url) {
    console.error("[esinetti] allekirjoituslinkki ei ole eSinetin allekirjoitussivu");
    return { ok: false, message: SIGN_NOW_FALLBACK_MESSAGE };
  }

  return { ok: true, url };
}
