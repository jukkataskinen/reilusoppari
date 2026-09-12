import { randomUUID } from "node:crypto";
import { getServiceClient } from "@/lib/db/supabase";
import { stripImageMetadata, UnsupportedImageError } from "./strip-metadata";

/**
 * Pienoiskuvan vastaanotto asiakirjoja varten.
 *
 * ===========================================================================
 * MIKSI PIENOISKUVA ON OLEMASSA
 *
 * Katselmuspöytäkirja piirtää kuvan 158 × 96 pisteen kokoisena. Jos siihen
 * upotetaan 2000 pikselin kuva, kahdenkymmenen kuvan pöytäkirja on noin
 * 13 megatavua — sata kertaa enemmän dataa kuin mitä näkyy. Se osuu
 * `documents`-ämpärin 25 MB:n rajaan, funktion muistiin, allekirjoitettavan
 * tiedoston kokoon ja vuokralaisen puhelimeen mobiiliverkossa.
 *
 * PIENOISKUVA EI OLE TODISTE
 *
 * `sha256` lasketaan aina täysikokoisesta tiedostosta, ja se on se tiiviste,
 * joka pöytäkirjassa lukee. Pienoiskuva on esitys siitä, mihin tiiviste
 * viittaa — samalla tavalla kuin pöytäkirjan kuva on aina ollut pienennetty.
 * Siksi pienoiskuvasta ei lasketa tiivistettä eikä sitä kirjata erikseen
 * lokiin: se on pelkkä kuvakopio, jonka voi luoda uudelleen.
 *
 * EPÄONNISTUMINEN EI SAA KAATAA KUVAUSTA
 *
 * Tämä palauttaa `null`, jos pienoiskuvaa ei tullut tai sitä ei voitu
 * käsitellä. Silloin asiakirja upottaa täysikokoisen kuvan kuten ennen tätä
 * otetuilla kuvilla. Vaihtoehto — hylätä koko kuva, koska sen pikkukopio ei
 * kelvannut — tarkoittaisi katselmuksessa puuttuvaa todistetta.
 * ===========================================================================
 */

/** Pienoiskuva on pieni jo tullessaan; tätä isompi on virhe tai väärinkäyttö. */
const MAX_THUMBNAIL_BYTES = 512 * 1024;

/**
 * Tallentaa lomakkeen `thumbnail`-kentän kuvan ja palauttaa sen polun.
 *
 * `basePath` on täysikokoisen kuvan polku; pienoiskuva tallennetaan samaan
 * kansioon omalla tunnisteellaan, jottei se voi osua sen päälle.
 */
export async function storeThumbnail(
  form: FormData,
  basePath: string,
): Promise<string | null> {
  const file = form.get("thumbnail");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_THUMBNAIL_BYTES) return null;

  let cleaned;
  try {
    cleaned = stripImageMetadata(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    if (!(err instanceof UnsupportedImageError)) {
      console.error("[pienoiskuva] käsittely epäonnistui");
    }
    return null;
  }

  const folder = basePath.slice(0, basePath.lastIndexOf("/"));
  const extension = cleaned.format === "image/png" ? "png" : "jpg";
  const path = `${folder}/pieni-${randomUUID()}.${extension}`;

  const { error } = await getServiceClient()
    .storage.from("photos")
    .upload(path, cleaned.bytes, { contentType: cleaned.format, upsert: false });

  if (error) {
    console.error("[pienoiskuva] tallennus epäonnistui:", error.message);
    return null;
  }

  return path;
}
