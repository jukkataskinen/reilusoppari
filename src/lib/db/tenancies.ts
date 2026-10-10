/**
 * Vuokrasuhteet (`rs_tenancies`, `rs_tenancy_parties`, CLAUDE.md 5.1–5.2).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: palvelinkoodi. Jokainen funktio ottaa `userId`:n
 *    ensimmäisenä parametrina — paitsi `findTenancyByInvite`, joka on
 *    tarkoituksella tunnistamaton (ks. kohta 4).
 * 2. Henkilötieto: nimet ja sähköpostit. Ei lokiteta.
 * 3. Syöte: validoitu zodilla (`tenancy/schema.ts`).
 * 4. **Kutsulinkki on tunnistamaton polku.** Se on ainoa tapa, jolla
 *    vuokralainen pääsee alkuun ennen kuin hänellä on tiliä. Siksi
 *    `findTenancyByInvite` palauttaa vain sen, mitä kutsun avaajan KUULUU
 *    nähdä ennen kirjautumista: asunnon osoite, vuokranantajan nimi ja
 *    sopimuksen perusluvut. Ei toisen vuokralaisen tietoja, ei kuvia, ei
 *    muita vuokrasuhteita.
 * 5. Salaisuudet: kutsun tunniste tallennetaan vain HMAC-tiivisteenä
 *    (`tenancy/invite.ts`). Selkokielinen arvo palautetaan kerran luonnissa.
 * 6. Epäonnistuminen: väärä, vanhentunut ja jo käytetty kutsu antavat saman
 *    vastauksen `null` — kutsun tila ei saa paljastua ulkopuoliselle.
 * 7. Lokitus: ei tunnisteita, ei sähköposteja.
 * ===========================================================================
 */

import { getServiceClient, hasSupabaseCredentials } from "./supabase";
import { getProperty } from "./properties";
import {
  createInvite,
  hashInviteToken,
  isInviteExpired,
  isInviteTokenShaped,
} from "../tenancy/invite";
import { generateRentPeriods } from "../tenancy/rent-periods";
import { ownPartyDefaultColumns } from "../tenancy/party-details";
import {
  CONTRACT_TEMPLATE_KEY,
  CONTRACT_TEMPLATE_VERSION,
  DEFAULT_CONTRACT_TERMS,
} from "../tenancy/contract-schema";
import type { TenancyInput } from "../tenancy/schema";
import {
  acceptInviteBlocker,
  isSelfJoined,
  pendingPartyBlocker,
  type AcceptInviteBlocker,
  tenancyDeletionBlocker,
  type PendingPartyAction,
  type PendingPartyBlocker,
  type TenancyDeletionBlocker,
  type TenancyDeletionFacts,
} from "../tenancy/invite-management";
import type { PropertyType } from "../property/default-checkpoints";

export type TenancyStatus =
  | "draft"
  | "inspection"
  | "signing"
  | "active"
  | "ending"
  | "ended"
  | "certified";

export interface Tenancy {
  id: string;
  propertyId: string;
  landlordUserId: string;
  status: TenancyStatus;
  startDate: string | null;
  endDate: string | null;
  rentAmount: number | null;
  rentDueDay: number | null;
  depositAmount: number | null;
  createdAt: string;
}

export interface TenancyParty {
  id: string;
  role: "landlord" | "tenant";
  position: number;
  userId: string | null;
  inviteEmail: string | null;
  joinedAt: string | null;
  inviteExpiresAt: string | null;
}

/** Kutsu, joka näytetään vuokranantajalle kerran luonnin jälkeen. */
export interface IssuedInvite {
  email: string;
  name: string;
  /** Selkokielinen tunniste. Tätä ei saa tallentaa mihinkään. */
  token: string;
}

interface TenancyRow {
  id: string;
  property_id: string;
  landlord_user_id: string;
  status: TenancyStatus;
  start_date: string | null;
  end_date: string | null;
  rent_amount: string | number | null;
  rent_due_day: number | null;
  deposit_amount: string | number | null;
  created_at: string;
}

const COLUMNS =
  "id, property_id, landlord_user_id, status, start_date, end_date, rent_amount, rent_due_day, deposit_amount, created_at";

function numberOrNull(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

function fromRow(row: TenancyRow): Tenancy {
  return {
    id: row.id,
    propertyId: row.property_id,
    landlordUserId: row.landlord_user_id,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    rentAmount: numberOrNull(row.rent_amount),
    rentDueDay: row.rent_due_day,
    depositAmount: numberOrNull(row.deposit_amount),
    createdAt: row.created_at,
  };
}

/**
 * Luo vuokrasuhteen, osapuolet ja kutsut.
 *
 * ===========================================================================
 * VUOKRAKAUSIA EI LUODA VIELÄ
 *
 * `rs_rent_periods` generoidaan vasta allekirjoituksen jälkeen (CLAUDE.md
 * 5.4). Syy on se, että sopimuksen ehdot voivat vielä muuttua vuokralaisen
 * kommenttien perusteella — ja jos kaudet olisi jo luotu, ne jäisivät
 * vanhoiksi hiljaa.
 * ===========================================================================
 *
 * Jos jokin vaihe epäonnistuu, jo luotu vuokrasuhde poistetaan. Supabasen
 * REST-rajapinnassa ei ole transaktioita, joten siivous on tehtävä käsin —
 * puolittainen vuokrasuhde ilman osapuolia olisi rikkinäinen rivi, jota
 * kukaan ei pääse korjaamaan.
 */
export async function createTenancy(
  userId: string,
  input: TenancyInput,
): Promise<{ tenancy: Tenancy; invites: IssuedInvite[] }> {
  // Omistajuus tarkistetaan ennen kirjoitusta: vuokrasuhdetta ei voi luoda
  // toisen asuntoon.
  const property = await getProperty(userId, input.propertyId);
  if (!property) {
    throw new Error("Asuntoa ei löytynyt.");
  }

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("rs_tenancies")
    .insert({
      property_id: input.propertyId,
      landlord_user_id: userId,
      status: "draft",
      start_date: input.startDate,
      end_date: input.endDate ?? null,
      rent_amount: input.rentAmount,
      rent_due_day: input.rentDueDay,
      deposit_amount: input.depositAmount,
    })
    .select(COLUMNS)
    .single();

  if (error || !data) {
    console.error("[tenancies] luonti epäonnistui:", error?.message);
    throw new Error("Vuokrasuhteen luonti epäonnistui.");
  }

  const tenancy = fromRow(data as TenancyRow);

  try {
    const invites: IssuedInvite[] = [];

    const defaults = await ownPartyDefaultColumns(userId);

    /*
      Kaikilla riveillä on oltava SAMAT avaimet.

      PostgREST vertaa insert-taulukon objekteja keskenään ja täyttää
      puuttuvan avaimen NULLilla — ei sarakkeen oletusarvolla. Jos siis
      vuokranantajan rivillä on `party_type` ja vuokralaisen rivillä ei,
      vuokralainen saa NULLin ja not null -rajoite kaataa koko insertin.
    */
    const TYHJA_OSAPUOLI = {
      party_name: null,
      party_type: "henkilo",
      party_id_encrypted: null,
      business_id: null,
      signatory_name: null,
      phone: null,
      contact_email: null,
      bank_account: null,
      user_id: null,
      invite_email: null,
      invite_token_hash: null,
      invite_expires_at: null,
      joined_at: null,
    };

    const parties: Record<string, unknown>[] = [
      {
        ...TYHJA_OSAPUOLI,
        tenancy_id: tenancy.id,
        user_id: userId,
        role: "landlord",
        position: 0,
        joined_at: new Date().toISOString(),
        // Vuokranantajan perustiedot kopioidaan tähän kerralla: ne pysyvät
        // samoina vuokrasuhteesta toiseen. Kopio on kopio — perustietojen
        // muokkaus ei muuta jo allekirjoitettuja sopimuksia.
        ...defaults,
      },
    ];

    input.tenants.forEach((tenant, index) => {
      const invite = createInvite();
      invites.push({ email: tenant.email, name: tenant.name, token: invite.token });
      parties.push({
        ...TYHJA_OSAPUOLI,
        tenancy_id: tenancy.id,
        role: "tenant",
        position: index,
        invite_email: tenant.email,
        invite_token_hash: invite.tokenHash,
        invite_expires_at: invite.expiresAt,
        // Nimi ja sähköposti sopimukseen. Loput tunnistetiedot täydennetään
        // osapuolisivulla — kumpi tahansa osapuoli voi tehdä sen.
        party_name: tenant.name,
        contact_email: tenant.email,
      });
    });

    const { error: partyError } = await supabase.from("rs_tenancy_parties").insert(parties);
    if (partyError) {
      console.error("[tenancies] osapuolten luonti epäonnistui:", partyError.message);
      throw new Error("Vuokrasuhteen luonti epäonnistui.");
    }

    /*
      Sopimusrivi luodaan heti oletusehdoilla. Nimet eivät ole täällä vaan
      osapuoliriveillä (`party-details.ts`): sopimuksen allekirjoitusrivillä
      ei saa lukea eri nimi kuin osapuolitiedoissa.
    */
    const { error: contractError } = await supabase.from("rs_contracts").insert({
      tenancy_id: tenancy.id,
      template_key: CONTRACT_TEMPLATE_KEY,
      template_version: CONTRACT_TEMPLATE_VERSION,
      template_data: DEFAULT_CONTRACT_TERMS,
    });

    if (contractError) {
      console.error("[tenancies] sopimusrivin luonti epäonnistui:", contractError.message);
      throw new Error("Vuokrasuhteen luonti epäonnistui.");
    }

    return { tenancy, invites };
  } catch (err) {
    // Siivotaan puolittainen vuokrasuhde. Cascade poistaa osapuolet.
    await supabase.from("rs_tenancies").delete().eq("id", tenancy.id);
    throw err;
  }
}

/** Vuokrasuhde, jos kutsuja on sen osapuoli. Muuten `null`. */
export async function getTenancy(userId: string, tenancyId: string): Promise<Tenancy | null> {
  const supabase = getServiceClient();

  const { data: party, error: partyError } = await supabase
    .from("rs_tenancy_parties")
    .select("id")
    .eq("tenancy_id", tenancyId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (partyError) {
    console.error("[tenancies] osapuolitarkistus epäonnistui:", partyError.message);
    throw new Error("Vuokrasuhteen haku epäonnistui.");
  }
  if (!party) return null;

  const { data, error } = await supabase
    .from("rs_tenancies")
    .select(COLUMNS)
    .eq("id", tenancyId)
    .maybeSingle();

  if (error) {
    console.error("[tenancies] haku epäonnistui:", error.message);
    throw new Error("Vuokrasuhteen haku epäonnistui.");
  }

  return data ? fromRow(data as TenancyRow) : null;
}

/** Vuokrasuhteen osapuolet. Vain osapuoli näkee ne. */
export async function listParties(userId: string, tenancyId: string): Promise<TenancyParty[]> {
  if (!(await getTenancy(userId, tenancyId))) return [];

  const { data, error } = await getServiceClient()
    .from("rs_tenancy_parties")
    .select("id, role, position, user_id, invite_email, joined_at, invite_expires_at")
    .eq("tenancy_id", tenancyId)
    .order("role", { ascending: true })
    .order("position", { ascending: true });

  if (error) {
    console.error("[tenancies] osapuolten haku epäonnistui:", error.message);
    throw new Error("Osapuolten haku epäonnistui.");
  }

  return (data as Array<{
    id: string;
    role: "landlord" | "tenant";
    position: number;
    user_id: string | null;
    invite_email: string | null;
    joined_at: string | null;
    invite_expires_at: string | null;
  }>).map((row) => ({
    id: row.id,
    role: row.role,
    position: row.position,
    userId: row.user_id,
    inviteEmail: row.invite_email,
    joinedAt: row.joined_at,
    inviteExpiresAt: row.invite_expires_at,
  }));
}

/** Käyttäjän vuokrasuhteet, uusin ensin. Sekä vuokranantajana että vuokralaisena. */
export async function listTenancies(userId: string): Promise<Tenancy[]> {
  const supabase = getServiceClient();

  const { data: parties, error: partyError } = await supabase
    .from("rs_tenancy_parties")
    .select("tenancy_id")
    .eq("user_id", userId);

  if (partyError) {
    console.error("[tenancies] listaus epäonnistui:", partyError.message);
    throw new Error("Vuokrasuhteiden haku epäonnistui.");
  }

  const ids = (parties as { tenancy_id: string }[]).map((p) => p.tenancy_id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("rs_tenancies")
    .select(COLUMNS)
    .in("id", ids)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[tenancies] listaus epäonnistui:", error.message);
    throw new Error("Vuokrasuhteiden haku epäonnistui.");
  }

  return (data as TenancyRow[]).map(fromRow);
}

/** Mitä kutsun avaaja näkee ennen kirjautumista. Tarkoituksella suppea. */
export interface InvitePreview {
  tenancyId: string;
  partyId: string;
  inviteEmail: string;
  landlordName: string | null;
  propertyAddress: string;
  startDate: string | null;
  endDate: string | null;
  rentAmount: number | null;
  rentDueDay: number | null;
  depositAmount: number | null;
}

/**
 * Kutsun tiedot tunnisteella. **Tunnistamaton polku.**
 *
 * Palauttaa `null` yhtä lailla väärästä, vanhentuneesta ja jo käytetystä
 * tunnisteesta: kutsun tila ei saa paljastua sille, jolla ei ole sitä.
 */
export async function findTenancyByInvite(token: string): Promise<InvitePreview | null> {
  // Muoto tarkistetaan ennen kyselyä, jottei mielivaltainen syöte päädy
  // tietokantaan asti.
  if (!isInviteTokenShaped(token)) return null;

  /*
    Ilman tietokantaa ei ole kutsuja.

    Tämä ei ole käyntikatkoksen vaimennus vaan puuttuva kokoonpano: jos
    Supabase-avaimia ei ole lainkaan, sovellusta ei ole asennettu loppuun
    eikä yksikään sen sivu toimisi. CI ajaa e2e-savutestit juuri tässä
    tilassa (DECISIONS.md 2026-09-11), ja kutsusivun on silloin kerrottava,
    ettei kutsu ole voimassa — eikä vastattava 500.

    Oikea katkos on eri asia, ja se heitetään alla.
  */
  if (!hasSupabaseCredentials()) return null;

  const supabase = getServiceClient();

  const { data: party, error } = await supabase
    .from("rs_tenancy_parties")
    .select("id, tenancy_id, invite_email, invite_expires_at, joined_at, user_id")
    .eq("invite_token_hash", hashInviteToken(token))
    .eq("role", "tenant")
    .limit(1)
    .maybeSingle();

  if (error) {
    /*
      Kyselyvirhe heitetään, ei niellä.

      `null` näyttäisi sivulla samalta kuin "kutsua ei ole", ja oikea
      vuokralainen saisi tietokantakatkoksesta viestin, että hänen kutsunsa
      on kuollut. Hän luopuisi linkistä, joka on kunnossa.
    */
    console.error("[tenancies] kutsun haku epäonnistui:", error.message);
    throw new Error("Kutsun haku epäonnistui.");
  }
  if (!party) return null;

  const row = party as {
    id: string;
    tenancy_id: string;
    invite_email: string | null;
    invite_expires_at: string | null;
    joined_at: string | null;
    user_id: string | null;
  };

  if (isInviteExpired(row.invite_expires_at)) return null;

  const { data: tenancy } = await supabase
    .from("rs_tenancies")
    .select("id, property_id, landlord_user_id, start_date, end_date, rent_amount, rent_due_day, deposit_amount")
    .eq("id", row.tenancy_id)
    .maybeSingle();

  if (!tenancy) return null;

  const t = tenancy as {
    property_id: string;
    landlord_user_id: string;
    start_date: string | null;
    end_date: string | null;
    rent_amount: string | number | null;
    rent_due_day: number | null;
    deposit_amount: string | number | null;
  };

  const [{ data: property }, { data: landlord }] = await Promise.all([
    supabase
      .from("rs_properties")
      .select("street, postal_code, city")
      .eq("id", t.property_id)
      .maybeSingle(),
    supabase.from("rs_users").select("name, email").eq("id", t.landlord_user_id).maybeSingle(),
  ]);

  const address = property
    ? `${(property as { street: string }).street}, ${(property as { postal_code: string }).postal_code} ${(property as { city: string }).city}`
    : "";

  return {
    tenancyId: row.tenancy_id,
    partyId: row.id,
    /**
     * Kutsutun oma sähköpostiosoite näytetään, vaikka polku on
     * tunnistamaton.
     *
     * Se on välttämätöntä: kirjautuminen on salasanaton ja tapahtuu juuri
     * tällä osoitteella, joten ilman sitä kutsuttu ei tiedä mitä osoitetta
     * käyttää. Linkki itsessään on salaisuus (256 bittiä), joten sen
     * haltija on käytännössä kutsuttu itse.
     *
     * Vuokranantajan osoitetta ei anneta — sitä ei tarvita mihinkään.
     */
    inviteEmail: row.invite_email ?? "",
    /**
     * Nimi jos se on tiedossa, muuten `null`.
     *
     * Sähköpostiosoitetta EI näytetä kutsun avaajalle: hän ei ole vielä
     * tunnistautunut, ja osoite on henkilötieto. Nimi tulee eSinetin
     * tunnistuksesta, joten se puuttuu ennen ensimmäistä allekirjoitusta.
     */
    landlordName: (landlord as { name: string | null } | null)?.name ?? null,
    propertyAddress: address,
    startDate: t.start_date,
    endDate: t.end_date,
    rentAmount: numberOrNull(t.rent_amount),
    rentDueDay: t.rent_due_day,
    depositAmount: numberOrNull(t.deposit_amount),
  };
}

/** Miksi kutsun hyväksyntä epäonnistui. Käyttöliittymä kertoo eri viestin. */
export type AcceptInviteResult =
  | { ok: true; tenancyId: string }
  | { ok: false; reason: "invalid" | AcceptInviteBlocker };

/**
 * Liittää kirjautuneen käyttäjän kutsuttuun osapuoleen.
 *
 * ===========================================================================
 * SÄHKÖPOSTIN ON TÄSMÄTTÄVÄ
 *
 * Kutsu on osoitettu tietylle osoitteelle, ja kirjautuminen tapahtuu sillä
 * (CLAUDE.md 5.2). Jos kuka tahansa kirjautunut voisi lunastaa linkin,
 * eteenpäin välitetty linkki liittäisi väärän ihmisen vuokrasuhteeseen — ja
 * hänen nimensä päätyisi allekirjoitettuun sopimukseen.
 *
 * Väärällä tilillä avattu kutsu EI kulu: se jää voimaan oikeaa henkilöä
 * varten.
 * ===========================================================================
 *
 * OMAAN VUOKRASUHTEESEEN EI LIITYTÄ VUOKRALAISENA
 *
 * Jos vuokranantaja kirjoittaa kutsuun vahingossa oman osoitteensa ja avaa
 * linkin, hän olisi sekä vuokranantaja että vuokralainen. Vuokralaisen
 * vaiheet (esim. katselmuksen valmiiksi merkintä) jäisivät tekemättä, eikä
 * oikea vuokralainen pääsisi mukaan (Jukan havainto 10.10.2026). Kutsu ei
 * kulu: vuokranantaja korjaa osoitteen, ja kutsu lähtee oikealle.
 * ===========================================================================
 *
 * Idempotentti: jo liittynyt kutsu ei tee mitään eikä heitä. Käyttäjä voi
 * avata saman linkin uudelleen, eikä sen pidä näyttää virheeltä.
 */
export async function acceptInvite(
  token: string,
  userId: string,
  userEmail: string,
): Promise<AcceptInviteResult> {
  const preview = await findTenancyByInvite(token);
  if (!preview) return { ok: false, reason: "invalid" };

  const supabase = getServiceClient();

  const { data: tenancyRow, error: tenancyError } = await supabase
    .from("rs_tenancies")
    .select("landlord_user_id")
    .eq("id", preview.tenancyId)
    .maybeSingle();
  if (tenancyError || !tenancyRow) {
    if (tenancyError) {
      console.error("[tenancies] kutsun hyväksyntä epäonnistui:", tenancyError.message);
    }
    return { ok: false, reason: "invalid" };
  }

  const blocker = acceptInviteBlocker({
    userId,
    userEmail,
    inviteEmail: preview.inviteEmail,
    landlordUserId: (tenancyRow as { landlord_user_id: string }).landlord_user_id,
  });
  if (blocker) return { ok: false, reason: blocker };

  const { data, error } = await supabase
    .from("rs_tenancy_parties")
    .select("user_id")
    .eq("id", preview.partyId)
    .maybeSingle();

  if (error) {
    console.error("[tenancies] kutsun hyväksyntä epäonnistui:", error.message);
    return { ok: false, reason: "invalid" };
  }

  const existing = (data as { user_id: string | null } | null)?.user_id ?? null;
  if (existing && existing !== userId) {
    // Kutsu on jo käytetty toisella tilillä. Ei kerrota kenen.
    return { ok: false, reason: "invalid" };
  }

  if (!existing) {
    const { error: updateError } = await supabase
      .from("rs_tenancy_parties")
      .update({ user_id: userId, joined_at: new Date().toISOString() })
      .eq("id", preview.partyId)
      .is("user_id", null);

    if (updateError) {
      console.error("[tenancies] kutsun hyväksyntä epäonnistui:", updateError.message);
      return { ok: false, reason: "invalid" };
    }
  }

  return { ok: true, tenancyId: preview.tenancyId };
}

/**
 * Luo vuokrakaudet allekirjoituksen jälkeen (CLAUDE.md 5.4).
 *
 * Idempotentti: `unique (tenancy_id, period_month)` estää kaksoiskappaleet,
 * ja olemassa olevat ohitetaan. Webhook voi tulla kahdesti.
 */
export async function createRentPeriods(tenancyId: string, tenancy: Tenancy): Promise<number> {
  if (!tenancy.startDate || !tenancy.rentDueDay || tenancy.rentAmount === null) {
    throw new Error("Vuokrasuhteesta puuttuu tietoja vuokrakausien luontiin.");
  }

  const periods = generateRentPeriods({
    startDate: tenancy.startDate,
    endDate: tenancy.endDate,
    dueDay: tenancy.rentDueDay,
    amount: tenancy.rentAmount,
  });

  const { error } = await getServiceClient()
    .from("rs_rent_periods")
    .upsert(
      periods.map((period) => ({
        tenancy_id: tenancyId,
        period_month: period.periodMonth,
        due_date: period.dueDate,
        amount: period.amount,
      })),
      { onConflict: "tenancy_id,period_month", ignoreDuplicates: true },
    );

  if (error) {
    console.error("[tenancies] vuokrakausien luonti epäonnistui:", error.message);
    throw new Error("Vuokrakausien luonti epäonnistui.");
  }

  return periods.length;
}

/** Kutsutoiminnon tulos. Syy kerrotaan käyttäjälle (`PENDING_PARTY_MESSAGES`). */
export type InviteChangeResult =
  | { ok: true; invite: IssuedInvite }
  | { ok: false; reason: PendingPartyBlocker | "duplicate" | "failed" };

interface PendingPartyRow {
  id: string;
  role: "landlord" | "tenant";
  invite_email: string | null;
  party_name: string | null;
  user_id: string | null;
  joined_at: string | null;
  position: number;
}

/**
 * Hakee kutsun ja kysyy säännöiltä (`invite-management.ts`), saako
 * käyttäjä tehdä toiminnon.
 *
 * Omistajuus tarkistetaan tässä palvelinkoodissa eikä luoteta siihen, että
 * nappi näkyi vain vuokranantajalle: palvelintoiminto on julkinen
 * päätepiste, ja kuka tahansa kirjautunut voi lähettää sille minkä
 * tunnisteen tahansa.
 */
async function loadPendingParty(
  userId: string,
  tenancyId: string,
  partyId: string,
  action: PendingPartyAction,
): Promise<
  { ok: true; party: PendingPartyRow } | { ok: false; reason: PendingPartyBlocker | "failed" }
> {
  const tenancy = await getTenancy(userId, tenancyId);

  let party: PendingPartyRow | null = null;
  if (tenancy) {
    const { data, error } = await getServiceClient()
      .from("rs_tenancy_parties")
      .select("id, role, invite_email, party_name, user_id, joined_at, position")
      .eq("id", partyId)
      .eq("tenancy_id", tenancyId)
      .maybeSingle();
    if (error) {
      console.error("[tenancies] kutsun haku epäonnistui:", error.message);
      return { ok: false, reason: "failed" };
    }
    party = (data as PendingPartyRow | null) ?? null;
  }

  const blocker = pendingPartyBlocker(
    {
      userId,
      tenancy: tenancy ? { landlordUserId: tenancy.landlordUserId, status: tenancy.status } : null,
      party: party ? { role: party.role, userId: party.user_id, joinedAt: party.joined_at } : null,
    },
    action,
  );
  if (blocker || !party) return { ok: false, reason: blocker ?? "not_found" };
  return { ok: true, party };
}

/** Lokimerkintä. Ei sähköposteja eikä tunnisteita lisätietoihin. */
async function audit(
  userId: string,
  tenancyId: string | null,
  action: string,
  targetType: string,
  targetId: string,
): Promise<void> {
  const { error } = await getServiceClient().from("rs_audit_log").insert({
    tenancy_id: tenancyId,
    actor_user_id: userId,
    action,
    target_type: targetType,
    target_id: targetId,
    details: {},
  });
  if (error) console.error("[tenancies] lokimerkintä epäonnistui:", error.message);
}

/**
 * Vuokranantajan itse vuokralaisen paikalla (`isSelfJoined`) jättämät jäljet.
 *
 * Kun paikka vapautetaan oikealle vuokralaiselle, myös katselmuksen
 * vuokralaisen leimat tyhjennetään: vuokranantaja ei voi olla merkinnyt
 * katselmusta valmiiksi vuokralaisen puolesta. Muokkaus on sallittu vain
 * ennen allekirjoitusta (`pendingPartyBlocker`), joten loppukatselmuksen
 * leimoja ei vielä ole.
 */
const SELF_JOIN_RESET = {
  user_id: null,
  joined_at: null,
  first_seen_inspection_at: null,
  inspection_ready_at: null,
} as const;

/** Kirjoitus osui nollaan riviin: joku ehti väliin (esim. vuokralainen liittyi). */
function touched(data: unknown): boolean {
  return Array.isArray(data) && data.length > 0;
}

/**
 * Luo uuden kutsun samalle osapuolelle samaan osoitteeseen.
 *
 * ===========================================================================
 * MIKSI TÄMÄ ON PAKKO OLLA
 *
 * Selkokielinen tunniste palautetaan vain luonnissa, koska tietokantaan
 * tallennetaan vain tiiviste. Jos vuokranantaja sulkee välilehden ennen kuin
 * ehtii kopioida linkin, se on menetetty pysyvästi — eikä sitä voi palauttaa,
 * eikä pidäkään voida.
 *
 * Uudelleenlähetys on siis ainoa tie ulos, ja se **mitätöi vanhan linkin**:
 * uusi tiiviste korvaa vanhan, joten aiemmin jaettu linkki lakkaa toimimasta.
 * Se on tarkoitus — muuten vanha linkki jäisi elämään esimerkiksi väärään
 * sähköpostiosoitteeseen lähetettynä.
 * ===========================================================================
 *
 * Vain vuokranantaja voi lähettää kutsun uudelleen, eikä jo liittyneelle
 * osapuolelle luoda uutta kutsua: se poistaisi häneltä pääsyn.
 */
export async function resendInvite(
  userId: string,
  tenancyId: string,
  partyId: string,
): Promise<InviteChangeResult> {
  const loaded = await loadPendingParty(userId, tenancyId, partyId, "resend");
  if (!loaded.ok) return loaded;

  const selfJoined = isSelfJoined(userId, loaded.party.user_id);
  const invite = createInvite();
  const update = getServiceClient()
    .from("rs_tenancy_parties")
    .update({
      ...(selfJoined ? SELF_JOIN_RESET : {}),
      invite_token_hash: invite.tokenHash,
      invite_expires_at: invite.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", partyId);
  // Ehto uudelleen kirjoituksessa: jos vuokralainen liittyi juuri
  // tarkistuksen ja kirjoituksen välissä, häntä ei syrjäytetä.
  const { data, error } = await (selfJoined
    ? update.eq("user_id", userId)
    : update.is("user_id", null)
  ).select("id");

  if (error) {
    console.error("[tenancies] kutsun uudelleenluonti epäonnistui:", error.message);
    return { ok: false, reason: "failed" };
  }
  if (!touched(data)) return { ok: false, reason: "joined" };

  await audit(userId, tenancyId, "tenancy.invite.reissued", "tenancy_party", partyId);
  if (selfJoined) {
    await audit(userId, tenancyId, "tenancy.invite.self_join_cleared", "tenancy_party", partyId);
  }

  return {
    ok: true,
    invite: {
      email: loaded.party.invite_email ?? "",
      name: loaded.party.party_name ?? "",
      token: invite.token,
    },
  };
}

/** Uusi kutsu tai `null`. Vanha rajapinta; uusi koodi käyttää `resendInvite`a. */
export async function reissueInvite(
  userId: string,
  tenancyId: string,
  partyId: string,
): Promise<IssuedInvite | null> {
  const result = await resendInvite(userId, tenancyId, partyId);
  return result.ok ? result.invite : null;
}

/**
 * Vaihtaa kutsutun sähköpostin ja luo uuden kutsun.
 *
 * ===========================================================================
 * VANHA LINKKI KUOLEE SAMALLA
 *
 * Väärään osoitteeseen mennyt linkki on vieraan ihmisen hallussa. Liittyä
 * hän ei voisi, koska sähköpostin on täsmättävä kirjautumiseen, mutta hän
 * näkisi asunnon osoitteen ja vuokran. Siksi tiiviste vaihtuu samassa
 * päivityksessä kuin osoite.
 *
 * Myös sopimukseen tulostuva sähköposti (`contact_email`) vaihtuu: se
 * kirjoitettiin luonnissa samasta kentästä, ja väärä osoite sopimuksessa
 * olisi sama virhe toisessa paikassa.
 * ===========================================================================
 */
export async function changeInviteEmail(
  userId: string,
  tenancyId: string,
  partyId: string,
  email: string,
): Promise<InviteChangeResult> {
  const loaded = await loadPendingParty(userId, tenancyId, partyId, "change_email");
  if (!loaded.ok) return loaded;

  const supabase = getServiceClient();
  const normalized = email.trim().toLowerCase();

  // Kaksi vuokralaista samalla osoitteella: toinen kutsu menisi hukkaan
  // (sama sääntö kuin luonnissa, `tenancy/schema.ts`).
  const { data: others, error: othersError } = await supabase
    .from("rs_tenancy_parties")
    .select("id, invite_email")
    .eq("tenancy_id", tenancyId)
    .eq("role", "tenant")
    .neq("id", partyId);
  if (othersError) {
    console.error("[tenancies] osapuolten haku epäonnistui:", othersError.message);
    return { ok: false, reason: "failed" };
  }
  const taken = ((others ?? []) as Array<{ invite_email: string | null }>).some(
    (row) => (row.invite_email ?? "").toLowerCase() === normalized,
  );
  if (taken) return { ok: false, reason: "duplicate" };

  const selfJoined = isSelfJoined(userId, loaded.party.user_id);
  const invite = createInvite();
  const update = supabase
    .from("rs_tenancy_parties")
    .update({
      ...(selfJoined ? SELF_JOIN_RESET : {}),
      invite_email: normalized,
      contact_email: normalized,
      invite_token_hash: invite.tokenHash,
      invite_expires_at: invite.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", partyId);
  const { data, error } = await (selfJoined
    ? update.eq("user_id", userId)
    : update.is("user_id", null)
  ).select("id");

  if (error) {
    console.error("[tenancies] sähköpostin vaihto epäonnistui:", error.message);
    return { ok: false, reason: "failed" };
  }
  if (!touched(data)) return { ok: false, reason: "joined" };

  await audit(userId, tenancyId, "tenancy.invite.email_changed", "tenancy_party", partyId);
  if (selfJoined) {
    await audit(userId, tenancyId, "tenancy.invite.self_join_cleared", "tenancy_party", partyId);
  }

  return {
    ok: true,
    invite: { email: normalized, name: loaded.party.party_name ?? "", token: invite.token },
  };
}

/**
 * Poistaa kutsun vuokralaiselta, joka ei ole liittynyt.
 *
 * Rivi poistetaan kokonaan eikä merkitä perutuksi: liittymätön kutsu on
 * vain vuokranantajan kirjoittama nimi ja osoite, eikä sen säilyttäminen
 * palvele ketään. Poistosta jää lokimerkintä ilman henkilötietoja.
 *
 * Jos poistettu oli ensimmäinen kahdesta, jäljelle jäänyt siirtyy
 * ensimmäiseksi: sopimus luettelee vuokralaiset järjestyksessä, eikä
 * "toinen vuokralainen" ilman ensimmäistä ole järkevä.
 */
export async function removeInvite(
  userId: string,
  tenancyId: string,
  partyId: string,
): Promise<{ ok: true } | { ok: false; reason: PendingPartyBlocker | "failed" }> {
  const loaded = await loadPendingParty(userId, tenancyId, partyId, "remove");
  if (!loaded.ok) return loaded;

  const selfJoined = isSelfJoined(userId, loaded.party.user_id);
  const supabase = getServiceClient();
  const removal = supabase
    .from("rs_tenancy_parties")
    .delete()
    .eq("id", partyId)
    .eq("role", "tenant");
  const { data, error } = await (selfJoined
    ? removal.eq("user_id", userId)
    : removal.is("user_id", null)
  ).select("id");

  if (error) {
    console.error("[tenancies] kutsun poisto epäonnistui:", error.message);
    return { ok: false, reason: "failed" };
  }
  if (!touched(data)) return { ok: false, reason: "joined" };

  const { error: shiftError } = await supabase
    .from("rs_tenancy_parties")
    .update({ position: loaded.party.position, updated_at: new Date().toISOString() })
    .eq("tenancy_id", tenancyId)
    .eq("role", "tenant")
    .eq("position", loaded.party.position + 1);
  if (shiftError) {
    console.error("[tenancies] järjestyksen korjaus epäonnistui:", shiftError.message);
  }

  await audit(userId, tenancyId, "tenancy.invite.removed", "tenancy_party", partyId);
  if (selfJoined) {
    await audit(userId, tenancyId, "tenancy.invite.self_join_cleared", "tenancy_party", partyId);
  }
  return { ok: true };
}

/**
 * Faktat vuokrasuhteen poiston päätökseen (`tenancyDeletionBlocker`).
 * `null`, jos käyttäjä ei ole vuokrasuhteen osapuoli.
 */
export async function getTenancyDeletionFacts(
  userId: string,
  tenancyId: string,
): Promise<TenancyDeletionFacts | null> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy) return null;

  const supabase = getServiceClient();
  const [tenancyRow, parties, contract, inspections, certificates, expenses] = await Promise.all([
    supabase
      .from("rs_tenancies")
      .select("paid_via, paid_at, signing_started_at, stripe_payment_id")
      .eq("id", tenancyId)
      .maybeSingle(),
    supabase
      .from("rs_tenancy_parties")
      .select("user_id")
      .eq("tenancy_id", tenancyId)
      .eq("role", "tenant"),
    supabase
      .from("rs_contracts")
      .select("esinetti_round_id, signed_at")
      .eq("tenancy_id", tenancyId)
      .maybeSingle(),
    supabase
      .from("rs_inspections")
      .select("esinetti_round_id, signed_at")
      .eq("tenancy_id", tenancyId),
    supabase.from("rs_certificates").select("id").eq("tenancy_id", tenancyId),
    supabase.from("rs_expenses").select("id").eq("tenancy_id", tenancyId),
  ]);

  const failed = [tenancyRow, parties, contract, inspections, certificates, expenses].find(
    (r) => r.error,
  );
  if (failed?.error) {
    console.error("[tenancies] poiston tarkistus epäonnistui:", failed.error.message);
    throw new Error("Vuokrasuhteen tarkistus epäonnistui.");
  }

  const billing = tenancyRow.data as {
    paid_via: string | null;
    paid_at: string | null;
    signing_started_at: string | null;
    stripe_payment_id: string | null;
  } | null;
  const contractRow = contract.data as {
    esinetti_round_id: string | null;
    signed_at: string | null;
  } | null;
  const inspectionRows = (inspections.data ?? []) as Array<{
    esinetti_round_id: string | null;
    signed_at: string | null;
  }>;
  const tenantRows = (parties.data ?? []) as Array<{ user_id: string | null }>;

  return {
    isLandlord: tenancy.landlordUserId === userId,
    status: tenancy.status,
    // Vuokranantaja itse vuokralaisen paikalla ei tee vuokrasuhteesta
    // yhteistä (`isSelfJoined`).
    joinedTenants: tenantRows.filter(
      (row) => row.user_id && !isSelfJoined(tenancy.landlordUserId, row.user_id),
    ).length,
    signingStarted:
      Boolean(billing?.signing_started_at) ||
      Boolean(contractRow?.esinetti_round_id || contractRow?.signed_at) ||
      inspectionRows.some((row) => row.esinetti_round_id || row.signed_at),
    paid: Boolean(billing?.paid_via || billing?.paid_at || billing?.stripe_payment_id),
    certificates: ((certificates.data ?? []) as unknown[]).length,
    expenses: ((expenses.data ?? []) as unknown[]).length,
  };
}

export type DeleteTenancyResult =
  | { ok: true }
  | { ok: false; reason: TenancyDeletionBlocker | "not_found" | "failed" };

/**
 * Poistaa vuokrasuhdeluonnoksen kokonaan (ks. `tenancyDeletionBlocker`).
 *
 * Tietokanta poistaa vuokrasuhteen mukana sen osapuolet, sopimusluonnoksen,
 * katselmukset, kuvarivit, huoltokirjan ja kommentit (`on delete cascade`).
 * Aiemmat lokimerkinnät jäävät: niiden vuokrasuhdeviite tyhjenee
 * (`on delete set null`), mutta `target_id` kertoo yhä, mitä tehtiin ja kuka.
 *
 * Kuvatiedostot poistetaan Storagesta erikseen, koska tietokanta ei ulotu
 * sinne. Poisto tehdään vasta rivien jälkeen ja parhaalla yrityksellä:
 * jäljelle jäänyt tiedosto on huono, mutta rivi joka osoittaa poistettuun
 * tiedostoon olisi pahempi.
 */
export async function deleteTenancy(
  userId: string,
  tenancyId: string,
): Promise<DeleteTenancyResult> {
  const facts = await getTenancyDeletionFacts(userId, tenancyId);
  if (!facts) return { ok: false, reason: "not_found" };

  const blocker = tenancyDeletionBlocker(facts);
  if (blocker) return { ok: false, reason: blocker };

  const supabase = getServiceClient();

  const { data: photos } = await supabase
    .from("rs_photos")
    .select("storage_path")
    .eq("tenancy_id", tenancyId);
  const paths = ((photos ?? []) as Array<{ storage_path: string | null }>)
    .map((row) => row.storage_path)
    .filter((path): path is string => Boolean(path));

  const { data, error } = await supabase
    .from("rs_tenancies")
    .delete()
    .eq("id", tenancyId)
    .eq("landlord_user_id", userId)
    // Ehdot uudelleen poistossa: jos allekirjoitus tai maksu alkoi
    // tarkistuksen jälkeen, mitään ei poisteta.
    .in("status", ["draft", "inspection"])
    .is("signing_started_at", null)
    .is("paid_at", null)
    .select("id");

  if (error) {
    console.error("[tenancies] vuokrasuhteen poisto epäonnistui:", error.message);
    return { ok: false, reason: "failed" };
  }
  if (!touched(data)) return { ok: false, reason: "failed" };

  // Merkintä vasta onnistuneen poiston jälkeen, eikä vuokrasuhdeviitettä:
  // rivi on jo poissa. `target_id` kertoo, mikä vuokrasuhde poistettiin.
  await audit(userId, null, "tenancy.deleted", "tenancy", tenancyId);

  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from("photos").remove(paths);
    if (storageError) {
      console.error("[tenancies] kuvatiedostojen poisto epäonnistui:", storageError.message);
    }
  }

  return { ok: true };
}

/**
 * Vuokrasuhteen asunto osapuolelle.
 *
 * `getProperty` rajaa omistajaan, eikä vuokralainen omista asuntoa — mutta
 * hänen on nähtävä osoite sopimuksessa ja katselmuksessa. Tämä on se
 * kapea poikkeus: osoite näkyy sille, joka on vuokrasuhteen osapuoli.
 * Muut asunnon tiedot (kulut, verolaskelma) pysyvät omistajalla.
 */
export async function getTenancyProperty(
  userId: string,
  tenancyId: string,
): Promise<{
  street: string;
  postalCode: string;
  city: string;
  rooms: number | null;
  areaM2: number | null;
  propertyType: PropertyType;
} | null> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy) return null;

  const { data, error } = await getServiceClient()
    .from("rs_properties")
    .select("street, postal_code, city, rooms, area_m2, property_type")
    .eq("id", tenancy.propertyId)
    .maybeSingle();

  if (error) {
    console.error("[tenancies] asunnon haku epäonnistui:", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as {
    street: string;
    postal_code: string;
    city: string;
    property_type: PropertyType;
    rooms: number | null;
    area_m2: number | string | null;
  };

  return {
    street: row.street,
    postalCode: row.postal_code,
    city: row.city,
    rooms: row.rooms,
    // numeric palautuu merkkijonona, kuten `properties.ts`:ssä.
    areaM2: row.area_m2 === null ? null : Number(row.area_m2),
    // Katselmuksen huoneluettelo johdetaan tästä. Ilman sitä vuokralaisen
    // pitäisi lukea asunto omistajan oikeuksilla, mikä olisi väärä reitti.
    propertyType: row.property_type,
  };
}
