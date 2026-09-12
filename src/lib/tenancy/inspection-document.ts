/**
 * Katselmuksen tiedot pöytäkirjaksi (CLAUDE.md 5.3).
 *
 * ===========================================================================
 * KUVAT UPOTETAAN, EI LINKITETÄ
 *
 * Jokainen kuva ladataan Storagesta ja upotetaan asiakirjaan data-URI:na.
 * Vaihtoehto olisi ollut signed URL, mutta se vanhenee tunnissa: sinetöity
 * pöytäkirja, jonka kuvat ovat linkkejä, olisi vuoden päästä tyhjä kehysten
 * sarja. Asiakirjan on oltava itsenäinen.
 *
 * UPOTETTAVA KUVA ON PIENOISKUVA
 *
 * Asiakirja piirtää kuvan 158 × 96 pisteen kokoisena. Täysikokoisena (2000 px)
 * kahdenkymmenen kuvan pöytäkirja olisi noin 13 megatavua — enemmän kuin
 * `documents`-ämpäri ottaa vastaan, ja ikävä lataus vuokralaisen puhelimeen.
 * Siksi upotetaan `thumbnailPath`, kun se on olemassa.
 *
 * Todistusarvo ei muutu: `sha256` on täysikokoisen tiedoston tiiviste, ja se
 * on se, joka pöytäkirjassa lukee. Kuva asiakirjassa osoittaa mihin tiiviste
 * viittaa; se on aina ollut pienennetty esitys.
 *
 * KUVAT LADATAAN RINNAKKAIN
 *
 * Peräkkäin ladattuna kaksikymmentä kuvaa on parikymmentä sekuntia pelkkää
 * odottamista ennen kuin renderöinti alkaa, ja funktion aikaraja tulee
 * vastaan. Rinnakkaisuus rajataan `SAMANAIKAISIA`:aan, jottei yksi iso
 * katselmus avaa satoja yhteyksiä kerralla.
 *
 * HUONEIDEN JÄRJESTYS ON ASUNNON KULKUJÄRJESTYS
 *
 * Sama järjestys kuin käyttöliittymässä: eteinen, asuinhuoneet, keittiö,
 * kylpyhuone, sauna, ulkotilat. Itse lisätyt tilat tulevat perään siinä
 * järjestyksessä, jossa ne kuvattiin. Loppukatselmus noudattaa samaa
 * järjestystä, jolloin tilat voi verrata ilman etsimistä.
 * ===========================================================================
 */

import type {
  InspectionProtocolData,
  InspectionRoomGroup,
} from "@/documents/InspectionProtocol";
import { downloadPhoto, getInspectionOverview, type InspectionKind } from "../db/inspections";
import { getTenancy, getTenancyProperty } from "../db/tenancies";
import { listPartyDetails } from "./party-details";
import { inspectionRooms, mergeRooms } from "../inspection/rooms";

/**
 * Montako kuvaa ladataan yhtä aikaa.
 *
 * Kahdeksan on kompromissi: se poistaa peräkkäisyyden hitauden, muttei tee
 * yhdestä pöytäkirjasta kuormapiikkiä, joka hidastaisi muita samaan aikaan
 * kuvaavia.
 */
const SAMANAIKAISIA = 8;

/** Kuvan tavut asiakirjaan upotettavaksi. */
function toDataUri(bytes: Uint8Array, path: string): string {
  const format = path.endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${format};base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * Kokoaa pöytäkirjan. `null`, jos kutsuja ei ole osapuoli tai katselmusta ei
 * ole vielä lukittu — lukitsematon katselmus ei ole pöytäkirja vaan luonnos,
 * ja luonnoksesta tehty asiakirja näyttäisi valmiilta olematta sitä.
 */
export async function buildInspectionProtocolData(
  userId: string,
  tenancyId: string,
  kind: InspectionKind = "initial",
): Promise<InspectionProtocolData | null> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy) return null;

  const [overview, property, parties] = await Promise.all([
    getInspectionOverview(userId, tenancyId, kind),
    getTenancyProperty(userId, tenancyId),
    listPartyDetails(userId, tenancyId),
  ]);

  if (!property) return null;
  if (overview.inspection.status === "open" || !overview.inspection.lockedAt) return null;

  const landlord = parties.find((party) => party.role === "landlord");
  const tenants = parties.filter((party) => party.role === "tenant");

  // Huoneet oletusjärjestyksessä, itse lisätyt perässä.
  const order = mergeRooms(
    inspectionRooms(property.propertyType, property.rooms),
    overview.photos.map((photo) => photo.room ?? ""),
  ).map((room) => room.name);

  const byRoom = new Map<string, InspectionRoomGroup>();
  for (const name of order) byRoom.set(name, { name, photos: [] });

  // Ladataan rinnakkain mutta säilytetään kuvausjärjestys: tulos indeksoidaan
  // samaan järjestykseen kuin `overview.photos`, ja ryhmiin lisätään vasta
  // sen jälkeen. Muuten pöytäkirjan kuvat olisivat siinä järjestyksessä,
  // jossa verkko sattui vastaamaan.
  const embedded = await inBatches(overview.photos, SAMANAIKAISIA, async (photo) => {
    // Pienoiskuva, jos sellainen on. Ennen 2026-09-12 otetuilla kuvilla ei
    // ole, jolloin upotetaan täysikokoinen kuten ennenkin.
    const path = photo.thumbnailPath ?? photo.storagePath;
    const bytes = (await downloadPhoto(path)) ?? (await fallback(photo.thumbnailPath, photo.storagePath));
    return bytes ? toDataUri(bytes, path) : null;
  });

  overview.photos.forEach((photo, index) => {
    const name = photo.room ?? "Muut";
    if (!byRoom.has(name)) byRoom.set(name, { name, photos: [] });

    const dataUri = embedded[index];
    // Kuva, jota ei saada ladattua, jätetään pois eikä korvata
    // paikanvaraajalla: tyhjä kehys pöytäkirjassa näyttäisi todisteelta,
    // jota ei ole. Tiiviste jää silti liitteeseen puuttuvana rivinä.
    if (!dataUri) return;

    byRoom.get(name)!.photos.push({
      dataUri,
      takenAt: photo.takenAtServer,
      takenByName:
        photo.uploaderName ??
        (photo.uploaderRole === "landlord" ? "Vuokranantaja" : "Vuokralainen"),
      takenByRole: photo.uploaderRole,
      sha256: photo.sha256,
      note: photo.note,
      flaggedReason: photo.flagged ? (photo.flaggedReason ?? "syytä ei kerrottu") : null,
    });
  });

  return {
    kind,
    property: {
      street: property.street,
      postalCode: property.postalCode,
      city: property.city,
    },
    landlordName: landlord?.name ?? "",
    tenantNames: tenants.map((party) => party.name ?? ""),
    lockedAt: overview.inspection.lockedAt,
    /*
      Lukitsija on vuokranantaja: säännön mukaan kukaan muu ei voi lukita
      (`inspection/lock.ts`). Nimi luetaan silti osapuoliriviltä eikä
      kirjoiteta kiinteäksi tekstiksi — asiakirjassa lukee se nimi, joka on
      sopimuksessakin.
    */
    lockedByName: landlord?.name ?? "",
    rooms: [...byRoom.values()],
    place: property.city,
  };
}

/**
 * Jos pienoiskuva on kadonnut Storagesta, kokeillaan täysikokoista.
 *
 * Pienoiskuva ei ole todiste vaan kopio, joten sen puuttuminen ei saa pudottaa
 * kuvaa pöytäkirjasta — täysikokoinen on edelleen tallessa.
 */
async function fallback(
  thumbnailPath: string | null,
  storagePath: string,
): Promise<Uint8Array | null> {
  if (!thumbnailPath) return null;
  return downloadPhoto(storagePath);
}

/** Ajaa `fn`:n kaikille alkioille enintään `size` kerrallaan, järjestys säilyttäen. */
async function inBatches<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return results;
}
