/**
 * ZIP-tiedoston kirjoitus ilman riippuvuutta.
 *
 * ===========================================================================
 * MIKSI KÄSIN
 *
 * Sama peruste kuin metatietojen poistossa (`photos/strip-metadata.ts`) ja
 * Stripe-liitännässä: muoto on pieni ja tarkasti määritelty, ja kirjasto
 * toisi mukanaan oman versiosyklinsä. Tarvittava osa ZIP-muodosta on kolme
 * tietuetta, ja pakkaus tulee Noden omasta `zlib`:stä.
 *
 * TÄMÄ ON TESTATTU ULKOPUOLISELLA LUKIJALLA
 *
 * Itse kirjoitetun ja itse luetun tiedoston pyöräytys ei todista mitään:
 * sama väärinkäsitys olisi molemmissa päissä. Testit avaavat tuotetun
 * tiedoston Pythonin `zipfile`-moduulilla, joka ei tiedä tästä koodista
 * mitään. Jos se avautuu sillä, se avautuu myös käyttäjän koneella.
 *
 * MITÄ TÄSTÄ PUUTTUU TARKOITUKSELLA
 *
 * Ei ZIP64:ää, ei salausta, ei hakemistotietueita. Vientipaketti on
 * kymmeniä megatavuja eikä gigatavuja, eikä sen sisällä ole mitään, mitä ei
 * jo ole käyttäjän omassa näkymässä. Yli neljän gigatavun tiedosto heittää
 * sen sijaan, että kirjoittaisi rikkinäisen tiedoston hiljaa.
 * ===========================================================================
 */

import { deflateRawSync } from "node:zlib";

export interface ZipEntry {
  /** Polku paketin sisällä, esimerkiksi `vuokrasuhteet/2026/sopimus.pdf`. */
  name: string;
  bytes: Uint8Array;
  /**
   * Pakataanko?
   *
   * `false` jo pakatulle sisällölle — JPEG ja PDF eivät pienene deflatella,
   * ja niiden pakkaaminen uudelleen on pelkkää suoritinaikaa.
   */
  compress?: boolean;
}

/** ZIP tallentaa ajan MS-DOSin muodossa: sekunnit kahden tarkkuudella. */
function dosTime(date: Date): { time: number; date: number } {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);

  const dosDate =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  return { time, date: dosDate };
}

/** CRC-32 -taulukko. Rakennetaan kerran ensimmäisellä käytöllä. */
let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;

  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }

  crcTable = table;
  return table;
}

/**
 * CRC-32 ZIPin muodossa.
 *
 * ZIP vaatii tarkistussumman jokaisesta tiedostosta, ja purkuohjelma hylkää
 * tiedoston, jos se ei täsmää. Tämä on siis se kohta, jossa hiljainen virhe
 * muuttuu näkyväksi virheeksi — mikä on tarkoitus.
 */
export function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;

  for (let i = 0; i < bytes.length; i += 1) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/** Neljän gigatavun raja: sitä isompi vaatisi ZIP64:n. */
const MAX_SIZE = 0xffffffff;

/**
 * Kokoaa ZIP-tiedoston.
 *
 * `modifiedAt` on kaikkien merkintöjen aikaleima. Se annetaan ulkoa, jotta
 * testi voi tuottaa saman tiedoston kahdesti — ja koska vientipaketin
 * yksittäisten tiedostojen kellonajoilla ei ole merkitystä, vain sillä
 * milloin vienti tehtiin.
 */
export function createZip(entries: ZipEntry[], modifiedAt: Date = new Date()): Uint8Array {
  const { time, date } = dosTime(modifiedAt);

  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = Buffer.from(entry.bytes);

    const compress = entry.compress ?? true;
    const body = compress ? deflateRawSync(raw) : raw;

    // Pakattu suuremmaksi kuin alkuperäinen: tallennetaan pakkaamattomana.
    // Se tapahtuu pienillä ja jo pakatuilla tiedostoilla.
    const useDeflate = compress && body.length < raw.length;
    const data = useDeflate ? body : raw;
    const method = useDeflate ? 8 : 0;

    if (raw.length > MAX_SIZE || data.length > MAX_SIZE) {
      throw new Error(`Tiedosto on liian suuri ZIP-pakettiin: ${entry.name}`);
    }

    const crc = crc32(raw);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); // Paikallisen tietueen tunnus
    header.writeUInt16LE(20, 4); // Vaadittu versio
    header.writeUInt16LE(0x0800, 6); // Lippu: nimi on UTF-8:aa
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28); // Ei lisäkenttiä

    local.push(header, name, data);

    const entryHeader = Buffer.alloc(46);
    entryHeader.writeUInt32LE(0x02014b50, 0); // Keskushakemiston tunnus
    entryHeader.writeUInt16LE(20, 4); // Kirjoittajan versio
    entryHeader.writeUInt16LE(20, 6); // Vaadittu versio
    entryHeader.writeUInt16LE(0x0800, 8);
    entryHeader.writeUInt16LE(method, 10);
    entryHeader.writeUInt16LE(time, 12);
    entryHeader.writeUInt16LE(date, 14);
    entryHeader.writeUInt32LE(crc, 16);
    entryHeader.writeUInt32LE(data.length, 20);
    entryHeader.writeUInt32LE(raw.length, 24);
    entryHeader.writeUInt16LE(name.length, 28);
    entryHeader.writeUInt16LE(0, 30); // Ei lisäkenttiä
    entryHeader.writeUInt16LE(0, 32); // Ei kommenttia
    entryHeader.writeUInt16LE(0, 34); // Levy 0
    entryHeader.writeUInt16LE(0, 36); // Sisäiset määreet
    entryHeader.writeUInt32LE(0, 38); // Ulkoiset määreet
    entryHeader.writeUInt32LE(offset, 42);

    central.push(entryHeader, name);

    offset += header.length + name.length + data.length;
  }

  const centralBytes = Buffer.concat(central);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // Lopputietueen tunnus
  end.writeUInt16LE(0, 4); // Tämä levy
  end.writeUInt16LE(0, 6); // Keskushakemiston levy
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // Ei kommenttia

  return new Uint8Array(Buffer.concat([...local, centralBytes, end]));
}

/**
 * Siivoaa nimen paketin sisälle kelpaavaksi.
 *
 * Kenoviivat, kaksoispisteet ja polun ylöspäin vievät osat pois: käyttäjän
 * kirjoittama teksti (asunnon nimi) päätyy tiedostonimeen, eikä
 * purkuohjelmaa saa ohjata kirjoittamaan paketin ulkopuolelle.
 */
export function safeName(text: string): string {
  return (
    text
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\.\./g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "nimeton"
  );
}
