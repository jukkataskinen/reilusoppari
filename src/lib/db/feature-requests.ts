/**
 * Kehitystoiveiden tallennus (migraatio 0018).
 *
 * Sovellus ajaa kyselyt service_role-avaimella, joka ohittaa RLS:n (ks.
 * `supabase.ts`). Rajaus on siksi tässä: tavallinen käyttäjä saa vain omat
 * rivinsä (`.eq("user_id", …)`), ja kaikkien toiveiden luku ja käsittely
 * vaativat erillisen `asAdmin`-merkinnän, jonka kutsuja antaa vasta
 * tarkistettuaan käsittelijäoikeuden (`isFeatureRequestAdmin`).
 *
 * Virheissä ei palauteta tietokannan viestiä eikä toiveen tekstiä: toiveessa
 * voi olla omaa vuokrasuhdetta koskevia tietoja.
 */

import { getServiceClient } from "./supabase";
import type { Importance, RequestStatus } from "@/lib/feature-requests";

export interface FeatureRequest {
  id: string;
  userId: string;
  authorEmail: string | null;
  feature: string;
  pagePath: string | null;
  title: string;
  description: string;
  importance: Importance;
  status: RequestStatus;
  response: string | null;
  handledAt: string | null;
  createdAt: string;
}

interface Row {
  id: string;
  user_id: string;
  feature: string;
  page_path: string | null;
  title: string;
  description: string;
  importance: Importance;
  status: RequestStatus;
  response: string | null;
  handled_at: string | null;
  created_at: string;
  author?: { email: string } | null;
}

const COLUMNS = "id, user_id, feature, page_path, title, description, importance, status, response, handled_at, created_at";

function toRequest(row: Row): FeatureRequest {
  return {
    id: row.id,
    userId: row.user_id,
    authorEmail: row.author?.email ?? null,
    feature: row.feature,
    pagePath: row.page_path,
    title: row.title,
    description: row.description,
    importance: row.importance,
    status: row.status,
    response: row.response,
    handledAt: row.handled_at,
    createdAt: row.created_at,
  };
}

/** Kutsujan oikeus: oma käyttäjä, tai käsittelijä joka näkee kaikki. */
export interface Viewer {
  userId: string;
  asAdmin: boolean;
}

export async function createFeatureRequest(
  userId: string,
  input: { feature: string; pagePath: string | null; title: string; description: string; importance: Importance },
): Promise<string> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("rs_feature_requests")
    .insert({
      user_id: userId,
      feature: input.feature,
      page_path: input.pagePath,
      title: input.title,
      description: input.description,
      importance: input.importance,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[kehitystoiveet] tallennus epäonnistui:", error?.message);
    throw new Error("Toiveen tallennus epäonnistui.");
  }

  // Lokiin vain toiminto ja tunniste, ei toiveen tekstiä.
  await supabase.from("rs_audit_log").insert({
    actor_user_id: userId,
    action: "feature_request.create",
    target_type: "feature_request",
    target_id: data.id,
    details: { feature: input.feature },
  });

  return data.id as string;
}

export async function listFeatureRequests(
  viewer: Viewer,
  filter: { statuses: readonly RequestStatus[]; feature?: string | null },
): Promise<FeatureRequest[]> {
  let query = getServiceClient()
    .from("rs_feature_requests")
    .select(`${COLUMNS}, author:rs_users!rs_feature_requests_user_id_fkey(email)`)
    .in("status", [...filter.statuses])
    .order("created_at", { ascending: false })
    .limit(500);

  if (!viewer.asAdmin) query = query.eq("user_id", viewer.userId);
  if (filter.feature) query = query.eq("feature", filter.feature);

  const { data, error } = await query;
  if (error) {
    console.error("[kehitystoiveet] haku epäonnistui:", error.message);
    throw new Error("Toiveiden haku epäonnistui.");
  }
  const rank: Record<Importance, number> = { blocking: 0, important: 1, nice: 2 };
  // Käsittelijälle kiireellisimmät ensin; omassa listassa järjestys on sama.
  return ((data ?? []) as unknown as Row[])
    .map(toRequest)
    .sort((a, b) => rank[a.importance] - rank[b.importance] || b.createdAt.localeCompare(a.createdAt));
}

/** `null`, jos toivetta ei ole tai se ei kuulu kutsujalle. Sama vastaus molemmissa. */
export async function getFeatureRequest(viewer: Viewer, id: string): Promise<FeatureRequest | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  let query = getServiceClient()
    .from("rs_feature_requests")
    .select(`${COLUMNS}, author:rs_users!rs_feature_requests_user_id_fkey(email)`)
    .eq("id", id);
  if (!viewer.asAdmin) query = query.eq("user_id", viewer.userId);

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[kehitystoiveet] haku epäonnistui:", error.message);
    throw new Error("Toiveen haku epäonnistui.");
  }
  return data ? toRequest(data as unknown as Row) : null;
}

/** Tilan ja vastauksen muutos. Vain käsittelijä: kutsuja tarkistaa oikeuden ennen tätä. */
export async function updateFeatureRequest(
  adminUserId: string,
  id: string,
  input: { status: RequestStatus; response: string | null },
): Promise<boolean> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("rs_feature_requests")
    .update({
      status: input.status,
      response: input.response,
      handled_by: adminUserId,
      handled_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[kehitystoiveet] päivitys epäonnistui:", error.message);
    throw new Error("Toiveen päivitys epäonnistui.");
  }
  if (!data) return false;

  await supabase.from("rs_audit_log").insert({
    actor_user_id: adminUserId,
    action: "feature_request.update",
    target_type: "feature_request",
    target_id: id,
    details: { status: input.status },
  });
  return true;
}
