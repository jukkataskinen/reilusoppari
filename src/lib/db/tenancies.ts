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
  | { ok: false; reason: "invalid" | "wrong_account" };

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

  if (preview.inviteEmail.toLowerCase() !== userEmail.trim().toLowerCase()) {
    return { ok: false, reason: "wrong_account" };
  }

  const supabase = getServiceClient();

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

/**
 * Luo uuden kutsun samalle osapuolelle.
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
export async function reissueInvite(
  userId: string,
  tenancyId: string,
  partyId: string,
): Promise<IssuedInvite | null> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy || tenancy.landlordUserId !== userId) return null;

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("rs_tenancy_parties")
    .select("id, role, invite_email, user_id")
    .eq("id", partyId)
    .eq("tenancy_id", tenancyId)
    .maybeSingle();

  if (error || !data) return null;

  const party = data as {
    id: string;
    role: string;
    invite_email: string | null;
    user_id: string | null;
  };

  // Jo liittynyt osapuoli ei tarvitse kutsua, ja uusi kutsu ei saa syrjäyttää
  // häntä.
  if (party.role !== "tenant" || party.user_id) return null;

  const invite = createInvite();

  const { error: updateError } = await supabase
    .from("rs_tenancy_parties")
    .update({
      invite_token_hash: invite.tokenHash,
      invite_expires_at: invite.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", partyId)
    .is("user_id", null);

  if (updateError) {
    console.error("[tenancies] kutsun uudelleenluonti epäonnistui:", updateError.message);
    return null;
  }

  return { email: party.invite_email ?? "", name: "", token: invite.token };
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
} | null> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy) return null;

  const { data, error } = await getServiceClient()
    .from("rs_properties")
    .select("street, postal_code, city, rooms, area_m2")
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
  };
}
