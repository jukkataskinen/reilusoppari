import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getServiceClient } from "@/lib/db/supabase";
import {
  getOrCreateInspection,
  recordInspectionPhoto,
} from "@/lib/db/inspections";
import { normalizeRoomName } from "@/lib/inspection/rooms";
import { stripImageMetadata, UnsupportedImageError } from "@/lib/photos/strip-metadata";

/**
 * Loppukatselmuksen kuvan vastaanotto (CLAUDE.md 5.8 ja kohta 6).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: vuokrasuhteen osapuoli, ja vain kun katselmus on auki.
 *    Molemmat osapuolet saavat kuvata — se on koko idea.
 * 2. Henkilötieto: kuva kodista on henkilötietoa. Bucket on private, ja
 *    katselu tapahtuu vain lyhytikäisellä signed URL:lla.
 * 3. Syöte: tiedosto, huoneen nimi, vapaaehtoinen selite. Kaikki
 *    tarkistetaan; tiedostosta hyväksytään vain JPEG ja PNG.
 * 4. IDOR: vuokrasuhteen id polusta, osapuolitarkistus datakerroksessa.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: neutraali viesti, syy lokiin ilman kuvan sisältöä.
 * 7. Lokitus: ei tiedostonimiä, ei selitettä, ei huoneen nimeä.
 *
 * METATIEDOT POISTETAAN TÄÄLLÄ, EI SELAIMESSA
 *
 * Selain poistaa EXIF:n jo pakatessaan, mutta siihen ei voi luottaa: sen
 * koodin voi ohittaa ja kuvan lähettää sellaisenaan. Jos poisto olisi vain
 * siellä, GPS-koordinaatit olisivat tallessa aina kun joku niin haluaa.
 *
 * TIIVISTE LASKETAAN TALLENNETUSTA TIEDOSTOSTA
 *
 * Ei siitä, joka lähetettiin. Pöytäkirjassa lukeva tiiviste on sen tiedoston
 * tiiviste, joka on levyllä — muuten sitä ei voisi tarkistaa myöhemmin.
 * ===========================================================================
 */

/** Vercelin funktio ottaa vastaan 4,5 MB. Selain pakkaa noin megatavuun. */
const MAX_BYTES = 4 * 1024 * 1024;

const VIRHE = (status: number, viesti: string) =>
  NextResponse.json({ error: viesti }, { status });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return VIRHE(401, "Kirjautuminen vaaditaan.");

  const { id: tenancyId } = await context.params;

  let inspection;
  try {
    inspection = await getOrCreateInspection(user.id, tenancyId, "final");
  } catch {
    // Sama vastaus riippumatta siitä, onko vuokrasuhdetta olemassa vai eikö
    // kutsujalla ole siihen oikeutta.
    return VIRHE(404, "Katselmusta ei löytynyt.");
  }

  if (inspection.status !== "open") {
    return VIRHE(409, "Katselmus on lukittu. Uudet kuvat menevät huoltokirjaan.");
  }

  const form = await request.formData();
  const file = form.get("file");
  const room = normalizeRoomName(String(form.get("room") ?? ""));
  const rawNote = String(form.get("note") ?? "").trim();
  const note = rawNote === "" ? null : rawNote.slice(0, 300);

  if (!(file instanceof File)) return VIRHE(400, "Kuva puuttuu.");
  if (!room) return VIRHE(400, "Huone puuttuu.");
  if (file.size > MAX_BYTES) {
    return VIRHE(413, "Kuva on liian suuri. Ota se uudelleen tai valitse pienempi.");
  }

  const uploaded = new Uint8Array(await file.arrayBuffer());

  let cleaned;
  try {
    cleaned = stripImageMetadata(uploaded);
  } catch (err) {
    if (err instanceof UnsupportedImageError) {
      return VIRHE(415, "Vain JPEG- ja PNG-kuvat kelpaavat.");
    }
    console.error("[loppukatselmus] metatietojen poisto epäonnistui");
    return VIRHE(500, "Kuvaa ei voitu käsitellä.");
  }

  const sha256 = createHash("sha256").update(cleaned.bytes).digest("hex");
  const extension = cleaned.format === "image/png" ? "png" : "jpg";

  /*
    Polku ei sisällä huoneen nimeä eikä selitettä.

    Storage-polku voi päätyä lokiin ja virheilmoituksiin. Huoneen nimi on
    käyttäjän kirjoittamaa tekstiä, ja "Makuuhuone – Liisan huone" polussa
    olisi henkilötietoa paikassa, jota ei ole suojattu sitä varten.
  */
  const storagePath = `${tenancyId}/${inspection.id}/${randomUUID()}.${extension}`;

  const { error: uploadError } = await getServiceClient()
    .storage.from("photos")
    .upload(storagePath, cleaned.bytes, { contentType: cleaned.format, upsert: false });

  if (uploadError) {
    console.error("[loppukatselmus] kuvan tallennus epäonnistui:", uploadError.message);
    return VIRHE(500, "Kuvan tallennus epäonnistui.");
  }

  try {
    const photo = await recordInspectionPhoto({
      tenancyId,
      inspectionId: inspection.id,
      uploaderUserId: user.id,
      room,
      note,
      storagePath,
      sha256,
      bytes: cleaned.bytes.byteLength,
      width: cleaned.width,
      height: cleaned.height,
    });

    return NextResponse.json(
      { id: photo.id, sha256, takenAtServer: photo.takenAtServer },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    // Rivin kirjaus epäonnistui: poistetaan tiedosto, jottei Storageen jää
    // kuvaa, jota mikään ei omista eikä kukaan näe.
    await getServiceClient().storage.from("photos").remove([storagePath]);
    return VIRHE(500, "Kuvan tallennus epäonnistui.");
  }
}
