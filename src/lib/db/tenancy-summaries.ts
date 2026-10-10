/**
 * Vuokrasuhteiden tiivistelmät asunto- ja vuokrasuhdelistoille (Jukka 10.10.2026).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: palvelinkoodi, `userId` ensimmäisenä parametrina.
 *    Kyselyt ajetaan `service_role`-avaimella, joten rajaus on tässä:
 *    asunnon vuokrasuhteet vain vuokranantajalle itselleen
 *    (`landlord_user_id`), vuokrasuhdelista vain osapuolelle
 *    (`listTenancies`), osoitteet vain omistajalle (`owner_user_id`).
 * 2. Henkilötieto: vuokralaisen nimi tai sähköposti näytetään vain
 *    vuokranantajalle, joka näkee sen muutenkin vuokrasuhteen sivulla. Ei
 *    lokiteta.
 * 3. Syöte: vain id:itä omista riveistä.
 * 4–7. Ei salaisuuksia; virheissä vain kannan viesti lokiin, ei rivejä.
 *
 * EI N+1-KYSELYITÄ
 *
 * Listat hakevat kaiken muutamalla kyselyllä (`in`), ei jokaiselle riville
 * erikseen. Vanha vuokrasuhdelista haki osoitteen jokaiselle erikseen.
 * ===========================================================================
 */

import { getServiceClient } from "./supabase";
import { listTenancies, type Tenancy, type TenancyStatus } from "./tenancies";
import { formatAddress } from "../property/schema";
import { sortTenancyRows, tenancyActionRequired } from "../property/status";

/** Asunnon vuokrasuhde asuntolistaa ja asunnon sivua varten. */
export interface PropertyTenancySummary {
  id: string;
  propertyId: string;
  status: TenancyStatus;
  startDate: string | null;
  createdAt: string;
  rentAmount: number | null;
  /** Irtisanotun vuokrasuhteen päättymispäivä `VVVV-KK-PP`. */
  endsAt: string | null;
  /** Ensimmäisen vuokralaisen nimi, sähköposti tai `null`. */
  tenantLabel: string | null;
}

interface SummaryRow {
  id: string;
  property_id: string;
  status: TenancyStatus;
  start_date: string | null;
  end_date: string | null;
  notice_ends_at: string | null;
  created_at: string;
  rent_amount: string | number | null;
}

interface TenantRow {
  tenancy_id: string;
  position: number;
  party_name: string | null;
  contact_email: string | null;
  invite_email: string | null;
}

/**
 * Vuokranantajan asuntojen vuokrasuhteet asunnoittain. Kaksi kyselyä
 * asuntojen määrästä riippumatta.
 */
export async function listPropertyTenancies(
  userId: string,
  propertyIds: string[],
): Promise<Map<string, PropertyTenancySummary[]>> {
  const result = new Map<string, PropertyTenancySummary[]>();
  if (propertyIds.length === 0) return result;

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("rs_tenancies")
    .select("id, property_id, status, start_date, end_date, notice_ends_at, created_at, rent_amount")
    .eq("landlord_user_id", userId)
    .in("property_id", propertyIds);

  if (error) {
    console.error("[tiivistelmät] vuokrasuhteiden haku epäonnistui:", error.message);
    throw new Error("Vuokrasuhteiden haku epäonnistui.");
  }

  const rows = (data ?? []) as SummaryRow[];
  const tenants = new Map<string, string>();
  if (rows.length > 0) {
    const { data: parties, error: partyError } = await supabase
      .from("rs_tenancy_parties")
      .select("tenancy_id, position, party_name, contact_email, invite_email")
      .in(
        "tenancy_id",
        rows.map((row) => row.id),
      )
      .eq("role", "tenant")
      .order("position", { ascending: true });

    if (partyError) {
      console.error("[tiivistelmät] osapuolten haku epäonnistui:", partyError.message);
      throw new Error("Vuokrasuhteiden haku epäonnistui.");
    }

    for (const party of (parties ?? []) as TenantRow[]) {
      if (tenants.has(party.tenancy_id)) continue;
      const label = party.party_name?.trim() || party.contact_email || party.invite_email;
      if (label) tenants.set(party.tenancy_id, label);
    }
  }

  for (const row of rows) {
    const summary: PropertyTenancySummary = {
      id: row.id,
      propertyId: row.property_id,
      status: row.status,
      startDate: row.start_date,
      createdAt: row.created_at,
      rentAmount: row.rent_amount === null ? null : Number(row.rent_amount),
      // Irtisanottu päättyy `notice_ends_at`-päivänä; määräaikainen sopimus
      // ilman irtisanomista sovittuna päättymispäivänä.
      endsAt: row.notice_ends_at ?? row.end_date,
      tenantLabel: tenants.get(row.id) ?? null,
    };
    const list = result.get(row.property_id) ?? [];
    list.push(summary);
    result.set(row.property_id, list);
  }

  return result;
}

/** Yksi rivi vuokrasuhdelistalla. */
export interface TenancyListRow {
  tenancy: Tenancy;
  status: TenancyStatus;
  startDate: string | null;
  createdAt: string;
  /** Osoite vain vuokranantajalle; vuokralainen näkee sen vuokrasuhteen sivulla. */
  address: string | null;
  actionRequired: boolean;
}

/**
 * Käyttäjän vuokrasuhteet listaa varten, valmiiksi järjestettynä.
 * Neljä kyselyä vuokrasuhteiden määrästä riippumatta.
 */
export async function listTenancyRows(
  userId: string,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<TenancyListRow[]> {
  const tenancies = await listTenancies(userId);
  if (tenancies.length === 0) return [];

  const supabase = getServiceClient();
  const tenancyIds = tenancies.map((tenancy) => tenancy.id);
  const propertyIds = [...new Set(tenancies.map((tenancy) => tenancy.propertyId))];

  const [properties, inspections, readiness] = await Promise.all([
    supabase
      .from("rs_properties")
      .select("id, street, postal_code, city")
      .in("id", propertyIds)
      .eq("owner_user_id", userId),
    supabase
      .from("rs_inspections")
      .select("tenancy_id, status")
      .in("tenancy_id", tenancyIds)
      .eq("kind", "initial"),
    supabase
      .from("rs_tenancy_parties")
      .select("tenancy_id, inspection_ready_at")
      .in("tenancy_id", tenancyIds)
      .eq("user_id", userId)
      .eq("role", "tenant"),
  ]);

  for (const response of [properties, inspections, readiness]) {
    if (response.error) {
      console.error("[tiivistelmät] listan haku epäonnistui:", response.error.message);
      throw new Error("Vuokrasuhteiden haku epäonnistui.");
    }
  }

  const addresses = new Map<string, string>();
  for (const row of (properties.data ?? []) as { id: string; street: string; postal_code: string; city: string }[]) {
    addresses.set(row.id, formatAddress({ street: row.street, postalCode: row.postal_code, city: row.city }));
  }

  const inspectionStatus = new Map<string, "open" | "locked" | "signed">();
  for (const row of (inspections.data ?? []) as { tenancy_id: string; status: "open" | "locked" | "signed" }[]) {
    inspectionStatus.set(row.tenancy_id, row.status);
  }

  const ready = new Set<string>();
  for (const row of (readiness.data ?? []) as { tenancy_id: string; inspection_ready_at: string | null }[]) {
    if (row.inspection_ready_at) ready.add(row.tenancy_id);
  }

  const rows = tenancies.map((tenancy) => ({
    tenancy,
    status: tenancy.status,
    startDate: tenancy.startDate,
    createdAt: tenancy.createdAt,
    address: addresses.get(tenancy.propertyId) ?? null,
    actionRequired: tenancyActionRequired(
      {
        status: tenancy.status,
        startDate: tenancy.startDate,
        role: tenancy.landlordUserId === userId ? "landlord" : "tenant",
        initialInspection: inspectionStatus.get(tenancy.id) ?? "none",
        selfReady: ready.has(tenancy.id),
      },
      today,
    ),
  }));

  return sortTenancyRows(rows);
}
