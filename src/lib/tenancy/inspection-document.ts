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
 * Siksi tämä on hidas funktio. Se ajetaan kerran lukituksen jälkeen ja
 * uudelleen vain esikatselua varten.
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

  for (const photo of overview.photos) {
    const name = photo.room ?? "Muut";
    if (!byRoom.has(name)) byRoom.set(name, { name, photos: [] });

    const bytes = await downloadPhoto(photo.storagePath);
    // Kuva, jota ei saada ladattua, jätetään pois eikä korvata
    // paikanvaraajalla: tyhjä kehys pöytäkirjassa näyttäisi todisteelta,
    // jota ei ole. Tiiviste jää silti liitteeseen puuttuvana rivinä.
    if (!bytes) continue;

    byRoom.get(name)!.photos.push({
      dataUri: toDataUri(bytes, photo.storagePath),
      takenAt: photo.takenAtServer,
      takenByName:
        photo.uploaderName ??
        (photo.uploaderRole === "landlord" ? "Vuokranantaja" : "Vuokralainen"),
      takenByRole: photo.uploaderRole,
      sha256: photo.sha256,
      note: photo.note,
      flaggedReason: photo.flagged ? (photo.flaggedReason ?? "syytä ei kerrottu") : null,
    });
  }

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
