/**
 * Asuntojen luku ja kirjoitus (`rs_properties`, CLAUDE.md 5.1).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: vain palvelinkoodi, ja **jokainen funktio ottaa
 *    `userId`:n ensimmäisenä parametrina**. Se ei ole tyylivalinta: kysely
 *    ajetaan `service_role`-avaimella, joka ohittaa RLS:n, joten rajaus on
 *    koodin vastuulla. Jos parametri olisi valinnainen tai viimeisenä, sen
 *    unohtaminen olisi helppoa eikä mikään huomauttaisi.
 * 2. Henkilötieto: asunnon osoite on henkilötietoa, kun se yhdistyy
 *    omistajaan. Ei lokiteta.
 * 3. Syöte: validoitu zodilla (`property/schema.ts`) ennen tänne tuloa.
 * 4. IDOR: `getProperty` palauttaa `null`, jos asunto ei ole kutsujan —
 *    sama vastaus kuin olemattomalle id:lle, jolloin id:n olemassaolo ei
 *    paljastu.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: tietokannan virheviesti ei mene käyttäjälle asti.
 * 7. Lokitus: vain virheen viesti, ei riviä.
 * ===========================================================================
 */

import { getServiceClient } from "./supabase";
import { defaultCheckpoints } from "../property/default-checkpoints";
import type { PropertyInput } from "../property/schema";

export interface Property {
  id: string;
  name: string | null;
  street: string;
  postalCode: string;
  city: string;
  propertyType: "kerrostalo" | "rivitalo" | "omakotitalo" | "muu";
  rooms: number | null;
  areaM2: number | null;
  housingCompany: string | null;
  tenure: "osake" | "kiinteisto" | "muu" | null;
  createdAt: string;
}

interface PropertyRow {
  id: string;
  name: string | null;
  street: string;
  postal_code: string;
  city: string;
  property_type: Property["propertyType"];
  rooms: number | null;
  area_m2: number | string | null;
  housing_company: string | null;
  tenure: Property["tenure"];
  created_at: string;
}

const COLUMNS =
  "id, name, street, postal_code, city, property_type, rooms, area_m2, housing_company, tenure, created_at";

function fromRow(row: PropertyRow): Property {
  return {
    id: row.id,
    name: row.name,
    street: row.street,
    postalCode: row.postal_code,
    city: row.city,
    propertyType: row.property_type,
    rooms: row.rooms,
    // numeric palautuu merkkijonona; muunnos tehdään tässä eikä näkymissä.
    areaM2: row.area_m2 === null ? null : Number(row.area_m2),
    housingCompany: row.housing_company,
    tenure: row.tenure,
    createdAt: row.created_at,
  };
}

/** Käyttäjän asunnot, uusin ensin. Arkistoidut jätetään pois. */
export async function listProperties(userId: string): Promise<Property[]> {
  const { data, error } = await getServiceClient()
    .from("rs_properties")
    .select(COLUMNS)
    .eq("owner_user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[properties] listaus epäonnistui:", error.message);
    throw new Error("Asuntojen haku epäonnistui.");
  }

  return (data as PropertyRow[]).map(fromRow);
}

/**
 * Yksi asunto, jos se on kutsujan oma. Muuten `null`.
 *
 * Omistajarajaus on osa kyselyä eikä erillinen tarkistus sen jälkeen: näin
 * "ei löytynyt" ja "ei oikeutta" ovat sama tapaus, eikä väliin voi jäädä
 * polkua, jossa rivi on jo haettu mutta tarkistus unohtunut.
 */
export async function getProperty(userId: string, propertyId: string): Promise<Property | null> {
  const { data, error } = await getServiceClient()
    .from("rs_properties")
    .select(COLUMNS)
    .eq("id", propertyId)
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[properties] haku epäonnistui:", error.message);
    throw new Error("Asunnon haku epäonnistui.");
  }

  return data ? fromRow(data as PropertyRow) : null;
}

export interface Checkpoint {
  id: string;
  room: string;
  item: string;
  position: number;
  /** `null` = oletuslistalta. Muuten sen osapuolen id, joka lisäsi kohdan. */
  addedByUserId: string | null;
}

/** Asunnon aktiiviset checkpointit järjestyksessä. Omistajarajaus asunnon kautta. */
export async function listCheckpoints(userId: string, propertyId: string): Promise<Checkpoint[]> {
  // Tarkistetaan omistajuus ensin: ilman tätä kuka tahansa kirjautunut voisi
  // lukea toisen asunnon kohtalistan pelkällä id:llä.
  const property = await getProperty(userId, propertyId);
  if (!property) return [];

  const { data, error } = await getServiceClient()
    .from("rs_checkpoints")
    .select("id, room, item, position, added_by_user_id")
    .eq("property_id", propertyId)
    .eq("active", true)
    .order("position", { ascending: true });

  if (error) {
    console.error("[properties] checkpointien haku epäonnistui:", error.message);
    throw new Error("Kohtalistan haku epäonnistui.");
  }

  return (data as Array<{
    id: string;
    room: string;
    item: string;
    position: number;
    added_by_user_id: string | null;
  }>).map((row) => ({
    id: row.id,
    room: row.room,
    item: row.item,
    position: row.position,
    addedByUserId: row.added_by_user_id,
  }));
}

/**
 * Luo asunnon ja sen oletus-checkpointit.
 *
 * Checkpointit luodaan heti, koska ne ovat asunnon ominaisuus eivätkä
 * vuokrasuhteen: sama lista käydään läpi jokaisessa katselmuksessa, ja
 * kummankin osapuolen lisäykset jäävät asunnolle seuraavaa kertaa varten
 * (CLAUDE.md 5.3).
 *
 * `added_by_user_id` jätetään NULLiksi: nämä eivät ole kenenkään lisäämiä
 * vaan generoituja. Ero on näkyvissä pöytäkirjassa, jossa kerrotaan kumpi
 * osapuoli minkäkin kohdan lisäsi.
 */
export async function createProperty(userId: string, input: PropertyInput): Promise<Property> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("rs_properties")
    .insert({
      owner_user_id: userId,
      name: input.name ?? null,
      street: input.street,
      postal_code: input.postalCode,
      city: input.city,
      property_type: input.propertyType,
      rooms: input.rooms ?? null,
      area_m2: input.areaM2 ?? null,
      housing_company: input.housingCompany ?? null,
      tenure: input.tenure ?? null,
    })
    .select(COLUMNS)
    .single();

  if (error || !data) {
    console.error("[properties] luonti epäonnistui:", error?.message);
    throw new Error("Asunnon tallennus epäonnistui.");
  }

  const property = fromRow(data as PropertyRow);

  const seeds = defaultCheckpoints(property.propertyType, property.rooms);
  const { error: checkpointError } = await supabase.from("rs_checkpoints").insert(
    seeds.map((seed, index) => ({
      property_id: property.id,
      room: seed.room,
      item: seed.item,
      position: index,
    })),
  );

  if (checkpointError) {
    // Asunto on jo tallennettu. Kohtalista voidaan täydentää myöhemmin, ja
    // kumpi tahansa osapuoli voi lisätä kohtia käsin — joten tästä ei kaadeta
    // koko luontia. Virhe on silti todellinen ja se lokitetaan.
    console.error("[properties] oletuskohtien luonti epäonnistui:", checkpointError.message);
  }

  return property;
}

/** Arkistointi, ei poisto: vuokrasuhteet ja todistukset viittaavat asuntoon. */
export async function archiveProperty(userId: string, propertyId: string): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from("rs_properties")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", propertyId)
    .eq("owner_user_id", userId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[properties] arkistointi epäonnistui:", error.message);
    throw new Error("Asunnon arkistointi epäonnistui.");
  }

  return data !== null;
}
