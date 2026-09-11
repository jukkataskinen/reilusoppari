/**
 * Osapuolten tunnistetiedot: henkilö- tai y-tunnus, puhelin, sähköposti.
 *
 * ===========================================================================
 * KAKSI LUKUTAPAA, JA VAIN TOINEN ON KÄYTTÖLIITTYMÄÄ VARTEN
 *
 * `listPartyDetails` palauttaa tunnuksen **peitettynä** (131052-***T). Sitä
 * käyttävät sivut ja lomakkeet.
 *
 * `partyDetailsForDocument` palauttaa sen **kokonaisena**, ja sitä kutsuu vain
 * asiakirjan koonti. Funktiot ovat tarkoituksella erillään: jos olisi yksi
 * funktio ja `{ full: true }` -valitsin, joku kirjoittaisi ennen pitkää
 * `full: true` listanäkymään, ja henkilötunnukset olisivat selaimen
 * HTML-lähteessä.
 *
 * MIKSI TIEDOT OVAT OSAPUOLIRIVILLÄ
 *
 * Sopimus on asiakirja tietyltä hetkeltä. Jos se lukisi tiedot käyttäjän
 * profiilista, profiilin muokkaus muuttaisi takautuvasti allekirjoitetun
 * sopimuksen sisältöä. Profiilin tiedot ovat vain esitäyttöä
 * (`getOwnPartyDefaults`).
 * ===========================================================================
 */

import { z } from "zod";
import { getServiceClient } from "../db/supabase";
import { requireTenancyParty } from "../db/access";
import { decryptSensitive, encryptSensitive } from "../identity/crypto";
import {
  isValidHenkilotunnus,
  isValidYTunnus,
  maskHenkilotunnus,
  normalizeHenkilotunnus,
  normalizeYTunnus,
} from "../identity/finnish-id";
import { formatIban, isValidIban, normalizeIban } from "../identity/iban";

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === "" ? null : value))
    .nullable();

export const partyDetailsSchema = z
  .object({
    name: optionalText(200, "Enintään 200 merkkiä"),
    partyType: z.enum(["henkilo", "yritys"]).default("henkilo"),

    /** Henkilötunnus kun osapuoli on henkilö. Tyhjä sallitaan luonnoksessa. */
    personalId: optionalText(11, "Henkilötunnus on 11 merkkiä"),

    /** Y-tunnus ja allekirjoittaja kun osapuoli on yritys. */
    businessId: optionalText(20, "Tarkista y-tunnus"),
    signatoryName: optionalText(200, "Enintään 200 merkkiä"),

    phone: optionalText(40, "Tarkista puhelinnumero"),
    email: optionalText(200, "Tarkista sähköpostiosoite"),

    /** Tili, jolle vuokra maksetaan. Vain vuokranantajalla merkitystä. */
    bankAccount: optionalText(42, "Tarkista tilinumero"),

    /**
     * Tyhjä `personalId` tarkoittaa "säilytä tallennettu" — muuten lomake
     * pyyhkisi tunnuksen joka kerta, kun käyttäjä muuttaa puhelinnumeroaan.
     * Poistaminen on siksi oma valintansa.
     */
    clearPersonalId: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.personalId && !isValidHenkilotunnus(value.personalId)) {
      ctx.addIssue({
        code: "custom",
        path: ["personalId"],
        // Tarkistusmerkki ei kerro, onko tunnus olemassa — vain että se on
        // kirjoitettu oikein. Sanotaan se, ettei virheilmoitus lupaa liikaa.
        message: "Tarkista tunnus: tarkistusmerkki ei täsmää.",
      });
    }

    if (value.businessId && !isValidYTunnus(value.businessId)) {
      ctx.addIssue({
        code: "custom",
        path: ["businessId"],
        message: "Tarkista y-tunnus: tarkistusnumero ei täsmää.",
      });
    }

    if (value.bankAccount && !isValidIban(value.bankAccount)) {
      ctx.addIssue({
        code: "custom",
        path: ["bankAccount"],
        // Väärä tilinumero on ikävämpi kuin väärä henkilötunnus: sen mukaan
        // maksetaan.
        message: "Tarkista tilinumero: tarkistusluku ei täsmää.",
      });
    }

    if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "Tarkista sähköpostiosoite." });
    }

    // Yritys ei allekirjoita itse vaan ihminen sen puolesta. Ilman nimeä
    // sopimuksesta ei kävisi ilmi, kuka sen allekirjoitti.
    if (value.partyType === "yritys" && value.businessId && !value.signatoryName) {
      ctx.addIssue({
        code: "custom",
        path: ["signatoryName"],
        message: "Kerro kuka allekirjoittaa yrityksen puolesta.",
      });
    }
  });

export type PartyDetailsInput = z.infer<typeof partyDetailsSchema>;

/** Käyttöliittymään: tunnus on peitetty. */
export interface PartyDetailsView {
  partyId: string;
  role: "landlord" | "tenant";
  position: number;
  name: string | null;
  partyType: "henkilo" | "yritys";
  /** `131052-***T`, tai y-tunnus kokonaisena — y-tunnus on julkinen tieto. */
  identifierMasked: string | null;
  businessId: string | null;
  signatoryName: string | null;
  phone: string | null;
  email: string | null;
  /** Ryhmitelty luettavaksi: `FI21 1234 5600 0007 85`. */
  bankAccount: string | null;
  /** Onko tämä kirjautuneen käyttäjän oma osapuolirivi? */
  isSelf: boolean;
}

/** Asiakirjaan: tunnus kokonaisena. Ei käyttöliittymään. */
export interface PartyDetailsForDocument {
  role: "landlord" | "tenant";
  position: number;
  name: string | null;
  partyType: "henkilo" | "yritys";
  identifier: string | null;
  signatoryName: string | null;
  phone: string | null;
  email: string | null;
  /** Ryhmitelty luettavaksi: `FI21 1234 5600 0007 85`. */
  bankAccount: string | null;
}

interface PartyRow {
  id: string;
  role: "landlord" | "tenant";
  position: number;
  user_id: string | null;
  party_name: string | null;
  party_type: "henkilo" | "yritys";
  party_id_encrypted: string | null;
  business_id: string | null;
  signatory_name: string | null;
  phone: string | null;
  contact_email: string | null;
  invite_email: string | null;
  bank_account: string | null;
}

const COLUMNS =
  "id, role, position, user_id, party_name, party_type, party_id_encrypted, " +
  "business_id, signatory_name, phone, contact_email, invite_email, bank_account";

async function fetchPartyRows(tenancyId: string): Promise<PartyRow[]> {
  const { data, error } = await getServiceClient()
    .from("rs_tenancy_parties")
    .select(COLUMNS)
    .eq("tenancy_id", tenancyId)
    .order("role", { ascending: true })
    .order("position", { ascending: true });

  if (error) {
    console.error("[party-details] osapuolten haku epäonnistui:", error.message);
    throw new Error("Osapuolten haku epäonnistui.");
  }

  return (data ?? []) as unknown as PartyRow[];
}

/**
 * Osapuolet käyttöliittymään, tunnukset peitettyinä.
 *
 * Peittäminen tehdään palvelimella eikä selaimessa: selaimeen lähetetty
 * kokonainen tunnus olisi sivun lähdekoodissa riippumatta siitä, mitä
 * ruudulla näkyy.
 */
export async function listPartyDetails(
  userId: string,
  tenancyId: string,
): Promise<PartyDetailsView[]> {
  await requireTenancyParty(userId, tenancyId);

  return (await fetchPartyRows(tenancyId)).map((row) => ({
    partyId: row.id,
    role: row.role,
    position: row.position,
    name: row.party_name,
    partyType: row.party_type,
    identifierMasked:
      row.party_type === "yritys"
        ? row.business_id
        : row.party_id_encrypted
          ? maskHenkilotunnus(decryptSensitive(row.party_id_encrypted))
          : null,
    businessId: row.business_id,
    signatoryName: row.signatory_name,
    phone: row.phone,
    email: row.contact_email ?? row.invite_email,
    bankAccount: row.bank_account ? formatIban(row.bank_account) : null,
    isSelf: row.user_id === userId,
  }));
}

/**
 * Osapuolet asiakirjaa varten, tunnukset kokonaisina.
 *
 * Ei ota `userId`-parametria, koska kutsuja on jo tarkistanut oikeuden
 * asiakirjaan. Tämä funktio ei saa päätyä reitin käsittelijään sellaisenaan —
 * sen ainoa kutsuja on `contract-document.ts`.
 */
export async function partyDetailsForDocument(
  tenancyId: string,
): Promise<PartyDetailsForDocument[]> {
  return (await fetchPartyRows(tenancyId)).map((row) => ({
    role: row.role,
    position: row.position,
    name: row.party_name,
    partyType: row.party_type,
    identifier:
      row.party_type === "yritys"
        ? row.business_id
        : row.party_id_encrypted
          ? decryptSensitive(row.party_id_encrypted)
          : null,
    signatoryName: row.signatory_name,
    phone: row.phone,
    email: row.contact_email ?? row.invite_email,
    bankAccount: row.bank_account ? formatIban(row.bank_account) : null,
  }));
}

/**
 * Tiedot kannan sarakkeiksi.
 *
 * `existing` on rivillä jo oleva salattu tunnus. Tyhjä kenttä säilyttää sen;
 * vain `clearPersonalId` poistaa. Yritykseksi vaihtaminen poistaa myös:
 * yrityksellä ei ole henkilötunnusta.
 */
function toColumns(input: PartyDetailsInput, existing: string | null) {
  const personalId = input.personalId ? normalizeHenkilotunnus(input.personalId) : null;

  const encrypted =
    input.partyType === "yritys" || input.clearPersonalId
      ? null
      : personalId
        ? encryptSensitive(personalId)
        : existing;

  return {
    party_name: input.name,
    party_type: input.partyType,
    party_id_encrypted: encrypted,
    business_id: input.businessId ? normalizeYTunnus(input.businessId) : null,
    signatory_name: input.signatoryName,
    phone: input.phone,
    contact_email: input.email,
    // Tallennetaan välittömässä muodossa; ryhmitys tehdään luettaessa, jotta
    // kannassa on yksi muoto eikä kahta.
    bank_account: input.bankAccount ? normalizeIban(input.bankAccount) : null,
  };
}

/**
 * Tallentaa yhden osapuolen tiedot.
 *
 * ===========================================================================
 * KUKA SAA MUOKATA KENENKIN TIETOJA
 *
 * Vuokranantaja saa täyttää myös vuokralaisen tiedot: sopimus kirjoitetaan
 * käytännössä usein valmiiksi ennen kuin vuokralainen on kirjautunut, eikä
 * puolityhjä sopimus ole kenenkään etu.
 *
 * Vuokralainen saa muokata **vain omaa** riviään. Hän ei siis voi muuttaa
 * vuokranantajan tunnistetietoja eikä toisen vuokralaisen.
 * ===========================================================================
 */
export async function savePartyDetails(
  userId: string,
  tenancyId: string,
  partyId: string,
  input: PartyDetailsInput,
): Promise<{ ok: true } | { ok: false; reason: "not_allowed" }> {
  await requireTenancyParty(userId, tenancyId);

  const rows = await fetchPartyRows(tenancyId);
  const target = rows.find((row) => row.id === partyId);
  if (!target) return { ok: false, reason: "not_allowed" };

  const isLandlord = rows.some((row) => row.user_id === userId && row.role === "landlord");
  if (!isLandlord && target.user_id !== userId) return { ok: false, reason: "not_allowed" };

  const { error } = await getServiceClient()
    .from("rs_tenancy_parties")
    .update({ ...toColumns(input, target.party_id_encrypted), updated_at: new Date().toISOString() })
    .eq("id", partyId)
    .eq("tenancy_id", tenancyId);

  if (error) {
    console.error("[party-details] tallennus epäonnistui:", error.message);
    throw new Error("Tietojen tallennus epäonnistui.");
  }

  return { ok: true };
}

interface UserDefaultsRow {
  name: string | null;
  party_type: "henkilo" | "yritys";
  party_id_encrypted: string | null;
  business_id: string | null;
  signatory_name: string | null;
  phone: string | null;
  email: string;
  bank_account: string | null;
}

const USER_COLUMNS =
  "name, party_type, party_id_encrypted, business_id, signatory_name, phone, email, bank_account";

/**
 * Vuokranantajan omat perustiedot (`rs_users`).
 *
 * Nämä eivät ole minkään sopimuksen sisältöä vaan esitäyttöä: vuokranantajan
 * tiedot pysyvät samoina vuokrasuhteesta toiseen, eikä niitä kannata
 * kirjoittaa joka kerta uudelleen.
 */
export async function getOwnPartyDefaults(userId: string): Promise<PartyDetailsView> {
  const { data, error } = await getServiceClient()
    .from("rs_users")
    .select(USER_COLUMNS)
    .eq("id", userId)
    .single();

  if (error || !data) {
    console.error("[party-details] perustietojen haku epäonnistui:", error?.message);
    throw new Error("Perustietojen haku epäonnistui.");
  }

  const row = data as unknown as UserDefaultsRow;

  return {
    partyId: userId,
    role: "landlord",
    position: 0,
    name: row.name,
    partyType: row.party_type,
    identifierMasked:
      row.party_type === "yritys"
        ? row.business_id
        : row.party_id_encrypted
          ? maskHenkilotunnus(decryptSensitive(row.party_id_encrypted))
          : null,
    businessId: row.business_id,
    signatoryName: row.signatory_name,
    phone: row.phone,
    email: row.email,
    bankAccount: row.bank_account ? formatIban(row.bank_account) : null,
    isSelf: true,
  };
}

export async function saveOwnPartyDefaults(
  userId: string,
  input: PartyDetailsInput,
): Promise<void> {
  const { data: current } = await getServiceClient()
    .from("rs_users")
    .select("party_id_encrypted")
    .eq("id", userId)
    .single();

  const columns = toColumns(
    input,
    (current as { party_id_encrypted: string | null } | null)?.party_id_encrypted ?? null,
  );

  const { error } = await getServiceClient()
    .from("rs_users")
    .update({
      name: columns.party_name,
      party_type: columns.party_type,
      party_id_encrypted: columns.party_id_encrypted,
      business_id: columns.business_id,
      signatory_name: columns.signatory_name,
      phone: columns.phone,
      bank_account: columns.bank_account,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    console.error("[party-details] perustietojen tallennus epäonnistui:", error.message);
    throw new Error("Perustietojen tallennus epäonnistui.");
  }
}

/**
 * Vuokranantajan perustiedot uuden osapuolirivin sarakkeiksi.
 *
 * Tämä on se hyöty, jonka vuoksi perustiedot ovat olemassa: tiedot
 * kirjoitetaan kerran, ei joka sopimukseen uudelleen. Salattu tunnus
 * kopioidaan sellaisenaan — sitä ei pureta matkalla, joten selkokielinen arvo
 * ei käy muistissa turhaan.
 */
export async function ownPartyDefaultColumns(
  userId: string,
): Promise<Record<string, unknown>> {
  const { data } = await getServiceClient()
    .from("rs_users")
    .select(USER_COLUMNS)
    .eq("id", userId)
    .single();

  if (!data) return {};

  const row = data as unknown as UserDefaultsRow;

  return {
    party_name: row.name,
    party_type: row.party_type,
    party_id_encrypted: row.party_id_encrypted,
    business_id: row.business_id,
    signatory_name: row.signatory_name,
    phone: row.phone,
    contact_email: row.email,
    bank_account: row.bank_account,
  };
}

/**
 * Kopioi omat perustiedot yhdelle osapuoliriville.
 *
 * Perustiedot kopioituvat automaattisesti vain vuokrasuhdetta luotaessa. Tämä
 * on sitä varten, että ne saa myös jälkikäteen: vuokrasuhde on voitu luoda
 * ennen kuin perustiedot oli täytetty, tai ne ovat sittemmin muuttuneet.
 *
 * Vain omalle riville. Toisen osapuolen riville kopioituna nämä olisivat
 * väärän ihmisen tiedot.
 */
export async function applyOwnDefaults(
  userId: string,
  tenancyId: string,
  partyId: string,
): Promise<{ ok: true } | { ok: false; reason: "not_allowed" }> {
  await requireTenancyParty(userId, tenancyId);

  const target = (await fetchPartyRows(tenancyId)).find((row) => row.id === partyId);
  if (!target || target.user_id !== userId) return { ok: false, reason: "not_allowed" };

  const { error } = await getServiceClient()
    .from("rs_tenancy_parties")
    .update({ ...(await ownPartyDefaultColumns(userId)), updated_at: new Date().toISOString() })
    .eq("id", partyId)
    .eq("tenancy_id", tenancyId);

  if (error) {
    console.error("[party-details] perustietojen kopiointi epäonnistui:", error.message);
    throw new Error("Tietojen kopiointi epäonnistui.");
  }

  return { ok: true };
}

/**
 * Mitä sopimuksesta puuttuu?
 *
 * Puuttuva tieto ei näy asiakirjassa mitenkään — tyhjä kohta sopimuksessa
 * näyttäisi siltä, että siihen kuuluisi kirjoittaa kynällä. Siksi puutteet
 * kerrotaan sovelluksessa, ennen allekirjoitusta.
 */
export function missingPartyDetails(parties: PartyDetailsView[]): string[] {
  const puuttuu: string[] = [];

  for (const party of parties) {
    const kuka = party.role === "landlord" ? "Vuokranantajan" : "Vuokralaisen";

    if (!party.name) puuttuu.push(`${kuka} nimi`);
    if (!party.identifierMasked) {
      puuttuu.push(party.partyType === "yritys" ? `${kuka} y-tunnus` : `${kuka} henkilötunnus`);
    }
    if (party.partyType === "yritys" && !party.signatoryName) {
      puuttuu.push(`${kuka} allekirjoittaja`);
    }
    if (party.role === "landlord" && !party.bankAccount) {
      puuttuu.push("Tilinumero, jolle vuokra maksetaan");
    }
  }

  return puuttuu;
}

/** Lomakedata zodille. */
export function partyDetailsFormToInput(form: FormData, prefix = ""): Record<string, unknown> {
  const text = (key: string) => {
    const value = form.get(`${prefix}${key}`);
    return typeof value === "string" ? value.trim() : "";
  };

  const isCompany = text("partyType") === "yritys";

  return {
    name: text("name"),
    partyType: isCompany ? "yritys" : "henkilo",
    // Vain se tunnus, joka vastaa valittua tyyppiä. Muuten lomakkeelle jäänyt
    // toisen tyypin arvo tallentuisi näkymättömissä.
    personalId: isCompany ? "" : text("personalId"),
    businessId: isCompany ? text("businessId") : "",
    signatoryName: isCompany ? text("signatoryName") : "",
    phone: text("phone"),
    email: text("email"),
    bankAccount: text("bankAccount"),
    clearPersonalId: form.get(`${prefix}clearPersonalId`) === "on",
  };
}
