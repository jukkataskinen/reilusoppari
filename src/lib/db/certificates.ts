/**
 * Vuokratodistukset: arviot, vastineet ja tilastot (CLAUDE.md 5.8).
 *
 * ===========================================================================
 * TODISTUS KUULUU SILLE, JOSTA SE KERTOO
 *
 * `for_role` on todistuksen kohde, ei sen kirjoittaja. Vuokranantajan arvio
 * päätyy vuokralaisen todistukseen, ja vuokralainen jakaa sitä eteenpäin
 * seuraavalle vuokranantajalle. Siksi rivin omistaja on kohde.
 *
 * TILASTOT OVAT TOSIASIOITA, ARVIO ON MIELIPIDE
 *
 * Tilastot kootaan kuittauksista, huoltokirjasta ja vakuuden palautuksesta.
 * Ne ovat sitä, mitä vuokrasuhteessa tapahtui. Arvio on sen päälle tuleva
 * ihmisen kanta, ja todistus erottaa ne toisistaan — siksi tilastot syntyvät
 * automaattisesti eikä niitä voi muokata.
 * ===========================================================================
 */

import { getServiceClient } from "./supabase";
import { requireTenancyParty } from "./access";
import { getTenancy } from "./tenancies";
import {
  canGiveRating,
  canReply,
  certificateStage,
  certificateSubject,
  replyDeadline,
  type CertificateFor,
  type CertificateStage,
  type Rating,
} from "../certificates/rules";
import { summarizeRentHistory, type PaidPeriod } from "../rent/history";
import {
  createShareToken,
  hashShareToken,
  isShareExpired,
  isShareTokenShaped,
  shareTokenMatches,
} from "../certificates/share";

export interface CertificateStatsData {
  months: number;
  rentPeriods: number;
  rentOnTime: number;
  rentSlightlyLate: number;
  rentDelayed: number;
  defectsReported: number;
  defectsResolved: number;
  depositReturnedFull?: boolean;
}

export interface CertificateRow {
  id: string;
  forRole: CertificateFor;
  rating: Rating;
  comment: string | null;
  commentAt: string | null;
  reply: string | null;
  replyAt: string | null;
  sealedAt: string | null;
  sealedSha256: string | null;
  sealedPath: string | null;
  stats: CertificateStatsData | null;
  stage: CertificateStage;
  /** Onko kirjautunut käyttäjä tämän todistuksen kohde? */
  isMine: boolean;
  /** Saako hän antaa arvion tästä todistuksesta (eli arvioi toista)? */
  canRate: boolean;
  canReply: boolean;
  replyBy: string | null;
}

interface Row {
  id: string;
  for_role: CertificateFor;
  rating: Rating;
  comment: string | null;
  comment_at: string | null;
  reply: string | null;
  reply_at: string | null;
  sealed_at: string | null;
  sealed_sha256: string | null;
  sealed_path: string | null;
  stats: CertificateStatsData | null;
}

const COLUMNS =
  "id, for_role, rating, comment, comment_at, reply, reply_at, sealed_at, sealed_sha256, sealed_path, stats";

/** Loppukatselmuksen allekirjoitushetki. Todistusten koko aikataulu lähtee siitä. */
async function finalSignedAt(tenancyId: string): Promise<string | null> {
  const { data } = await getServiceClient()
    .from("rs_inspections")
    .select("signed_at")
    .eq("tenancy_id", tenancyId)
    .eq("kind", "final")
    .maybeSingle();

  return (data as { signed_at: string | null } | null)?.signed_at ?? null;
}

/**
 * Molemmat todistukset. Rivit luodaan tarvittaessa.
 *
 * Rivit syntyvät heti kun loppukatselmus on allekirjoitettu — myös silloin,
 * kun kumpikaan ei anna arviota. Todistus syntyy aina (CLAUDE.md 5.8).
 */
export async function listCertificates(
  userId: string,
  tenancyId: string,
  now: Date = new Date(),
): Promise<CertificateRow[]> {
  await requireTenancyParty(userId, tenancyId);

  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy) return [];

  const signedAt = await finalSignedAt(tenancyId);
  const supabase = getServiceClient();

  if (signedAt) {
    // `ignoreDuplicates`: rivit voivat olla jo olemassa, ja kahden
    // rinnakkaisen sivulatauksen ei pidä kaataa kumpaakaan.
    await supabase.from("rs_certificates").upsert(
      [
        { tenancy_id: tenancyId, for_role: "tenant" },
        { tenancy_id: tenancyId, for_role: "landlord" },
      ],
      { onConflict: "tenancy_id,for_role", ignoreDuplicates: true },
    );
  }

  const { data, error } = await supabase
    .from("rs_certificates")
    .select(COLUMNS)
    .eq("tenancy_id", tenancyId);

  if (error) {
    console.error("[todistukset] haku epäonnistui:", error.message);
    throw new Error("Todistusten haku epäonnistui.");
  }

  const myRole: CertificateFor = tenancy.landlordUserId === userId ? "landlord" : "tenant";

  return ((data ?? []) as unknown as Row[]).map((row) => {
    const state = {
      signedAt,
      commentAt: row.comment_at,
      rating: row.rating,
      replyAt: row.reply_at,
      sealedAt: row.sealed_at,
      now,
    };

    const isMine = row.for_role === myRole;

    return {
      id: row.id,
      forRole: row.for_role,
      rating: row.rating,
      comment: row.comment,
      commentAt: row.comment_at,
      reply: row.reply,
      replyAt: row.reply_at,
      sealedAt: row.sealed_at,
      sealedSha256: row.sealed_sha256,
      sealedPath: row.sealed_path,
      stats: row.stats,
      stage: certificateStage(state),
      isMine,
      // Arvion antaa se, joka EI ole kohde: arvio on toisesta ihmisestä.
      canRate: !isMine && canGiveRating(state),
      canReply: isMine && canReply(state),
      replyBy: replyDeadline(row.comment_at)?.toISOString() ?? null,
    };
  });
}

export type CertificateResult = { ok: true } | { ok: false; message: string };

/**
 * Antaa tai muuttaa arvion toisesta osapuolesta.
 *
 * Arvio on kaksiarvoinen: `recommend` tai ei arviota. Kielteistä vaihtoehtoa
 * ei ole, eikä puuttuva arvio näy todistuksessa mitenkään.
 */
export async function giveRating(
  userId: string,
  tenancyId: string,
  rating: Rating,
  comment: string,
  now: Date = new Date(),
): Promise<CertificateResult> {
  await requireTenancyParty(userId, tenancyId);

  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy) return { ok: false, message: "Vuokrasuhdetta ei löytynyt." };

  const myRole: CertificateFor = tenancy.landlordUserId === userId ? "landlord" : "tenant";
  const subject = certificateSubject(myRole);

  const certificates = await listCertificates(userId, tenancyId, now);
  const target = certificates.find((certificate) => certificate.forRole === subject);

  if (!target) {
    return {
      ok: false,
      message: "Arvion voi antaa vasta, kun loppukatselmus on allekirjoitettu.",
    };
  }
  if (!target.canRate) {
    return {
      ok: false,
      message: target.sealedAt
        ? "Todistus on jo sinetöity."
        : "Arviota ei voi enää muuttaa: toinen osapuoli on antanut vastineensa.",
    };
  }

  const trimmed = comment.trim().slice(0, 300);
  const timestamp = now.toISOString();

  const { error } = await getServiceClient()
    .from("rs_certificates")
    .update({
      rating,
      comment: trimmed === "" ? null : trimmed,
      comment_by: userId,
      comment_at: timestamp,
      reply_deadline: replyDeadline(timestamp)?.toISOString() ?? null,
      updated_at: timestamp,
    })
    .eq("id", target.id);

  if (error) {
    console.error("[todistukset] arvion tallennus epäonnistui:", error.message);
    throw new Error("Arvion tallennus epäonnistui.");
  }

  return { ok: true };
}

/** Vastine omaan todistukseen. Enintään 300 merkkiä, kerran. */
export async function addReply(
  userId: string,
  tenancyId: string,
  reply: string,
  now: Date = new Date(),
): Promise<CertificateResult> {
  const certificates = await listCertificates(userId, tenancyId, now);
  const mine = certificates.find((certificate) => certificate.isMine);

  if (!mine) return { ok: false, message: "Todistusta ei löytynyt." };
  if (!mine.canReply) {
    return {
      ok: false,
      message: mine.replyAt
        ? "Vastine on jo annettu."
        : "Vastineen määräaika on umpeutunut tai arviota ei ole annettu.",
    };
  }

  const trimmed = reply.trim().slice(0, 300);
  if (trimmed === "") return { ok: false, message: "Kirjoita vastine ennen lähettämistä." };

  const { error } = await getServiceClient()
    .from("rs_certificates")
    .update({ reply: trimmed, reply_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("id", mine.id);

  if (error) {
    console.error("[todistukset] vastineen tallennus epäonnistui:", error.message);
    throw new Error("Vastineen tallennus epäonnistui.");
  }

  return { ok: true };
}

/**
 * Kokoaa todistuksen tilastot vuokrasuhteen omasta datasta.
 *
 * ===========================================================================
 * LUVUT TULEVAT SIITÄ, MITÄ TAPAHTUI
 *
 * Vuokranmaksu kuittauksista (`rent/history.ts` kolme luokkaa), viat
 * huoltokirjasta, vakuus päättymisen kirjauksesta. Mitään ei syötetä käsin,
 * eikä mitään voi muokata — todistuksen arvo on siinä, että luvut ovat
 * palvelun omia havaintoja eivätkä kummankaan osapuolen kertomia.
 *
 * Peruttuja huoltokirjan merkintöjä ei lasketa: peruttu vikailmoitus ei ole
 * vika.
 * ===========================================================================
 */
export async function collectStats(tenancyId: string): Promise<CertificateStatsData> {
  const supabase = getServiceClient();

  const [{ data: tenancyRow }, { data: periods }, { data: entries }] = await Promise.all([
    supabase
      .from("rs_tenancies")
      .select("start_date, notice_ends_at, end_date, deposit_amount, deposit_returned_amount")
      .eq("id", tenancyId)
      .single(),
    supabase.from("rs_rent_periods").select("id, due_date").eq("tenancy_id", tenancyId),
    supabase
      .from("rs_maintenance_entries")
      .select("id, kind, resolved_at, cancelled_at")
      .eq("tenancy_id", tenancyId),
  ]);

  const periodRows = (periods ?? []) as Array<{ id: string; due_date: string }>;

  const { data: confirmations } = periodRows.length
    ? await supabase
        .from("rs_rent_confirmations")
        .select("rent_period_id, status, paid_at")
        .in(
          "rent_period_id",
          periodRows.map((row) => row.id),
        )
    : { data: [] };

  const byPeriod = new Map(
    ((confirmations ?? []) as Array<{
      rent_period_id: string;
      status: "paid" | "not_yet" | "partial";
      paid_at: string | null;
    }>).map((row) => [row.rent_period_id, row]),
  );

  const paidPeriods: PaidPeriod[] = periodRows.map((row) => {
    const confirmation = byPeriod.get(row.id);
    return {
      dueDate: row.due_date,
      status: confirmation?.status ?? null,
      paidAt: confirmation?.paid_at ?? null,
    };
  });

  const rent = summarizeRentHistory(paidPeriods);

  const defects = ((entries ?? []) as Array<{
    kind: string;
    resolved_at: string | null;
    cancelled_at: string | null;
  }>).filter((entry) => entry.kind === "defect" && entry.cancelled_at === null);

  const tenancy = tenancyRow as {
    start_date: string | null;
    notice_ends_at: string | null;
    end_date: string | null;
    deposit_amount: string | number | null;
    deposit_returned_amount: string | number | null;
  } | null;

  const deposit = tenancy?.deposit_amount === null || tenancy?.deposit_amount === undefined
    ? null
    : Number(tenancy.deposit_amount);
  const returned =
    tenancy?.deposit_returned_amount === null || tenancy?.deposit_returned_amount === undefined
      ? null
      : Number(tenancy.deposit_returned_amount);

  return {
    months: rent.months,
    rentPeriods: rent.months,
    rentOnTime: rent.onTime,
    rentSlightlyLate: rent.slightlyLate,
    rentDelayed: rent.delayed,
    defectsReported: defects.length,
    defectsResolved: defects.filter((entry) => entry.resolved_at !== null).length,
    // Vakuudesta ei sanota mitään, jos sitä ei ollut tai sitä ei ole vielä
    // palautettu: tyhjä tieto on rehellisempi kuin arvaus.
    depositReturnedFull:
      deposit === null || returned === null ? undefined : returned >= deposit,
  };
}

export interface ShareRow {
  id: string;
  expiresAt: string;
  revokedAt: string | null;
  viewedCount: number;
}

/**
 * Luo jakolinkin omaan todistukseen.
 *
 * Vain todistuksen kohde voi jakaa sen: se on hänen todistuksensa, ja hän
 * päättää kenelle se näytetään. Vain sinetöityä voi jakaa — sinetöimätön
 * voisi vielä muuttua sen jälkeen, kun joku on sen nähnyt.
 */
export async function createCertificateShare(
  userId: string,
  tenancyId: string,
  now: Date = new Date(),
): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  const certificates = await listCertificates(userId, tenancyId, now);
  const mine = certificates.find((certificate) => certificate.isMine);

  if (!mine) return { ok: false, message: "Todistusta ei löytynyt." };
  if (!mine.sealedAt) return { ok: false, message: "Todistus ei ole vielä sinetöity." };

  const share = createShareToken(now);

  const { error } = await getServiceClient().from("rs_certificate_shares").insert({
    certificate_id: mine.id,
    token_hash: share.tokenHash,
    expires_at: share.expiresAt,
  });

  if (error) {
    console.error("[todistukset] jakolinkin luonti epäonnistui:", error.message);
    throw new Error("Jakolinkin luonti epäonnistui.");
  }

  return { ok: true, token: share.token };
}

/** Omat jakolinkit. Katselukerrat näkyvät omistajalle. */
export async function listCertificateShares(
  userId: string,
  tenancyId: string,
  now: Date = new Date(),
): Promise<ShareRow[]> {
  const certificates = await listCertificates(userId, tenancyId, now);
  const mine = certificates.find((certificate) => certificate.isMine);
  if (!mine) return [];

  const { data } = await getServiceClient()
    .from("rs_certificate_shares")
    .select("id, expires_at, revoked_at, viewed_count")
    .eq("certificate_id", mine.id)
    .order("created_at", { ascending: false });

  return ((data ?? []) as Array<{
    id: string;
    expires_at: string;
    revoked_at: string | null;
    viewed_count: number;
  }>).map((row) => ({
    id: row.id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    viewedCount: row.viewed_count,
  }));
}

/** Mitätöi jakolinkin. Sen jälkeen se ei avaudu kenellekään. */
export async function revokeCertificateShare(
  userId: string,
  tenancyId: string,
  shareId: string,
  now: Date = new Date(),
): Promise<CertificateResult> {
  const certificates = await listCertificates(userId, tenancyId, now);
  const mine = certificates.find((certificate) => certificate.isMine);
  if (!mine) return { ok: false, message: "Todistusta ei löytynyt." };

  // Rajaus omaan todistukseen: kukaan ei saa mitätöidä toisen linkkiä
  // arvaamalla sen tunnisteen.
  const { error } = await getServiceClient()
    .from("rs_certificate_shares")
    .update({ revoked_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("id", shareId)
    .eq("certificate_id", mine.id);

  if (error) {
    console.error("[todistukset] mitätöinti epäonnistui:", error.message);
    throw new Error("Mitätöinti ei onnistunut.");
  }

  return { ok: true };
}

export interface SharedCertificate {
  sealedPath: string;
  sealedSha256: string | null;
  sealedAt: string | null;
}

/**
 * Todistus jakolinkin tunnisteella. Ei vaadi kirjautumista.
 *
 * ===========================================================================
 * TÄMÄ ON AINOA TUNNISTAMATON POLKU TODISTUKSEEN
 *
 * Tunniste on 256-bittinen satunnaisluku, jota ei säilytetä selkokielisenä.
 * Vertailu on vakioaikainen, ja vanhentunut tai mitätöity linkki antaa saman
 * vastauksen kuin olematon — muuten vastaus kertoisi, mitkä tunnisteet ovat
 * joskus olleet olemassa.
 *
 * Palautetaan vain sinetöity tiedosto. Ei vuokrasuhdetta, ei osapuolia, ei
 * kuvia: todistus on se, mitä jaettiin.
 * ===========================================================================
 */
export async function findCertificateByShare(
  token: string,
  now: Date = new Date(),
): Promise<SharedCertificate | null> {
  if (!isShareTokenShaped(token)) return null;

  const supabase = getServiceClient();

  const { data } = await supabase
    .from("rs_certificate_shares")
    .select("id, certificate_id, token_hash, expires_at, revoked_at, viewed_count")
    .eq("token_hash", hashShareToken(token))
    .limit(1)
    .maybeSingle();

  const share = data as {
    id: string;
    certificate_id: string;
    token_hash: string;
    expires_at: string;
    revoked_at: string | null;
    viewed_count: number;
  } | null;

  if (!share) return null;
  if (!shareTokenMatches(token, share.token_hash)) return null;
  if (isShareExpired(share.expires_at, share.revoked_at, now)) return null;

  const { data: certificate } = await supabase
    .from("rs_certificates")
    .select("sealed_path, sealed_sha256, sealed_at")
    .eq("id", share.certificate_id)
    .maybeSingle();

  const row = certificate as {
    sealed_path: string | null;
    sealed_sha256: string | null;
    sealed_at: string | null;
  } | null;

  if (!row?.sealed_path) return null;

  // Katselukerta omistajalle näkyviin. Ei kaadeta, jos laskuri ei päivity:
  // todistuksen näyttäminen on tärkeämpää kuin laskuri.
  await supabase
    .from("rs_certificate_shares")
    .update({ viewed_count: share.viewed_count + 1, updated_at: now.toISOString() })
    .eq("id", share.id);

  return {
    sealedPath: row.sealed_path,
    sealedSha256: row.sealed_sha256,
    sealedAt: row.sealed_at,
  };
}
