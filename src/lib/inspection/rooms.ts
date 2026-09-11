/**
 * Katselmuksen huoneluettelo ja kuvausohje.
 *
 * ===========================================================================
 * HUONE ON RAKENNE, KOHTA EI OLE VAATIMUS
 *
 * Jukan linjaus 2026-09-11:
 *
 *   "Ohjeista ottamaan kuvia huoneittain, mutta älä pakota ottamaan kuvia
 *    mistään tietystä kohdasta, vaan molemmat osapuolet saavat ottaa
 *    haluamansa kuvat."
 *
 * Huoneluettelo on siis kulkureitti asunnon läpi, ei tarkistuslista. Sen
 * tehtävä on estää se, että jokin huone unohtuu kokonaan — ei se, että
 * jokaisesta nurkasta olisi kuva.
 *
 * Aiempi malli kiinnitti kuvan checkpointiin eli ennalta määrättyyn kohtaan.
 * Se johtaa väistämättä siihen, mitä pitkät lomakkeet aina tekevät: loppupää
 * kuitataan katsomatta. Tässä ei ole mitään kuitattavaa.
 *
 * VIHJEET EIVÄT OLE RUUTUJA
 *
 * Huoneella on `hints`-lista siitä, mitä kyseisessä huoneessa yleensä
 * kannattaa katsoa. Ne ovat tekstiä, eivät kohtia: niitä ei voi merkitä
 * tehdyiksi, eikä mikään tarkista onko niistä kuva. Ne ovat siellä, koska
 * silikonisaumat tulevat mieleen vasta kun joku mainitsee ne.
 * ===========================================================================
 */

import { defaultCheckpoints, groupByRoom, type PropertyType } from "../property/default-checkpoints";

export interface InspectionRoom {
  name: string;
  /** Mitä tässä huoneessa yleensä kannattaa katsoa. Vihje, ei vaatimus. */
  hints: string[];
}

/**
 * Kuvausohje, joka näytetään jokaisessa huoneessa.
 *
 * Sanamuoto on Jukan (2026-09-11). Se kertoo kaksi asiaa: mitä tehdä
 * (yleiskuva) ja miksi (riitojen välttäminen). Jälkimmäinen on tärkeämpi —
 * se on ainoa syy, jonka vuoksi kukaan jaksaa kuvata kotiaan.
 */
export const PHOTO_GUIDANCE =
  "Ota yleiskuva huoneesta ja lisäksi niistä kohdista, joiden kunnon haluat muistaa " +
  "riitojen välttämiseksi.";

/** Selitekentän ohje. Vapaaehtoisuus sanotaan ääneen, ettei kenttä tunnu pakolliselta. */
export const NOTE_GUIDANCE =
  "Voit kertoa lyhyesti, miksi kuvasit juuri tämän. Kenttä on vapaaehtoinen.";

/**
 * Huoneet asunnon tyypin ja huoneluvun mukaan.
 *
 * Johdetaan samasta lähteestä kuin oletuskohdat, jotta huoneet ovat samassa
 * järjestyksessä kuin ennenkin: se on se järjestys, jossa asunto kävellään
 * läpi. Sama järjestys toistuu loppukatselmuksessa, jolloin huoneet voi
 * verrata pari kerrallaan ilman etsimistä.
 */
export function inspectionRooms(
  propertyType: PropertyType,
  rooms: number | null | undefined,
): InspectionRoom[] {
  return groupByRoom(defaultCheckpoints(propertyType, rooms)).map((group) => ({
    name: group.room,
    hints: group.items,
  }));
}

/**
 * Huoneluettelo näytettäväksi: oletushuoneet ja ne, joista on jo kuvia.
 *
 * Kuvattu huone, jota listalla ei ole, on osapuolen itse lisäämä. Se näkyy
 * listan lopussa eikä eri tavalla merkittynä: lisätty huone on samanarvoinen
 * oletushuoneen kanssa (DECISIONS.md 2026-09-10).
 */
export function mergeRooms(
  defaults: InspectionRoom[],
  photographed: string[],
): InspectionRoom[] {
  const known = new Set(defaults.map((room) => room.name.toLowerCase()));
  const extra: InspectionRoom[] = [];

  for (const name of photographed) {
    const key = name.trim().toLowerCase();
    if (!key || known.has(key)) continue;
    known.add(key);
    extra.push({ name: name.trim(), hints: [] });
  }

  return [...defaults, ...extra];
}

/**
 * Siistii käyttäjän kirjoittaman huoneen nimen.
 *
 * Tyhjä nimi ei kelpaa: kuva ilman huonetta katoaisi pöytäkirjassa
 * otsikottomaan joukkoon, eikä kukaan tietäisi mistä se on.
 */
export function normalizeRoomName(value: string): string | null {
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, 60);
  return trimmed === "" ? null : trimmed;
}

/**
 * Huoneen nimi osoitteeseen.
 *
 * Nimi voi sisältää kauttaviivan ("Olohuone / makuuhuone"), joka katkaisisi
 * polun, ja ääkkösiä, jotka näyttäisivät osoiterivillä prosenttikoodeina.
 * Siksi osoitteessa on tunniste eikä nimi, ja nimi haetaan takaisin
 * huoneluettelosta — se on joka tapauksessa muodostettava sivua varten.
 */
export function roomSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äå]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Huone tunnisteen perusteella, tai `null` jos sitä ei ole listalla. */
export function findRoomBySlug(rooms: InspectionRoom[], slug: string): InspectionRoom | null {
  return rooms.find((room) => roomSlug(room.name) === slug) ?? null;
}
