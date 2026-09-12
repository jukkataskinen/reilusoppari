/**
 * Huoltokirja: viat, korjaukset ja merkinnät (CLAUDE.md 5.6).
 *
 * ===========================================================================
 * MERKINTÄÄ EI POISTETA
 *
 * Kumpikaan osapuoli ei voi poistaa merkintää. Virheellisen voi perua, ja
 * peruminen näkyy molemmille: merkintä jää listaan yliviivattuna ja peruja
 * kirjoittaa syyn.
 *
 * Syy on sama kuin katselmuksen kuvilla ja sopimuskeskustelussa. Jos
 * merkinnän voisi poistaa, huoltokirja kertoisi vain sen, mitä poistamatta
 * jättänyt halusi sen kertovan — ja juuri huoltokirja on se, johon
 * loppukatselmuksessa nojataan, kun kysytään milloin vika ilmoitettiin ja
 * milloin se korjattiin.
 *
 * KUMPIKIN KIRJAA, VUOKRANANTAJA MERKITSEE KORJATUKSI
 *
 * Vian voi ilmoittaa kumpi tahansa. Korjatuksi merkitseminen on
 * vuokranantajan, koska hän vastaa korjauksesta (AHVL) ja tietää milloin se
 * on tehty. Vuokralainen voi olla eri mieltä — ja se näkyy kommenttina, joka
 * jää merkinnän viereen.
 * ===========================================================================
 */

import { getServiceClient } from "./supabase";
import { requireTenancyParty } from "./access";
import { getTenancy } from "./tenancies";

export type MaintenanceKind = "defect" | "repair" | "note";
export type PartyRole = "landlord" | "tenant";

export interface MaintenancePhoto {
  id: string;
  storagePath: string;
  sha256: string;
  takenAtServer: string;
  note: string | null;
}

export interface MaintenanceComment {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
  authorRole: PartyRole;
  isSelf: boolean;
}

export interface MaintenanceEntry {
  id: string;
  kind: MaintenanceKind;
  title: string;
  body: string | null;
  createdAt: string;
  authorUserId: string;
  authorName: string | null;
  authorRole: PartyRole;
  isSelf: boolean;
  resolvedAt: string | null;
  resolvedByName: string | null;
  cancelledAt: string | null;
  cancelledByName: string | null;
  photos: MaintenancePhoto[];
  comments: MaintenanceComment[];
}

export const KIND_LABEL: Record<MaintenanceKind, string> = {
  defect: "Vika",
  repair: "Korjaus",
  note: "Merkintä",
};

interface EntryRow {
  id: string;
  kind: MaintenanceKind;
  title: string;
  body: string | null;
  created_at: string;
  author_user_id: string;
  resolved_at: string | null;
  resolved_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
}

interface PartyInfo {
  role: PartyRole;
  name: string | null;
}

/** Osapuolten nimet ja roolit käyttäjätunnisteen mukaan. */
async function partyLookup(tenancyId: string): Promise<Map<string, PartyInfo>> {
  const { data } = await getServiceClient()
    .from("rs_tenancy_parties")
    .select("user_id, role, party_name")
    .eq("tenancy_id", tenancyId);

  const lookup = new Map<string, PartyInfo>();
  for (const row of (data ?? []) as Array<{
    user_id: string | null;
    role: PartyRole;
    party_name: string | null;
  }>) {
    if (row.user_id) lookup.set(row.user_id, { role: row.role, name: row.party_name });
  }
  return lookup;
}

/**
 * Huoltokirjan merkinnät, uusin ensin.
 *
 * Kuvat ja kommentit haetaan samalla: erillinen haku jokaiselle merkinnälle
 * tarkoittaisi kymmeniä kyselyjä yhtä sivunlatausta kohden.
 */
export async function listMaintenanceEntries(
  userId: string,
  tenancyId: string,
): Promise<MaintenanceEntry[]> {
  await requireTenancyParty(userId, tenancyId);

  const supabase = getServiceClient();

  const { data: entries, error } = await supabase
    .from("rs_maintenance_entries")
    .select(
      "id, kind, title, body, created_at, author_user_id, resolved_at, resolved_by, cancelled_at, cancelled_by",
    )
    .eq("tenancy_id", tenancyId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[huoltokirja] merkintöjen haku epäonnistui:", error.message);
    throw new Error("Huoltokirjan haku epäonnistui.");
  }

  const rows = (entries ?? []) as unknown as EntryRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  const [{ data: photos }, { data: comments }, parties] = await Promise.all([
    supabase
      .from("rs_photos")
      .select("id, maintenance_entry_id, storage_path, sha256, taken_at_server, note")
      .in("maintenance_entry_id", ids)
      .order("taken_at_server", { ascending: true }),
    supabase
      .from("rs_maintenance_comments")
      .select("id, entry_id, body, created_at, author_user_id")
      .in("entry_id", ids)
      .order("created_at", { ascending: true }),
    partyLookup(tenancyId),
  ]);

  const photosByEntry = new Map<string, MaintenancePhoto[]>();
  for (const row of (photos ?? []) as Array<{
    id: string;
    maintenance_entry_id: string;
    storage_path: string;
    sha256: string;
    taken_at_server: string;
    note: string | null;
  }>) {
    const list = photosByEntry.get(row.maintenance_entry_id) ?? [];
    list.push({
      id: row.id,
      storagePath: row.storage_path,
      sha256: row.sha256,
      takenAtServer: row.taken_at_server,
      note: row.note,
    });
    photosByEntry.set(row.maintenance_entry_id, list);
  }

  const commentsByEntry = new Map<string, MaintenanceComment[]>();
  for (const row of (comments ?? []) as Array<{
    id: string;
    entry_id: string;
    body: string;
    created_at: string;
    author_user_id: string;
  }>) {
    const party = parties.get(row.author_user_id);
    const list = commentsByEntry.get(row.entry_id) ?? [];
    list.push({
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      authorName: party?.name ?? null,
      authorRole: party?.role ?? "tenant",
      isSelf: row.author_user_id === userId,
    });
    commentsByEntry.set(row.entry_id, list);
  }

  return rows.map((row) => {
    const author = parties.get(row.author_user_id);

    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      createdAt: row.created_at,
      authorUserId: row.author_user_id,
      authorName: author?.name ?? null,
      authorRole: author?.role ?? "tenant",
      isSelf: row.author_user_id === userId,
      resolvedAt: row.resolved_at,
      resolvedByName: row.resolved_by ? (parties.get(row.resolved_by)?.name ?? null) : null,
      cancelledAt: row.cancelled_at,
      cancelledByName: row.cancelled_by ? (parties.get(row.cancelled_by)?.name ?? null) : null,
      photos: photosByEntry.get(row.id) ?? [],
      comments: commentsByEntry.get(row.id) ?? [],
    };
  });
}

export type MaintenanceResult = { ok: true; id: string } | { ok: false; message: string };

/**
 * Uusi merkintä. Kumpi tahansa osapuoli, missä tahansa vuokrasuhteen vaiheessa.
 *
 * Otsikko on pakollinen, kuvaus ei: "Hana vuotaa" riittää merkinnäksi, ja
 * pakollinen kuvauskenttä tuottaisi tekstejä kuten "vuotaa".
 */
export async function createMaintenanceEntry(
  userId: string,
  tenancyId: string,
  kind: MaintenanceKind,
  title: string,
  body: string,
): Promise<MaintenanceResult> {
  await requireTenancyParty(userId, tenancyId);

  const trimmedTitle = title.trim().slice(0, 120);
  if (trimmedTitle === "") return { ok: false, message: "Anna merkinnälle otsikko." };

  const trimmedBody = body.trim().slice(0, 2000);

  const { data, error } = await getServiceClient()
    .from("rs_maintenance_entries")
    .insert({
      tenancy_id: tenancyId,
      kind,
      author_user_id: userId,
      title: trimmedTitle,
      body: trimmedBody === "" ? null : trimmedBody,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[huoltokirja] merkinnän luonti epäonnistui:", error?.message);
    throw new Error("Merkinnän tallennus epäonnistui.");
  }

  return { ok: true, id: data.id };
}

/** Kommentti merkintään. Kumpi tahansa osapuoli, 300 merkkiä kuten muuallakin. */
export async function addMaintenanceComment(
  userId: string,
  tenancyId: string,
  entryId: string,
  body: string,
): Promise<MaintenanceResult> {
  await requireTenancyParty(userId, tenancyId);

  const trimmed = body.trim().slice(0, 300);
  if (trimmed === "") return { ok: false, message: "Kirjoita kommentti ennen lähettämistä." };

  const supabase = getServiceClient();

  // Merkintä on haettava vuokrasuhteen kautta: ilman tätä toisen
  // vuokrasuhteen merkintään voisi kommentoida arvaamalla sen tunnisteen.
  const { data: entry } = await supabase
    .from("rs_maintenance_entries")
    .select("id")
    .eq("id", entryId)
    .eq("tenancy_id", tenancyId)
    .maybeSingle();

  if (!entry) return { ok: false, message: "Merkintää ei löytynyt." };

  const { data, error } = await supabase
    .from("rs_maintenance_comments")
    .insert({ entry_id: entryId, author_user_id: userId, body: trimmed })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[huoltokirja] kommentin tallennus epäonnistui:", error?.message);
    throw new Error("Kommentin tallennus epäonnistui.");
  }

  return { ok: true, id: data.id };
}

/**
 * Merkitsee vian korjatuksi. Vain vuokranantaja.
 *
 * Vuokranantaja vastaa korjauksesta ja tietää milloin se on tehty.
 * Vuokralainen voi olla eri mieltä, ja se näkyy kommenttina merkinnän
 * vieressä — merkintää ei kuitenkaan poisteta kummankaan toimesta.
 */
export async function resolveMaintenanceEntry(
  userId: string,
  tenancyId: string,
  entryId: string,
): Promise<MaintenanceResult> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy) return { ok: false, message: "Vuokrasuhdetta ei löytynyt." };

  if (tenancy.landlordUserId !== userId) {
    return { ok: false, message: "Vain vuokranantaja voi merkitä korjatuksi." };
  }

  const now = new Date().toISOString();
  const { error } = await getServiceClient()
    .from("rs_maintenance_entries")
    .update({ resolved_at: now, resolved_by: userId, updated_at: now })
    .eq("id", entryId)
    .eq("tenancy_id", tenancyId)
    .is("cancelled_at", null);

  if (error) {
    console.error("[huoltokirja] korjatuksi merkintä epäonnistui:", error.message);
    throw new Error("Merkintä ei onnistunut.");
  }

  return { ok: true, id: entryId };
}

/**
 * Peruu merkinnän. Vain sen kirjoittaja.
 *
 * Merkintä ei poistu: se jää listaan peruutettuna, ja syy tallennetaan
 * kommenttina, jonka molemmat näkevät. Peruminen on siis merkinnän
 * korjaamista, ei sen pyyhkimistä.
 *
 * Vain kirjoittaja: toisen merkinnän peruminen olisi sen hiljentämistä.
 */
export async function cancelMaintenanceEntry(
  userId: string,
  tenancyId: string,
  entryId: string,
  reason: string,
): Promise<MaintenanceResult> {
  await requireTenancyParty(userId, tenancyId);

  const trimmed = reason.trim().slice(0, 300);
  if (trimmed === "") return { ok: false, message: "Kerro lyhyesti, miksi merkintä perutaan." };

  const supabase = getServiceClient();

  const { data: entry } = await supabase
    .from("rs_maintenance_entries")
    .select("id, author_user_id, cancelled_at")
    .eq("id", entryId)
    .eq("tenancy_id", tenancyId)
    .maybeSingle();

  const row = entry as { id: string; author_user_id: string; cancelled_at: string | null } | null;
  if (!row) return { ok: false, message: "Merkintää ei löytynyt." };
  if (row.author_user_id !== userId) {
    return { ok: false, message: "Vain merkinnän kirjoittaja voi perua sen." };
  }
  if (row.cancelled_at) return { ok: false, message: "Merkintä on jo peruttu." };

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("rs_maintenance_entries")
    .update({ cancelled_at: now, cancelled_by: userId, updated_at: now })
    .eq("id", entryId);

  if (error) {
    console.error("[huoltokirja] peruminen epäonnistui:", error.message);
    throw new Error("Peruminen ei onnistunut.");
  }

  // Syy kommenttina: se on osa keskustelua eikä piilotettua metatietoa.
  await supabase
    .from("rs_maintenance_comments")
    .insert({ entry_id: entryId, author_user_id: userId, body: `Merkintä peruttu: ${trimmed}` });

  return { ok: true, id: entryId };
}

/** Kirjaa huoltokirjan kuvan. Kutsutaan kun tiedosto on jo Storagessa. */
export async function recordMaintenancePhoto(input: {
  tenancyId: string;
  entryId: string;
  uploaderUserId: string;
  note: string | null;
  storagePath: string;
  sha256: string;
  bytes: number;
  width: number | null;
  height: number | null;
}): Promise<{ id: string }> {
  const { data, error } = await getServiceClient()
    .from("rs_photos")
    .insert({
      tenancy_id: input.tenancyId,
      maintenance_entry_id: input.entryId,
      uploader_user_id: input.uploaderUserId,
      note: input.note,
      storage_path: input.storagePath,
      sha256: input.sha256,
      bytes: input.bytes,
      width: input.width,
      height: input.height,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[huoltokirja] kuvan kirjaus epäonnistui:", error?.message);
    throw new Error("Kuvan tallennus epäonnistui.");
  }

  return { id: data.id };
}

/** Merkintä ja sen vuokrasuhde, jos kutsuja on osapuoli. */
export async function getMaintenanceEntry(
  userId: string,
  tenancyId: string,
  entryId: string,
): Promise<MaintenanceEntry | null> {
  const entries = await listMaintenanceEntries(userId, tenancyId);
  return entries.find((entry) => entry.id === entryId) ?? null;
}
