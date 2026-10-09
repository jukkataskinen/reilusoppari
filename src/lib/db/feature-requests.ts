/**
 * Kehitystoiveiden tallennus (migraatio 0018, laajennettu migraatiolla 0020
 * kehitysehdotusten tilakoneella, docs/kehitysehdotukset.md).
 *
 * Sovellus ajaa kyselyt service_role-avaimella, joka ohittaa RLS:n (ks.
 * `supabase.ts`). Rajaus on siksi tässä: tavallinen käyttäjä saa vain omat
 * rivinsä (`.eq("user_id", …)`), ja kaikkien toiveiden luku ja käsittely
 * vaativat erillisen `asAdmin`-merkinnän, jonka kutsuja antaa vasta
 * tarkistettuaan käsittelijäoikeuden (`isFeatureRequestAdmin`).
 *
 * Virheissä ei palauteta tietokannan viestiä eikä toiveen tekstiä: toiveessa
 * voi olla omaa vuokrasuhdetta koskevia tietoja.
 *
 * Tilaa ei KOSKAAN kirjoiteta suoraan `.update({ status: ... })`:lla tämän
 * tiedoston ulkopuolelta — `transitionFeatureRequest` on ainoa reitti, ja se
 * kysyy sallitun seuraavan tilan `lib/dev-suggestions/state-machine.ts`:stä.
 */

import { getServiceClient } from "./supabase";
import { sendEmail } from "@/lib/notifications/email";
import { nextStatus, type DevSuggestionEvent, type DevSuggestionStatus } from "@/lib/dev-suggestions/state-machine";
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
  approvedDescription: string | null;
  githubIssueNumber: number | null;
  handledAt: string | null;
  createdAt: string;
  /** Valinnainen kuvakaappaus (migraatio 0021). `null`, jos ei lisätty tai liittäminen epäonnistui. */
  screenshotStoragePath: string | null;
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
  approved_description: string | null;
  github_issue_number: number | null;
  handled_at: string | null;
  created_at: string;
  screenshot_storage_path: string | null;
  author?: { email: string } | null;
}

const COLUMNS =
  "id, user_id, feature, page_path, title, description, importance, status, response, approved_description, github_issue_number, handled_at, created_at, screenshot_storage_path";

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
    approvedDescription: row.approved_description,
    githubIssueNumber: row.github_issue_number,
    handledAt: row.handled_at,
    createdAt: row.created_at,
    screenshotStoragePath: row.screenshot_storage_path,
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

  // Ilmoitus koodaajalle (docs/kehitysehdotukset.md kohta 2). Viestissä ei
  // ole ehdotuksen sisältöä eikä jättäjän nimeä, vain linkki — sama syy kuin
  // muissakin sähköposteissa (lib/notifications/email.ts).
  const coderEmail = process.env.KEHITYS_KOODAAJA_EMAIL?.trim();
  if (coderEmail) {
    await sendEmail({
      to: coderEmail,
      title: "Uusi kehitysehdotus",
      body: "Reilusopparissa on uusi kehitysehdotus käsiteltäväksi.",
      path: `/kehitystoiveet/${data.id}`,
    });
  }

  return data.id as string;
}

/**
 * Liittää valinnaisen kuvakaappauksen toiveeseen sen jälkeen, kun tiedosto on
 * jo Storagessa (migraatio 0021). Kutsujan (`actions.ts`) vastuulla on poistaa
 * tiedosto Storagesta, jos tämä palauttaa `false` — rivin kirjaus ja
 * Storage-lataus eivät ole yhdessä transaktiossa.
 *
 * Epäonnistuminen ei saa näkyä käyttäjälle virheenä: toive on tässä
 * vaiheessa jo tallessa, ja kuvakaappaus on spekissä valinnainen
 * (docs/kehitysehdotukset.md).
 */
export async function attachFeatureRequestScreenshot(
  requestId: string,
  photo: { storagePath: string; sha256: string; bytes: number; width: number | null; height: number | null },
): Promise<boolean> {
  const { error } = await getServiceClient()
    .from("rs_feature_requests")
    .update({
      screenshot_storage_path: photo.storagePath,
      screenshot_sha256: photo.sha256,
      screenshot_bytes: photo.bytes,
      screenshot_width: photo.width,
      screenshot_height: photo.height,
    })
    .eq("id", requestId);

  if (error) {
    console.error("[kehitystoiveet] kuvakaappauksen liittäminen epäonnistui:", error.message);
    return false;
  }
  return true;
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

export type TransitionOutcome =
  | { ok: true; status: DevSuggestionStatus }
  | { ok: false; reason: "not_found" | "invalid_transition" };

/**
 * Ainoa reitti tilan vaihtoon. Lukee nykyisen tilan, kysyy sallitun
 * seuraavan tilan tilakoneelta ja kirjoittaa sen — tai palauttaa
 * `invalid_transition`, jos tapahtuma ei sovi nykyiseen tilaan. Käsittelijän
 * tunnus on `null` järjestelmän omille siirtymille (webhook).
 */
async function transitionFeatureRequest(
  id: string,
  event: DevSuggestionEvent,
  actorUserId: string | null,
  patch: Partial<{ response: string | null; approvedDescription: string | null; githubIssueNumber: number | null }> = {},
): Promise<TransitionOutcome> {
  const supabase = getServiceClient();
  const { data: current, error: readError } = await supabase
    .from("rs_feature_requests")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    console.error("[kehitysehdotukset] tilan luku epäonnistui:", readError.message);
    throw new Error("Toiveen päivitys epäonnistui.");
  }
  if (!current) return { ok: false, reason: "not_found" };

  const to = nextStatus(current.status as DevSuggestionStatus, event);
  if (!to) return { ok: false, reason: "invalid_transition" };

  const update: Record<string, unknown> = { status: to, handled_at: new Date().toISOString() };
  if (actorUserId) update.handled_by = actorUserId;
  if ("response" in patch) update.response = patch.response;
  if ("approvedDescription" in patch) update.approved_description = patch.approvedDescription;
  if ("githubIssueNumber" in patch) update.github_issue_number = patch.githubIssueNumber;

  const { error } = await supabase.from("rs_feature_requests").update(update).eq("id", id);
  if (error) {
    console.error("[kehitysehdotukset] päivitys epäonnistui:", error.message);
    throw new Error("Toiveen päivitys epäonnistui.");
  }

  // Lokiin tila ja tapahtuma, ei vastauksen tekstiä.
  await supabase.from("rs_audit_log").insert({
    actor_user_id: actorUserId,
    action: "feature_request.transition",
    target_type: "feature_request",
    target_id: id,
    details: { event, from: current.status, to },
  });

  return { ok: true, status: to };
}

/**
 * Käsittelijä hyväksyy ehdotuksen: tila siirtyy, ja kutsuja (`actions.ts`)
 * vastaa GitHub-issuen luonnista ennen tätä kutsua, koska issue-numero
 * kirjataan samalla.
 */
export async function approveFeatureRequest(
  adminUserId: string,
  id: string,
  input: { approvedDescription: string | null; githubIssueNumber: number | null },
): Promise<TransitionOutcome> {
  return transitionFeatureRequest(id, "hyvaksy", adminUserId, {
    approvedDescription: input.approvedDescription,
    githubIssueNumber: input.githubIssueNumber,
  });
}

/** Hylkäys vastauksella, joka näkyy jättäjälle. */
export async function rejectFeatureRequest(adminUserId: string, id: string, response: string): Promise<TransitionOutcome> {
  return transitionFeatureRequest(id, "hylkaa", adminUserId, { response });
}

/**
 * Käsittelijä vahvistaa testauksen jälkeen, että korjaus toimii. Jättäjälle
 * lähtee viesti (docs/kehitysehdotukset.md kohta 6) — sähköposti on tässä
 * ainoa kanava, koska kehitysehdotus ei ole web push -ilmoitusten piirissä.
 */
export async function confirmSuggestionWorks(adminUserId: string, id: string): Promise<TransitionOutcome> {
  const outcome = await transitionFeatureRequest(id, "toimii", adminUserId);
  if (outcome.ok) {
    const { data } = await getServiceClient()
      .from("rs_feature_requests")
      .select("title, author:rs_users!rs_feature_requests_user_id_fkey(email)")
      .eq("id", id)
      .maybeSingle();
    const email = (data as { title: string; author: { email: string } | null } | null)?.author?.email;
    if (email) {
      await sendEmail({
        to: email,
        title: "Ehdottamasi kohta on korjattu",
        body: `${data!.title}. Voit kokeilla sitä nyt. Jos jokin ei vieläkään toimi, lähetä uusi ehdotus.`,
        path: `/kehitystoiveet/${id}`,
      });
    }
  }
  return outcome;
}

/** Käsittelijä pyytää korjauksen vielä kuntoon. */
export async function requestSuggestionChanges(adminUserId: string, id: string, response: string): Promise<TransitionOutcome> {
  return transitionFeatureRequest(id, "tarvitsee_muutoksen", adminUserId, { response });
}

/** Webhook: PR avattu issueen, joka viittaa ehdotukseen. */
export async function markSuggestionInProgress(id: string): Promise<TransitionOutcome> {
  return transitionFeatureRequest(id, "pr_avattu", null);
}

/**
 * Webhook: issue sulkeutui (PR yhdistetty). Koodaajalle viesti
 * testauspyynnöstä (docs/kehitysehdotukset.md kohta 5).
 */
export async function markSuggestionTestable(id: string): Promise<TransitionOutcome> {
  const outcome = await transitionFeatureRequest(id, "pr_yhdistetty", null);
  const coderEmail = process.env.KEHITYS_KOODAAJA_EMAIL?.trim();
  if (outcome.ok && coderEmail) {
    const { data } = await getServiceClient().from("rs_feature_requests").select("title").eq("id", id).maybeSingle();
    await sendEmail({
      to: coderEmail,
      title: `Testaa: ${data?.title ?? "kehitysehdotus"}`,
      body: "Korjaus on yhdistetty ja odottaa testausta.",
      path: `/kehitystoiveet/${id}`,
    });
  }
  return outcome;
}

/** Webhookin käyttöön: ehdotus, jonka GitHub-issue on annettu numero. `null`, jos ei löydy. */
export async function getFeatureRequestByIssueNumber(issueNumber: number): Promise<FeatureRequest | null> {
  const { data, error } = await getServiceClient()
    .from("rs_feature_requests")
    .select(`${COLUMNS}, author:rs_users!rs_feature_requests_user_id_fkey(email)`)
    .eq("github_issue_number", issueNumber)
    .maybeSingle();
  if (error) {
    console.error("[kehitysehdotukset] haku issue-numerolla epäonnistui:", error.message);
    throw new Error("Toiveen haku epäonnistui.");
  }
  return data ? toRequest(data as unknown as Row) : null;
}

/** Webhookin käyttöön: ehdotukset, joiden issue-numero on jokin annetuista (PR:n rungon viitteet). */
export async function getFeatureRequestsByIssueNumbers(issueNumbers: number[]): Promise<FeatureRequest[]> {
  if (issueNumbers.length === 0) return [];
  const { data, error } = await getServiceClient()
    .from("rs_feature_requests")
    .select(`${COLUMNS}, author:rs_users!rs_feature_requests_user_id_fkey(email)`)
    .in("github_issue_number", issueNumbers);
  if (error) {
    console.error("[kehitysehdotukset] haku issue-numeroilla epäonnistui:", error.message);
    throw new Error("Toiveen haku epäonnistui.");
  }
  return ((data ?? []) as unknown as Row[]).map(toRequest);
}
