/**
 * Katselmus ja sen kuvat (CLAUDE.md 5.3).
 *
 * ===========================================================================
 * KUVAA EI VOI POISTAA EIKÄ MUUTTAA
 *
 * Kumpikaan osapuoli ei voi poistaa kuvaa eikä muokata sitä. Se on koko
 * katselmuksen arvon ehto: jos kuvan voisi poistaa, pöytäkirja kertoisi vain
 * sen, mitä poistamatta jättänyt halusi sen kertovan.
 *
 * Virheellisen kuvan voi merkitä "ei kuulu tähän" (`flagged_by`), ja merkintä
 * näkyy molemmille. Kuva jää silti pöytäkirjaan — merkittynä.
 *
 * AIKALEIMA ON PALVELIMEN
 *
 * `taken_at_server` on kannan oletusarvo. Puhelimen ilmoittamaa kuvausaikaa
 * ei tallenneta eikä kysytä: puhelimen kelloa voi siirtää, ja koko
 * katselmuksen arvo perustuu siihen, että aika on riidaton.
 * ===========================================================================
 */

import { getServiceClient } from "./supabase";
import { requireTenancyParty } from "./access";
import { canLockInspection, type LockDecision, type LockState } from "../inspection/lock";

export type InspectionKind = "initial" | "final";
export type InspectionStatus = "open" | "locked" | "signed";
export type PartyRole = "landlord" | "tenant";

export interface InspectionPhotoRow {
  id: string;
  room: string | null;
  note: string | null;
  storagePath: string;
  sha256: string;
  takenAtServer: string;
  uploaderUserId: string;
  uploaderName: string | null;
  uploaderRole: PartyRole;
  flagged: boolean;
  flaggedReason: string | null;
}

export interface Inspection {
  id: string;
  tenancyId: string;
  kind: InspectionKind;
  status: InspectionStatus;
  lockedAt: string | null;
  esinettiRoundId: string | null;
  sealedSha256: string | null;
  sealedPath: string | null;
  signedAt: string | null;
}

const COLUMNS =
  "id, tenancy_id, kind, status, locked_at, esinetti_round_id, sealed_sha256, sealed_path, signed_at";

interface InspectionRow {
  id: string;
  tenancy_id: string;
  kind: InspectionKind;
  status: InspectionStatus;
  locked_at: string | null;
  esinetti_round_id: string | null;
  sealed_sha256: string | null;
  sealed_path: string | null;
  signed_at: string | null;
}

function fromRow(row: InspectionRow): Inspection {
  return {
    id: row.id,
    tenancyId: row.tenancy_id,
    kind: row.kind,
    status: row.status,
    lockedAt: row.locked_at,
    esinettiRoundId: row.esinetti_round_id,
    sealedSha256: row.sealed_sha256,
    sealedPath: row.sealed_path,
    signedAt: row.signed_at,
  };
}

/**
 * Katselmus, tai luo se jos sitä ei vielä ole.
 *
 * Kumpi tahansa osapuoli voi avata katselmuksen: vuokralainen voi olla
 * ensimmäinen, joka ehtii kuvata. `unique (tenancy_id, kind)` ratkaisee
 * kilpajuoksun, jos molemmat avaavat sen samalla sekunnilla.
 */
export async function getOrCreateInspection(
  userId: string,
  tenancyId: string,
  kind: InspectionKind = "initial",
): Promise<Inspection> {
  await requireTenancyParty(userId, tenancyId);

  const supabase = getServiceClient();

  const { data: existing, error: readError } = await supabase
    .from("rs_inspections")
    .select(COLUMNS)
    .eq("tenancy_id", tenancyId)
    .eq("kind", kind)
    .maybeSingle();

  if (readError) {
    console.error("[inspections] haku epäonnistui:", readError.message);
    throw new Error("Katselmuksen haku epäonnistui.");
  }

  if (existing) return fromRow(existing as unknown as InspectionRow);

  const { data, error } = await supabase
    .from("rs_inspections")
    .upsert({ tenancy_id: tenancyId, kind, status: "open" }, { onConflict: "tenancy_id,kind" })
    .select(COLUMNS)
    .single();

  if (error || !data) {
    console.error("[inspections] luonti epäonnistui:", error?.message);
    throw new Error("Katselmuksen luonti epäonnistui.");
  }

  return fromRow(data as unknown as InspectionRow);
}

/**
 * Merkitsee, että vuokralainen on nähnyt katselmuksen.
 *
 * Tästä alkaa se 24 tunnin aika, jonka jälkeen vuokranantaja voi lukita
 * katselmuksen ilman vuokralaisen kuittausta (`inspection/lock.ts`). Leima
 * kirjoitetaan vain kerran: muuten jokainen käynti siirtäisi määräaikaa
 * eteenpäin, eikä lukitus tulisi koskaan mahdolliseksi.
 */
export async function markTenantSeenInspection(userId: string, tenancyId: string): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase
    .from("rs_tenancy_parties")
    .update({ first_seen_inspection_at: new Date().toISOString() })
    .eq("tenancy_id", tenancyId)
    .eq("user_id", userId)
    .eq("role", "tenant")
    .is("first_seen_inspection_at", null);

  if (error) console.error("[inspections] käyntileiman kirjaus epäonnistui:", error.message);
}

/** Vuokralainen merkitsee olevansa valmis. Lukitus on sen jälkeen mahdollinen heti. */
export async function markTenantReady(userId: string, tenancyId: string): Promise<void> {
  await requireTenancyParty(userId, tenancyId);

  const { error } = await getServiceClient()
    .from("rs_tenancy_parties")
    .update({ inspection_ready_at: new Date().toISOString() })
    .eq("tenancy_id", tenancyId)
    .eq("user_id", userId)
    .eq("role", "tenant");

  if (error) {
    console.error("[inspections] valmiiksi merkintä epäonnistui:", error.message);
    throw new Error("Merkintä ei onnistunut.");
  }
}

interface PhotoRow {
  id: string;
  room: string | null;
  note: string | null;
  storage_path: string;
  sha256: string;
  taken_at_server: string;
  uploader_user_id: string;
  flagged_by: string | null;
  flagged_reason: string | null;
}

/**
 * Katselmuksen kuvat aikajärjestyksessä.
 *
 * Kuvaajan nimi ja rooli haetaan osapuoliriveiltä eikä `rs_users`-taulusta:
 * sopimuksessa lukeva nimi on se, joka pöytäkirjaan kuuluu. Jos osapuolirivin
 * nimi puuttuu, jää tyhjäksi — keksitty nimi olisi pöytäkirjassa pahempi kuin
 * puuttuva.
 */
export async function listInspectionPhotos(
  userId: string,
  tenancyId: string,
  inspectionId: string,
): Promise<InspectionPhotoRow[]> {
  await requireTenancyParty(userId, tenancyId);

  const supabase = getServiceClient();

  const [{ data: photos, error }, { data: parties }] = await Promise.all([
    supabase
      .from("rs_photos")
      .select(
        "id, room, note, storage_path, sha256, taken_at_server, uploader_user_id, flagged_by, flagged_reason",
      )
      .eq("inspection_id", inspectionId)
      .eq("tenancy_id", tenancyId)
      .order("taken_at_server", { ascending: true }),
    supabase
      .from("rs_tenancy_parties")
      .select("user_id, role, party_name")
      .eq("tenancy_id", tenancyId),
  ]);

  if (error) {
    console.error("[inspections] kuvien haku epäonnistui:", error.message);
    throw new Error("Kuvien haku epäonnistui.");
  }

  const byUser = new Map<string, { role: PartyRole; name: string | null }>();
  for (const party of (parties ?? []) as Array<{
    user_id: string | null;
    role: PartyRole;
    party_name: string | null;
  }>) {
    if (party.user_id) byUser.set(party.user_id, { role: party.role, name: party.party_name });
  }

  return ((photos ?? []) as unknown as PhotoRow[]).map((row) => {
    const party = byUser.get(row.uploader_user_id);
    return {
      id: row.id,
      room: row.room,
      note: row.note,
      storagePath: row.storage_path,
      sha256: row.sha256,
      takenAtServer: row.taken_at_server,
      uploaderUserId: row.uploader_user_id,
      uploaderName: party?.name ?? null,
      uploaderRole: party?.role ?? "tenant",
      flagged: row.flagged_by !== null,
      flaggedReason: row.flagged_reason,
    };
  });
}

/**
 * Kirjaa tallennetun kuvan.
 *
 * Kutsutaan vasta kun tiedosto on Storagessa ja metatiedot poistettu
 * (`photos/strip-metadata.ts`). Tiiviste lasketaan siitä tiedostosta, joka
 * tallennettiin — ei siitä, joka lähetettiin.
 */
export async function recordInspectionPhoto(input: {
  tenancyId: string;
  inspectionId: string;
  uploaderUserId: string;
  room: string;
  note: string | null;
  storagePath: string;
  sha256: string;
  bytes: number;
  width: number | null;
  height: number | null;
}): Promise<{ id: string; takenAtServer: string }> {
  const { data, error } = await getServiceClient()
    .from("rs_photos")
    .insert({
      tenancy_id: input.tenancyId,
      inspection_id: input.inspectionId,
      uploader_user_id: input.uploaderUserId,
      room: input.room,
      note: input.note,
      storage_path: input.storagePath,
      sha256: input.sha256,
      bytes: input.bytes,
      width: input.width,
      height: input.height,
    })
    .select("id, taken_at_server")
    .single();

  if (error || !data) {
    console.error("[inspections] kuvan kirjaus epäonnistui:", error?.message);
    throw new Error("Kuvan tallennus epäonnistui.");
  }

  return { id: data.id, takenAtServer: data.taken_at_server };
}

/** Merkitsee kuvan kuulumattomaksi. Kuva ei poistu — merkintä näkyy molemmille. */
export async function flagPhoto(
  userId: string,
  tenancyId: string,
  photoId: string,
  reason: string | null,
): Promise<void> {
  await requireTenancyParty(userId, tenancyId);

  const { error } = await getServiceClient()
    .from("rs_photos")
    .update({ flagged_by: userId, flagged_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", photoId)
    .eq("tenancy_id", tenancyId);

  if (error) {
    console.error("[inspections] merkintä epäonnistui:", error.message);
    throw new Error("Merkintä ei onnistunut.");
  }
}

export interface InspectionOverview {
  inspection: Inspection;
  photos: InspectionPhotoRow[];
  isLandlord: boolean;
  lock: LockDecision;
  lockState: LockState;
}

/**
 * Kaikki, mitä katselmusnäkymä tarvitsee, yhdellä kutsulla.
 *
 * Yksi funktio eikä viisi: sivu tarvitsee nämä aina yhdessä, ja erilliset
 * kutsut tarkoittaisivat erillisiä osapuolitarkistuksia — eli enemmän
 * kierroksia tietokantaan kuin tietoa.
 */
export async function getInspectionOverview(
  userId: string,
  tenancyId: string,
  kind: InspectionKind = "initial",
): Promise<InspectionOverview> {
  const inspection = await getOrCreateInspection(userId, tenancyId, kind);

  const supabase = getServiceClient();
  const { data: parties } = await supabase
    .from("rs_tenancy_parties")
    .select("user_id, role, joined_at, first_seen_inspection_at, inspection_ready_at")
    .eq("tenancy_id", tenancyId);

  const rows = (parties ?? []) as Array<{
    user_id: string | null;
    role: PartyRole;
    joined_at: string | null;
    first_seen_inspection_at: string | null;
    inspection_ready_at: string | null;
  }>;

  const isLandlord = rows.some((row) => row.user_id === userId && row.role === "landlord");
  const tenants = rows.filter((row) => row.role === "tenant");

  // Jos vuokralaisia on kaksi, odotetaan hitainta: kummallakin on oltava
  // sama mahdollisuus lisätä omansa.
  const tenantJoined = tenants.length > 0 && tenants.every((row) => row.joined_at !== null);
  /*
    Kahden vuokralaisen tapauksessa odotetaan hitainta.

    `null`, jos yksikin ei ole vielä avannut katselmusta: silloin lukitus
    estyy. Muuten myöhäisin leima, koska määräaika lasketaan siitä
    vuokralaisesta, joka näki näkymän viimeisenä.
  */
  const seenTimes = tenants.map((row) => row.first_seen_inspection_at);
  const firstSeen = seenTimes.some((value) => value === null)
    ? null
    : (seenTimes as string[]).sort().at(-1) ?? null;

  const readyTimes = tenants.map((row) => row.inspection_ready_at);
  const allReady =
    tenants.length > 0 && readyTimes.every((value) => value !== null)
      ? (readyTimes as string[]).sort().at(-1)!
      : null;

  if (!isLandlord) await markTenantSeenInspection(userId, tenancyId);

  const photos = await listInspectionPhotos(userId, tenancyId, inspection.id);

  const lockState: LockState = {
    isLandlord,
    status: inspection.status,
    photoCount: photos.length,
    tenantFirstSeenAt: firstSeen,
    tenantReadyAt: allReady,
    tenantJoined,
    now: new Date(),
  };

  return { inspection, photos, isLandlord, lock: canLockInspection(lockState), lockState };
}

/**
 * Lukitsee katselmuksen.
 *
 * Sääntö tarkistetaan tässä uudelleen eikä luoteta siihen, että
 * käyttöliittymä piilotti napin: nappi on vihje, tarkistus on portti.
 */
export async function lockInspection(
  userId: string,
  tenancyId: string,
  kind: InspectionKind = "initial",
): Promise<LockDecision> {
  const overview = await getInspectionOverview(userId, tenancyId, kind);
  if (!overview.lock.allowed) return overview.lock;

  const { error } = await getServiceClient()
    .from("rs_inspections")
    .update({
      status: "locked",
      locked_at: new Date().toISOString(),
      locked_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", overview.inspection.id)
    .eq("status", "open");

  if (error) {
    console.error("[inspections] lukitus epäonnistui:", error.message);
    throw new Error("Lukitus ei onnistunut.");
  }

  return { allowed: true };
}

/**
 * Lyhytikäinen katselulinkki kuvaan (CLAUDE.md kohta 6: enintään tunti).
 *
 * Linkkiä ei tallenneta mihinkään eikä sitä saa laittaa asiakirjaan: se
 * vanhenee, ja vanhentunut linkki asiakirjassa näyttää siltä kuin kuva olisi
 * hävinnyt.
 */
export async function photoUrl(storagePath: string, seconds = 3600): Promise<string | null> {
  const { data, error } = await getServiceClient()
    .storage.from("photos")
    .createSignedUrl(storagePath, seconds);

  if (error || !data) {
    console.error("[inspections] katselulinkin luonti epäonnistui:", error?.message);
    return null;
  }

  return data.signedUrl;
}

/** Kuvan tavut asiakirjaa varten. Palauttaa `null`, jos tiedostoa ei ole. */
export async function downloadPhoto(storagePath: string): Promise<Uint8Array | null> {
  const { data, error } = await getServiceClient().storage.from("photos").download(storagePath);

  if (error || !data) {
    console.error("[inspections] kuvan lataus epäonnistui:", error?.message);
    return null;
  }

  return new Uint8Array(await data.arrayBuffer());
}
