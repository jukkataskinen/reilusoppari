/**
 * Sopimus (`rs_contracts`, CLAUDE.md 5.1).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: vuokrasuhteen osapuoli lukee, **vain vuokranantaja
 *    kirjoittaa**. Vuokralainen näkee luonnoksen ja voi kommentoida, mutta
 *    ei muuta ehtoja — muuten hän voisi muuttaa sopimusta sen jälkeen, kun
 *    vuokranantaja on sen lukenut.
 * 2. Henkilötieto: ei suoraan; osapuolet tulevat vuokrasuhteesta.
 * 3. Syöte: zod (`tenancy/contract-schema.ts`).
 * 4. **Allekirjoitettua sopimusta ei muuteta.** `signed_at` lukitsee rivin:
 *    muutos allekirjoituksen jälkeen tekisi allekirjoituksesta
 *    merkityksettömän.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: neutraali viesti.
 * 7. Lokitus: ei sopimusdataa.
 * ===========================================================================
 */

import { getServiceClient } from "./supabase";
import { getTenancy } from "./tenancies";
import { requireTenancyParty } from "./access";
import {
  CONTRACT_TEMPLATE_KEY,
  CONTRACT_TEMPLATE_VERSION,
  DEFAULT_CONTRACT_TERMS,
  contractTermsSchema,
  type ContractTerms,
} from "../tenancy/contract-schema";

export interface Contract {
  id: string;
  tenancyId: string;
  templateKey: string;
  templateVersion: number;
  terms: ContractTerms;
  signedAt: string | null;
  sealedSha256: string | null;
}

interface ContractRow {
  id: string;
  tenancy_id: string;
  template_key: string;
  template_version: number;
  template_data: unknown;
  signed_at: string | null;
  sealed_sha256: string | null;
}

const COLUMNS =
  "id, tenancy_id, template_key, template_version, template_data, signed_at, sealed_sha256";

/**
 * Tallennettu data luetaan zodilla takaisin.
 *
 * `jsonb`-sarake voi sisältää mitä tahansa — myös vanhan version kenttiä tai
 * käsin muokattua dataa. Jos jäsennys ei onnistu, käytetään oletuksia sen
 * sijaan että näkymä kaatuisi: puuttuva ehto on parempi kuin rikkoutunut sivu,
 * ja vuokranantaja näkee heti mitä puuttuu.
 */
function parseTerms(value: unknown): ContractTerms {
  const parsed = contractTermsSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  console.error("[contracts] tallennettu sopimusdata ei jäsenny, käytetään oletuksia");
  return DEFAULT_CONTRACT_TERMS;
}

function fromRow(row: ContractRow): Contract {
  return {
    id: row.id,
    tenancyId: row.tenancy_id,
    templateKey: row.template_key,
    templateVersion: row.template_version,
    terms: parseTerms(row.template_data),
    signedAt: row.signed_at,
    sealedSha256: row.sealed_sha256,
  };
}

/** Sopimus, jos kutsuja on vuokrasuhteen osapuoli. */
export async function getContract(userId: string, tenancyId: string): Promise<Contract | null> {
  if (!(await getTenancy(userId, tenancyId))) return null;

  const { data, error } = await getServiceClient()
    .from("rs_contracts")
    .select(COLUMNS)
    .eq("tenancy_id", tenancyId)
    .maybeSingle();

  if (error) {
    console.error("[contracts] haku epäonnistui:", error.message);
    throw new Error("Sopimuksen haku epäonnistui.");
  }

  return data ? fromRow(data as ContractRow) : null;
}

/**
 * Tallentaa sopimuksen ehdot. Vain vuokranantaja, vain ennen allekirjoitusta.
 *
 * Palauttaa `null`, jos kutsujalla ei ole oikeutta tai sopimus on jo
 * allekirjoitettu — kutsuja ei saa tietää kumpi, koska sekin kertoisi
 * vuokrasuhteen tilasta ulkopuoliselle.
 */
export async function saveContractTerms(
  userId: string,
  tenancyId: string,
  terms: ContractTerms,
): Promise<Contract | null> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy || tenancy.landlordUserId !== userId) return null;

  const supabase = getServiceClient();

  const existing = await getContract(userId, tenancyId);
  if (existing?.signedAt) return null;

  const { data, error } = await supabase
    .from("rs_contracts")
    .upsert(
      {
        tenancy_id: tenancyId,
        template_key: CONTRACT_TEMPLATE_KEY,
        template_version: CONTRACT_TEMPLATE_VERSION,
        template_data: terms,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenancy_id" },
    )
    .select(COLUMNS)
    .single();

  if (error || !data) {
    console.error("[contracts] tallennus epäonnistui:", error?.message);
    throw new Error("Sopimuksen tallennus epäonnistui.");
  }

  return fromRow(data as ContractRow);
}

/** Sopimuksen ehdot, tai oletukset jos sopimusta ei ole vielä luotu. */
export async function getContractTerms(
  userId: string,
  tenancyId: string,
): Promise<ContractTerms> {
  const contract = await getContract(userId, tenancyId);
  return contract?.terms ?? DEFAULT_CONTRACT_TERMS;
}

/**
 * Sopimusluonnoksen kommentit (CLAUDE.md 5.2).
 *
 * ===========================================================================
 * VUOKRALAINEN EI MUOKKAA SOPIMUSTA
 *
 * Hän lukee luonnoksen ja kertoo, mitä haluaisi muuttaa. Vuokranantaja
 * muokkaa ehtoja, ja esikatselu päivittyy. Muuten sopimus voisi muuttua sen
 * jälkeen, kun toinen on sen lukenut (DECISIONS.md 2026-09-11).
 *
 * Kumpikin osapuoli saa kommentoida: yksisuuntainen kanava olisi outo, koska
 * vuokranantajan on voitava vastata. Kommenttia ei voi poistaa.
 * ===========================================================================
 */

export interface ContractComment {
  id: string;
  body: string;
  createdAt: string;
  authorUserId: string;
  authorName: string | null;
  authorRole: "landlord" | "tenant";
  isSelf: boolean;
}

export async function listContractComments(
  userId: string,
  tenancyId: string,
): Promise<ContractComment[]> {
  await requireTenancyParty(userId, tenancyId);

  const supabase = getServiceClient();

  const [{ data: comments, error }, { data: parties }] = await Promise.all([
    supabase
      .from("rs_contract_comments")
      .select("id, body, created_at, author_user_id")
      .eq("tenancy_id", tenancyId)
      .order("created_at", { ascending: true }),
    supabase
      .from("rs_tenancy_parties")
      .select("user_id, role, party_name")
      .eq("tenancy_id", tenancyId),
  ]);

  if (error) {
    console.error("[contracts] kommenttien haku epäonnistui:", error.message);
    throw new Error("Kommenttien haku epäonnistui.");
  }

  const byUser = new Map<string, { role: "landlord" | "tenant"; name: string | null }>();
  for (const party of (parties ?? []) as Array<{
    user_id: string | null;
    role: "landlord" | "tenant";
    party_name: string | null;
  }>) {
    if (party.user_id) byUser.set(party.user_id, { role: party.role, name: party.party_name });
  }

  return ((comments ?? []) as Array<{
    id: string;
    body: string;
    created_at: string;
    author_user_id: string;
  }>).map((row) => {
    const party = byUser.get(row.author_user_id);
    return {
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      authorUserId: row.author_user_id,
      authorName: party?.name ?? null,
      authorRole: party?.role ?? "tenant",
      isSelf: row.author_user_id === userId,
    };
  });
}

/** Lisää kommentin. Tyhjä ei kelpaa, ja 300 merkkiä on raja kuten muualla. */
export async function addContractComment(
  userId: string,
  tenancyId: string,
  body: string,
): Promise<{ ok: boolean }> {
  await requireTenancyParty(userId, tenancyId);

  const trimmed = body.trim().slice(0, 300);
  if (trimmed === "") return { ok: false };

  const { error } = await getServiceClient()
    .from("rs_contract_comments")
    .insert({ tenancy_id: tenancyId, author_user_id: userId, body: trimmed });

  if (error) {
    console.error("[contracts] kommentin tallennus epäonnistui:", error.message);
    throw new Error("Kommentin tallennus epäonnistui.");
  }

  return { ok: true };
}
