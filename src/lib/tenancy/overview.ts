/**
 * Vuokrasuhteen sivun tiedot yhdellä kertaa (Jukan palaute 10.10.2026).
 *
 * ===========================================================================
 * KOKOAA, EI PÄÄTÄ
 *
 * Tämä lukee kannasta ja eSinetiltä sen, mitä `next-step.ts` tarvitsee, ja
 * jättää päättelyn sinne. Näin päättely on testattavissa ilman kantaa.
 *
 * eSINETTIÄ KYSYTÄÄN VAIN TARVITTAESSA
 *
 * Oman allekirjoituksen tila on vain eSinetillä. Sitä kysytään vain, kun
 * kierros on lähetetty eikä asiakirjaa ole vielä allekirjoitettu: muuten
 * jokainen sivun lataus odottaisi turhaan toista palvelua. Jos eSinetti ei
 * vastaa, tila on `unknown`, ja sivu kertoo vain, että allekirjoituksia
 * odotetaan.
 *
 * LUKEVA SIVU EI LUO MITÄÄN
 *
 * Katselmuksia ei luoda (`findInspection`, ei `getOrCreateInspection`), eikä
 * vuokralaisen käyntileimaa kirjata: sivun avaaminen ei saa aloittaa
 * katselmusta eikä käynnistää lukituksen 24 tunnin aikaa.
 * ===========================================================================
 */

import { getServiceClient } from "../db/supabase";
import type { Tenancy } from "../db/tenancies";
import { findInspection, type Inspection } from "../db/inspections";
import { getTenancyBillingState } from "../db/billing";
import { listRentPeriods, type RentPeriodRow } from "../db/rent";
import { countOpenDefects } from "../db/maintenance";
import { listExpenses } from "../db/expenses";
import { listCertificates } from "../db/certificates";
import { getEsinettiClient } from "../esinetti";
import { pendingSignerFor } from "../esinetti/signing-link";
import { hasSeparateInspectionRound } from "./signing-plan";
import { listPartyDetails, missingPartyDetails, type PartyDetailsView } from "./party-details";
import { contractTermsSchema } from "./contract-schema";
import {
  contractGaps,
  isContractSigned,
  type InspectionFacts,
  type RentStatus,
  type SignatureState,
  type TenancyRole,
  type TenancyState,
} from "./next-step";

export interface TenancyOverview {
  role: TenancyRole;
  state: TenancyState;
  parties: PartyDetailsView[];
  /** Kuluvan kuun vuokrakausi Vuokranmaksu-riville. */
  currentRent: { periodMonth: string; dueDate: string; status: RentStatus } | null;
  /** Vuokranantajalle: kuluvan vuoden kulut yhteensä. */
  expensesThisYear: number | null;
}

interface ContractRow {
  esinetti_round_id: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
  template_data: unknown;
}

async function contractRow(tenancyId: string): Promise<ContractRow | null> {
  const { data } = await getServiceClient()
    .from("rs_contracts")
    .select("esinetti_round_id, signed_at, created_at, updated_at, template_data")
    .eq("tenancy_id", tenancyId)
    .maybeSingle();
  return (data as ContractRow | null) ?? null;
}

/** Vuokralaisen omat valmiusleimat (alku- ja loppukatselmus). */
async function ownReadiness(
  userId: string,
  tenancyId: string,
): Promise<{ initial: boolean; final: boolean }> {
  const { data } = await getServiceClient()
    .from("rs_tenancy_parties")
    .select("inspection_ready_at, final_inspection_ready_at")
    .eq("tenancy_id", tenancyId)
    .eq("user_id", userId)
    .eq("role", "tenant")
    .limit(1)
    .maybeSingle();
  const row = data as { inspection_ready_at: string | null; final_inspection_ready_at: string | null } | null;
  return { initial: Boolean(row?.inspection_ready_at), final: Boolean(row?.final_inspection_ready_at) };
}

/** Onko kirjautuneen allekirjoitus kierroksella vielä tekemättä? */
async function signatureOn(roundId: string, email: string | null): Promise<SignatureState> {
  try {
    const round = await getEsinettiClient().getRound(roundId);
    return pendingSignerFor(round.signers, email) ? "mine" : "others";
  } catch (err) {
    console.error(
      "[overview] kierroksen haku epäonnistui:",
      err instanceof Error ? err.message : err,
    );
    return "unknown";
  }
}

function confirmationStatus(period: RentPeriodRow): RentStatus {
  return period.confirmation?.status ?? "unconfirmed";
}

function inspectionFacts(
  inspection: Inspection | null,
  signature: SignatureState | null,
  selfReady: boolean,
): InspectionFacts {
  return {
    status: inspection?.status ?? "none",
    sent: Boolean(inspection?.esinettiRoundId),
    signature,
    selfReady,
  };
}

export async function loadTenancyOverview(
  userId: string,
  tenancy: Tenancy,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<TenancyOverview> {
  const role: TenancyRole = tenancy.landlordUserId === userId ? "landlord" : "tenant";
  const id = tenancy.id;

  const [contract, parties, initial, final, billing, readiness] = await Promise.all([
    contractRow(id),
    listPartyDetails(userId, id),
    findInspection(userId, id, "initial"),
    findInspection(userId, id, "final"),
    role === "landlord" ? getTenancyBillingState(id) : Promise.resolve(null),
    role === "tenant" ? ownReadiness(userId, id) : Promise.resolve({ initial: false, final: false }),
  ]);

  const ownEmail = parties.find((party) => party.isSelf)?.email ?? null;
  const own = parties.filter((party) => party.isSelf);
  const others = parties.filter((party) => !party.isSelf);
  // Sähköposti on ehto lähetykselle (`signingReadiness`), joten se lasketaan puutteeksi.
  const missingCount = (rows: PartyDetailsView[]) =>
    missingPartyDetails(rows).length + rows.filter((party) => !party.email).length;

  // Vuokralaisten liittyminen osapuoliriveiltä: liittyneellä on käyttäjä.
  const { data: tenantRows } = await getServiceClient()
    .from("rs_tenancy_parties")
    .select("user_id, joined_at")
    .eq("tenancy_id", id)
    .eq("role", "tenant");
  const tenants = (tenantRows ?? []) as Array<{ user_id: string | null; joined_at: string | null }>;
  const tenantsJoined =
    tenants.length > 0 &&
    tenants.every((row) => row.joined_at !== null && row.user_id !== tenancy.landlordUserId);

  const terms = contractTermsSchema.safeParse(contract?.template_data);
  const termsReviewed = Boolean(
    contract && new Date(contract.updated_at).getTime() - new Date(contract.created_at).getTime() > 1000,
  );

  const contractSent = Boolean(contract?.esinetti_round_id);
  const contractSignedRow = Boolean(contract?.signed_at);
  const signedLike = isContractSigned({
    status: tenancy.status,
    contract: { missing: [], sent: contractSent, signed: contractSignedRow, signature: null },
  });

  // Oman allekirjoituksen tila vain niille kierroksille, jotka ovat kesken.
  const [contractSignature, initialSignature, finalSignature] = await Promise.all([
    contractSent && !signedLike ? signatureOn(contract!.esinetti_round_id!, ownEmail) : Promise.resolve(null),
    signedLike &&
    initial?.status === "locked" &&
    initial.esinettiRoundId &&
    hasSeparateInspectionRound(contract?.esinetti_round_id ?? null, initial.esinettiRoundId)
      ? signatureOn(initial.esinettiRoundId, ownEmail)
      : Promise.resolve(null),
    tenancy.status === "ending" && final?.status === "locked" && final.esinettiRoundId
      ? signatureOn(final.esinettiRoundId, ownEmail)
      : Promise.resolve(null),
  ]);

  const [rentPeriods, openDefects, expenses, certificates] = await Promise.all([
    signedLike ? listRentPeriods(userId, id) : Promise.resolve([] as RentPeriodRow[]),
    signedLike ? countOpenDefects(userId, id) : Promise.resolve(0),
    signedLike && role === "landlord" ? listExpenses(userId, id).catch(() => null) : Promise.resolve(null),
    tenancy.status === "ended" ? listCertificates(userId, id) : Promise.resolve(null),
  ]);

  // Uusin ensin: ensimmäinen, jonka eräpäivä on mennyt.
  const latestDue = rentPeriods.find((period) => period.dueDate <= today) ?? null;
  const thisMonth = rentPeriods.find((period) => period.periodMonth.slice(0, 7) === today.slice(0, 7)) ?? null;

  const year = today.slice(0, 4);
  const expensesThisYear = expenses
    ? expenses.filter((row) => row.date.startsWith(year)).reduce((sum, row) => sum + row.amount, 0)
    : null;

  const state: TenancyState = {
    status: tenancy.status,
    today,
    startDate: tenancy.startDate,
    contract: {
      missing: contractGaps({
        termsReviewed,
        startDate: tenancy.startDate,
        rentAmount: tenancy.rentAmount,
        rentDueDay: tenancy.rentDueDay,
        keysCount: terms.success ? terms.data.keysCount : null,
      }),
      sent: contractSent,
      signed: contractSignedRow,
      signature: contractSignature,
    },
    parties: {
      ownMissing: missingCount(own),
      othersMissing: missingCount(others),
      tenantsJoined,
    },
    paid: Boolean(billing?.paidVia),
    initialInspection: inspectionFacts(initial, initialSignature, readiness.initial),
    finalInspection: inspectionFacts(final, finalSignature, readiness.final),
    rent: latestDue ? { periodMonth: latestDue.periodMonth, status: confirmationStatus(latestDue) } : null,
    openDefects,
    certificates: certificates
      ? {
          canRate: certificates.some((row) => row.canRate),
          canReply: certificates.some((row) => row.canReply),
        }
      : null,
  };

  return {
    role,
    state,
    parties,
    currentRent: thisMonth
      ? { periodMonth: thisMonth.periodMonth, dueDate: thisMonth.dueDate, status: confirmationStatus(thisMonth) }
      : null,
    expensesThisYear,
  };
}
