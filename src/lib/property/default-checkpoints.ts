/**
 * Oletus-checkpointit asuntotyypin ja huoneluvun mukaan (CLAUDE.md kohta 5.3).
 *
 * ===========================================================================
 * TÄRKEÄ RAJAUS
 *
 * Tämä lista on **muistin tueksi, ei rajoite** (DECISIONS.md 2026-09-10).
 * Kumpi tahansa osapuoli voi lisätä oman kohtansa, ja lisätty kohta on
 * samanarvoinen näiden kanssa. Käyttöliittymä ei saa esittää tätä listaa
 * "oikeana" ja lisäyksiä poikkeuksena.
 *
 * Lista on siksi tarkoituksella melko lyhyt: pitkä lista, jonka läpikäynti
 * uuvuttaa, johtaa siihen että loppupää kuitataan katsomatta. Parempi on
 * kattaa se mistä erimielisyydet oikeasti syntyvät ja jättää tilaa sille,
 * minkä osapuolet itse huomaavat.
 * ===========================================================================
 */

export type PropertyType = "kerrostalo" | "rivitalo" | "omakotitalo" | "muu";

export interface CheckpointSeed {
  room: string;
  item: string;
}

/** Joka huoneelle samat perusasiat. */
const PER_ROOM: string[] = ["Lattia", "Seinät ja katto", "Ikkunat", "Ovi"];

const KITCHEN: string[] = [
  "Lattia",
  "Työtasot",
  "Välitila",
  "Kaapistot ja vetimet",
  "Liesi ja uuni",
  "Liesituuletin",
  "Jääkaappi ja pakastin",
  "Astianpesukoneen liitäntä",
  "Hana ja allas",
];

const BATHROOM: string[] = [
  "Lattia ja lattiakaivo",
  "Seinälaatoitus",
  "Silikonisaumat",
  "Suihku ja suihkuseinä",
  "Hanat",
  "WC-istuin",
  "Pesukoneliitäntä",
  "Ilmanvaihtoventtiili",
];

/** Yleiset kohdat, jotka eivät kuulu yhteenkään huoneeseen. */
const GENERAL: string[] = [
  "Avaimet",
  "Ovikello",
  "Palovaroitin",
  "Sähkökeskus ja mittarilukema",
  "Vesimittarin lukema",
];

const OUTDOOR_BY_TYPE: Record<PropertyType, string[]> = {
  kerrostalo: ["Parveke", "Varasto"],
  rivitalo: ["Terassi tai piha-alue", "Varasto", "Autopaikka tai -katos"],
  omakotitalo: [
    "Piha-alue",
    "Ulkoseinät ja sokkeli",
    "Katto ja räystäät",
    "Varasto tai autotalli",
    "Lämmitysjärjestelmä",
  ],
  muu: ["Varasto"],
};

const SAUNA_BY_TYPE: Record<PropertyType, boolean> = {
  kerrostalo: false,
  rivitalo: true,
  omakotitalo: true,
  muu: false,
};

/**
 * Huonenimet huoneluvun mukaan. `rooms` on suomalainen huoneluku, jossa
 * keittiötä EI lasketa mukaan: 2h+k tarkoittaa kahta huonetta ja keittiötä.
 *
 * Yksiössä ainoa huone on "Olohuone / makuuhuone", koska se on molempia.
 */
function livingRoomNames(rooms: number): string[] {
  const count = Math.max(1, Math.min(10, Math.floor(rooms || 1)));
  if (count === 1) return ["Olohuone / makuuhuone"];

  const names = ["Olohuone"];
  for (let i = 1; i < count; i += 1) {
    names.push(count === 2 ? "Makuuhuone" : `Makuuhuone ${i}`);
  }
  return names;
}

/**
 * Rakentaa oletuslistan. Järjestys on se, jossa asunto kävellään läpi:
 * eteinen, asuinhuoneet, keittiö, kylpyhuone, sauna, ulkotilat, yleiset.
 *
 * Sama järjestys toistetaan loppukatselmuksessa, jotta kohdat voi verrata
 * pari kerrallaan ilman etsimistä.
 */
export function defaultCheckpoints(
  propertyType: PropertyType,
  rooms: number | null | undefined,
): CheckpointSeed[] {
  const seeds: CheckpointSeed[] = [];
  const add = (room: string, items: string[]) => {
    for (const item of items) seeds.push({ room, item });
  };

  add("Eteinen", [...PER_ROOM, "Säilytystilat"]);

  for (const room of livingRoomNames(rooms ?? 1)) {
    add(room, PER_ROOM);
  }

  add("Keittiö", KITCHEN);
  add("Kylpyhuone", BATHROOM);

  if (SAUNA_BY_TYPE[propertyType]) {
    add("Sauna", ["Lauteet", "Kiuas", "Lattia ja kaivo", "Paneelit"]);
  }

  add("Ulkotilat", OUTDOOR_BY_TYPE[propertyType]);
  add("Yleiset", GENERAL);

  return seeds;
}

/** Käyttöliittymän ryhmittely: huone → kohdat, alkuperäisessä järjestyksessä. */
export function groupByRoom(seeds: CheckpointSeed[]): { room: string; items: string[] }[] {
  const order: string[] = [];
  const byRoom = new Map<string, string[]>();

  for (const seed of seeds) {
    if (!byRoom.has(seed.room)) {
      byRoom.set(seed.room, []);
      order.push(seed.room);
    }
    byRoom.get(seed.room)!.push(seed.item);
  }

  return order.map((room) => ({ room, items: byRoom.get(room)! }));
}
