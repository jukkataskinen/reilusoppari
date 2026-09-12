/**
 * Yhteydenottolupa ja keskustelut tietokannassa (CLAUDE.md 5.10).
 *
 * ===========================================================================
 * TODISTUKSEN TUNNISTE EI KULJE OSOITTEISSA
 *
 * Keskustelu avataan JAKOLINKIN tunnisteella, ei todistuksen id:llä. Jos
 * id olisi osoitteessa, se päätyisi selainhistoriaan ja linkkeihin — ja
 * vaikka id yksin ei anna pääsyä, sen levittäminen tekisi myöhemmistä
 * virheistä vaarallisempia.
 *
 * KATSELULASKURIA EI KASVATETA TÄÄLLÄ
 *
 * `resolveShare` on tarkoituksella erillinen `findCertificateByShare`:sta:
 * jälkimmäinen kasvattaa katselukertaa, koska sitä kutsutaan kun todistus
 * näytetään. Keskustelun avaaminen ei ole todistuksen katselu, eikä sen
 * pidä näkyä omistajalle uutena katseluna.
 *
 * YHTEYSTIETOJA EI TALLENNETA EIKÄ NÄYTETÄ
 *
 * Keskustelussa näkyy vain nimi, joka on vahvasta tunnistautumisesta
 * todennettu. Sähköpostia, puhelinnumeroa tai osoitetta ei kulje kumpaankaan
 * suuntaan — ei näytöllä eikä näissä tauluissa.
 * ===========================================================================
 */

import { getServiceClient } from "./supabase";
import { hashShareToken, isShareTokenShaped, shareTokenMatches } from "../certificates/share";
import { DEFAULT_MAX_MESSAGES, type ContactPermission } from "../certificates/contact";
import type { CertificateFor } from "../certificates/rules";

export interface ResolvedShare {
  shareId: string;
  certificateId: string;
  tenancyId: string;
  /** Kenelle todistus on kirjoitettu. */
  forRole: CertificateFor;
  /** Luvan antaja: todistuksen KIRJOITTAJA, ei sen omistaja. */
  issuerUserId: string | null;
  permission: ContactPermission;
}

/**
 * Jakolinkin tunniste keskustelua varten.
 *
 * `null` myös vanhentuneelle ja mitätöidylle linkille — sama vastaus kuin
 * olemattomalle, jottei vastaus kerro mitkä tunnisteet ovat olleet olemassa.
 */
export async function resolveShare(
  token: string,
  now: Date = new Date(),
): Promise<ResolvedShare | null> {
  if (!isShareTokenShaped(token)) return null;

  const supabase = getServiceClient();

  const { data } = await supabase
    .from("rs_certificate_shares")
    .select("id, certificate_id, token_hash, expires_at, revoked_at")
    .eq("token_hash", hashShareToken(token))
    .limit(1)
    .maybeSingle();

  const share = data as {
    id: string;
    certificate_id: string;
    token_hash: string;
    expires_at: string;
    revoked_at: string | null;
  } | null;

  if (!share) return null;
  if (!shareTokenMatches(token, share.token_hash)) return null;
  if (share.revoked_at || share.expires_at <= now.toISOString()) return null;

  const { data: certificate } = await supabase
    .from("rs_certificates")
    .select("id, tenancy_id, for_role, sealed_at")
    .eq("id", share.certificate_id)
    .maybeSingle();

  const row = certificate as {
    id: string;
    tenancy_id: string;
    for_role: CertificateFor;
    sealed_at: string | null;
  } | null;

  // Sinetöimättömästä todistuksesta ei keskustella: sen sisältö voi vielä
  // muuttua, eikä keskustelu saa koskea jotain, mitä ei ole lyöty lukkoon.
  if (!row?.sealed_at) return null;

  const [permission, issuerUserId] = await Promise.all([
    contactPermission(row.id),
    issuerOf(row.tenancy_id, row.for_role),
  ]);

  return {
    shareId: share.id,
    certificateId: row.id,
    tenancyId: row.tenancy_id,
    forRole: row.for_role,
    issuerUserId,
    permission,
  };
}

/**
 * Todistuksen kirjoittaja: vastakkaisen roolin osapuoli.
 *
 * Vuokralaisen todistuksen kirjoittaa vuokranantaja ja päinvastoin. Tämä on
 * se henkilö, joka luvan antaa ja jonka kanssa keskustellaan.
 */
async function issuerOf(tenancyId: string, forRole: CertificateFor): Promise<string | null> {
  const { data } = await getServiceClient()
    .from("rs_tenancy_parties")
    .select("user_id")
    .eq("tenancy_id", tenancyId)
    .eq("role", forRole === "tenant" ? "landlord" : "tenant")
    .limit(1)
    .maybeSingle();

  return (data as { user_id: string | null } | null)?.user_id ?? null;
}

/** Luvan tila todistukselle. Puuttuva rivi tarkoittaa, ettei lupaa ole annettu. */
export async function contactPermission(certificateId: string): Promise<ContactPermission> {
  const supabase = getServiceClient();

  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("rs_certificate_contact")
      .select("allowed_at, revoked_at, max_messages")
      .eq("certificate_id", certificateId)
      .maybeSingle(),
    supabase
      .from("rs_certificate_conversations")
      .select("id", { count: "exact", head: true })
      .eq("certificate_id", certificateId),
  ]);

  const row = data as {
    allowed_at: string | null;
    revoked_at: string | null;
    max_messages: number;
  } | null;

  return {
    allowed: row !== null && row.revoked_at === null,
    revokedAt: row?.revoked_at ?? null,
    maxMessages: row?.max_messages ?? DEFAULT_MAX_MESSAGES,
    openedCount: count ?? 0,
  };
}

/**
 * Antaa tai perii luvan. Vain todistuksen KIRJOITTAJA.
 *
 * Peruminen ei poista riviä vaan merkitsee aikaleiman, ja se sulkee avoimet
 * keskustelut uusilta viesteiltä. Viestit jäävät näkyviin — myös
 * vuokralaiselle, jota keskustelu koskee. Poisto olisi tiedon vieminen
 * häneltä.
 */
export async function setContactPermission(input: {
  userId: string;
  certificateId: string;
  allowed: boolean;
  now: Date;
}): Promise<{ ok: boolean; message?: string }> {
  const supabase = getServiceClient();
  const timestamp = input.now.toISOString();

  const { data: certificate } = await supabase
    .from("rs_certificates")
    .select("id, tenancy_id, for_role")
    .eq("id", input.certificateId)
    .maybeSingle();

  const row = certificate as {
    tenancy_id: string;
    for_role: CertificateFor;
  } | null;

  if (!row) return { ok: false, message: "Todistusta ei löytynyt." };

  const issuer = await issuerOf(row.tenancy_id, row.for_role);
  if (issuer !== input.userId) {
    /*
      Luvan antaa todistuksen KIRJOITTAJA, ei sen omistaja. Tämä on helppo
      sekoittaa, koska todistus on omistajan omaisuutta — mutta lupa koskee
      kirjoittajan omaa tavoitettavuutta.
    */
    return { ok: false, message: "Vain todistuksen antaja voi muuttaa tätä lupaa." };
  }

  if (input.allowed) {
    const { error } = await supabase.from("rs_certificate_contact").upsert(
      {
        certificate_id: input.certificateId,
        allowed_by_user_id: input.userId,
        allowed_at: timestamp,
        revoked_at: null,
        updated_at: timestamp,
      },
      { onConflict: "certificate_id" },
    );

    if (error) {
      console.error("[yhteydenotto] luvan tallennus epäonnistui:", error.message);
      return { ok: false, message: "Luvan tallennus epäonnistui." };
    }

    return { ok: true };
  }

  await supabase
    .from("rs_certificate_contact")
    .update({ revoked_at: timestamp, updated_at: timestamp })
    .eq("certificate_id", input.certificateId)
    .is("revoked_at", null);

  // Peruminen sulkee avoimet keskustelut uusilta viesteiltä.
  await supabase
    .from("rs_certificate_conversations")
    .update({ closed_at: timestamp, updated_at: timestamp })
    .eq("certificate_id", input.certificateId)
    .is("closed_at", null);

  return { ok: true };
}

export interface ConversationMessage {
  id: string;
  authorUserId: string;
  authorName: string;
  body: string;
  sentAt: string;
  /** Onko kirjoittaja kysyjä vai luvan antaja? */
  fromAsker: boolean;
}

export interface Conversation {
  id: string;
  certificateId: string;
  tenancyId: string;
  initiatorUserId: string;
  openedAt: string;
  closedAt: string | null;
  /** Kysyjän nimi, tunnistautumisesta todennettu. */
  initiatorName: string;
  /** Luvan antaja eli todistuksen kirjoittaja. */
  issuerUserId: string | null;
  messages: ConversationMessage[];
}

/**
 * Avaa keskustelun. Säännöt on tarkistettava ennen tätä
 * (`certificates/contact.ts`) — tämä kirjoittaa vain rivin.
 */
export async function openConversation(input: {
  certificateId: string;
  shareId: string;
  initiatorUserId: string;
  now: Date;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const { data, error } = await getServiceClient()
    .from("rs_certificate_conversations")
    .insert({
      certificate_id: input.certificateId,
      share_id: input.shareId,
      initiator_user_id: input.initiatorUserId,
      opened_at: input.now.toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    // 23505 = unique_violation: sama kysyjä on jo avannut keskustelun.
    if (error?.code === "23505") {
      return { ok: false, message: "Sinulla on jo keskustelu tästä todistuksesta." };
    }

    console.error("[yhteydenotto] keskustelun avaus epäonnistui:", error?.message);
    return { ok: false, message: "Keskustelua ei voitu avata." };
  }

  return { ok: true, id: data.id };
}

/**
 * Keskustelu viesteineen, jos kutsujalla on oikeus nähdä se.
 *
 * Kolme, jotka saavat: kysyjä, luvan antaja ja se, JOSTA keskustellaan.
 * Kolmas on tarkoituksellinen (CLAUDE.md 5.10): keskustelu käydään hänestä,
 * eikä hänen selkänsä takana kerätä tietoa palvelun sisällä.
 */
export async function getConversation(
  userId: string,
  conversationId: string,
): Promise<Conversation | null> {
  const supabase = getServiceClient();

  const { data } = await supabase
    .from("rs_certificate_conversations")
    .select("id, certificate_id, share_id, initiator_user_id, opened_at, closed_at")
    .eq("id", conversationId)
    .maybeSingle();

  const row = data as {
    id: string;
    certificate_id: string;
    initiator_user_id: string;
    opened_at: string;
    closed_at: string | null;
  } | null;

  if (!row) return null;

  const { data: certificate } = await supabase
    .from("rs_certificates")
    .select("tenancy_id, for_role")
    .eq("id", row.certificate_id)
    .maybeSingle();

  const cert = certificate as { tenancy_id: string; for_role: CertificateFor } | null;
  if (!cert) return null;

  const [issuerUserId, subjectUserId] = await Promise.all([
    issuerOf(cert.tenancy_id, cert.for_role),
    subjectOf(cert.tenancy_id, cert.for_role),
  ]);

  const mayView =
    userId === row.initiator_user_id || userId === issuerUserId || userId === subjectUserId;

  if (!mayView) return null;

  const { data: messages } = await supabase
    .from("rs_certificate_conversation_messages")
    .select("id, author_user_id, body, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true });

  const rows = (messages ?? []) as Array<{
    id: string;
    author_user_id: string;
    body: string;
    sent_at: string;
  }>;

  const names = await namesFor([
    row.initiator_user_id,
    ...rows.map((message) => message.author_user_id),
  ]);

  return {
    id: row.id,
    certificateId: row.certificate_id,
    tenancyId: cert.tenancy_id,
    initiatorUserId: row.initiator_user_id,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    initiatorName: names.get(row.initiator_user_id) ?? "Tunnistautunut kysyjä",
    issuerUserId,
    messages: rows.map((message) => ({
      id: message.id,
      authorUserId: message.author_user_id,
      authorName: names.get(message.author_user_id) ?? "",
      body: message.body,
      sentAt: message.sent_at,
      fromAsker: message.author_user_id === row.initiator_user_id,
    })),
  };
}

/** Se, JOSTA todistus kertoo. Näkee keskustelun kokonaisuudessaan. */
async function subjectOf(tenancyId: string, forRole: CertificateFor): Promise<string | null> {
  const { data } = await getServiceClient()
    .from("rs_tenancy_parties")
    .select("user_id")
    .eq("tenancy_id", tenancyId)
    .eq("role", forRole)
    .limit(1)
    .maybeSingle();

  return (data as { user_id: string | null } | null)?.user_id ?? null;
}

/**
 * Nimet keskusteluun.
 *
 * `rs_users.name` on se, joka on vahvasta tunnistautumisesta todennettu
 * (`identity_verified_at`). Sähköpostia EI haeta eikä palauteta: se olisi
 * yhteystieto, jota ei saa näyttää toiselle osapuolelle.
 */
async function namesFor(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();

  const { data } = await getServiceClient()
    .from("rs_users")
    .select("id, name")
    .in("id", unique);

  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; name: string | null }>) {
    if (row.name) map.set(row.id, row.name);
  }
  return map;
}

/** Kirjoittaa viestin. Säännöt on tarkistettava ennen tätä. */
export async function addMessage(input: {
  conversationId: string;
  authorUserId: string;
  body: string;
  now: Date;
}): Promise<boolean> {
  const { error } = await getServiceClient()
    .from("rs_certificate_conversation_messages")
    .insert({
      conversation_id: input.conversationId,
      author_user_id: input.authorUserId,
      body: input.body,
      sent_at: input.now.toISOString(),
    });

  if (error) {
    console.error("[yhteydenotto] viestin tallennus epäonnistui:", error.message);
    return false;
  }

  return true;
}

export interface ConversationSummary {
  id: string;
  openedAt: string;
  closedAt: string | null;
  initiatorName: string;
  messageCount: number;
}

/**
 * Vuokrasuhteen todistuksiin liittyvät keskustelut.
 *
 * Näkyvät molemmille osapuolille: sekä sille, joka luvan antoi, että sille,
 * josta keskustellaan.
 */
export async function listConversations(
  userId: string,
  tenancyId: string,
): Promise<ConversationSummary[]> {
  const supabase = getServiceClient();

  const { data: parties } = await supabase
    .from("rs_tenancy_parties")
    .select("user_id")
    .eq("tenancy_id", tenancyId);

  const isParty = ((parties ?? []) as Array<{ user_id: string | null }>).some(
    (party) => party.user_id === userId,
  );

  if (!isParty) return [];

  const { data: certificates } = await supabase
    .from("rs_certificates")
    .select("id")
    .eq("tenancy_id", tenancyId);

  const ids = ((certificates ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("rs_certificate_conversations")
    .select("id, initiator_user_id, opened_at, closed_at")
    .in("certificate_id", ids)
    .order("opened_at", { ascending: false });

  const rows = (data ?? []) as Array<{
    id: string;
    initiator_user_id: string;
    opened_at: string;
    closed_at: string | null;
  }>;

  if (rows.length === 0) return [];

  const [names, counts] = await Promise.all([
    namesFor(rows.map((row) => row.initiator_user_id)),
    messageCounts(rows.map((row) => row.id)),
  ]);

  return rows.map((row) => ({
    id: row.id,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    initiatorName: names.get(row.initiator_user_id) ?? "Tunnistautunut kysyjä",
    messageCount: counts.get(row.id) ?? 0,
  }));
}

/** Viestien määrä keskusteluittain. */
async function messageCounts(conversationIds: string[]): Promise<Map<string, number>> {
  const { data } = await getServiceClient()
    .from("rs_certificate_conversation_messages")
    .select("conversation_id")
    .in("conversation_id", conversationIds);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ conversation_id: string }>) {
    counts.set(row.conversation_id, (counts.get(row.conversation_id) ?? 0) + 1);
  }
  return counts;
}

/** Onko kysyjällä jo keskustelu tästä todistuksesta? */
export async function hasConversation(
  certificateId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await getServiceClient()
    .from("rs_certificate_conversations")
    .select("id")
    .eq("certificate_id", certificateId)
    .eq("initiator_user_id", userId)
    .limit(1)
    .maybeSingle();

  return (data as { id: string } | null)?.id ?? null;
}
