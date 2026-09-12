import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getServiceClient } from "@/lib/db/supabase";
import { getMaintenanceEntry, recordMaintenancePhoto } from "@/lib/db/maintenance";
import { stripImageMetadata, UnsupportedImageError } from "@/lib/photos/strip-metadata";
import { checkRateLimit, KUVARAJA, KUVARAJA_VIESTI } from "@/lib/security/rate-limit";

/**
 * Huoltokirjan kuvan vastaanotto (CLAUDE.md 5.6).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: vuokrasuhteen osapuoli. Kumpi tahansa voi kuvata vian
 *    ja kumpi tahansa korjauksen.
 * 2. Henkilötieto: kuva kodista. Bucket private, katselu signed URL:lla.
 * 3. Syöte: tiedosto ja vapaaehtoinen selite. Vain JPEG ja PNG.
 * 4. IDOR: merkintä haetaan vuokrasuhteen kautta, joten toisen vuokrasuhteen
 *    merkintään ei voi liittää kuvaa arvaamalla tunnistetta.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: neutraali viesti, syy lokiin ilman sisältöä.
 * 7. Lokitus: ei tiedostonimiä eikä selitettä.
 *
 * Sama metatietojen poisto kuin katselmuksessa: selaimen koodin voi ohittaa,
 * joten EXIF puhdistetaan palvelimella (`photos/strip-metadata.ts`).
 *
 * PERUTTUUN MERKINTÄÄN EI LISÄTÄ KUVIA
 *
 * Peruttu merkintä on korjattu pois, ja uusi kuva siinä olisi hämmentävä:
 * lukija ei tietäisi, koskeeko se perumista edeltävää vai sen jälkeistä
 * tilannetta.
 * ===========================================================================
 */

const MAX_BYTES = 4 * 1024 * 1024;
const VIRHE = (status: number, viesti: string) =>
  NextResponse.json({ error: viesti }, { status });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; merkinta: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return VIRHE(401, "Kirjautuminen vaaditaan.");

  /*
    Kutsuraja heti tunnistuksen jälkeen.

    Kaikki kuvareitit kuluttavat samaa rajaa (CLAUDE.md kohta 6). Raja on
    ennen osapuolitarkistusta ja tiedoston lukua, jottei rikkinäinen silmukka
    ehdi tehdä työtä ennen kuin se pysäytetään.
  */
  const raja = await checkRateLimit(
    user.id,
    KUVARAJA.endpoint,
    KUVARAJA.limit,
    KUVARAJA.windowMinutes,
  );
  if (!raja.allowed) return VIRHE(429, KUVARAJA_VIESTI);

  const { id: tenancyId, merkinta: entryId } = await context.params;

  let entry;
  try {
    entry = await getMaintenanceEntry(user.id, tenancyId, entryId);
  } catch {
    return VIRHE(404, "Merkintää ei löytynyt.");
  }

  if (!entry) return VIRHE(404, "Merkintää ei löytynyt.");
  if (entry.cancelledAt) return VIRHE(409, "Peruttuun merkintään ei voi lisätä kuvia.");

  const form = await request.formData();
  const file = form.get("file");
  const rawNote = String(form.get("note") ?? "").trim();
  const note = rawNote === "" ? null : rawNote.slice(0, 300);

  if (!(file instanceof File)) return VIRHE(400, "Kuva puuttuu.");
  if (file.size > MAX_BYTES) {
    return VIRHE(413, "Kuva on liian suuri. Ota se uudelleen tai valitse pienempi.");
  }

  let cleaned;
  try {
    cleaned = stripImageMetadata(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof UnsupportedImageError) {
      return VIRHE(415, "Vain JPEG- ja PNG-kuvat kelpaavat.");
    }
    console.error("[huoltokirja] metatietojen poisto epäonnistui");
    return VIRHE(500, "Kuvaa ei voitu käsitellä.");
  }

  const sha256 = createHash("sha256").update(cleaned.bytes).digest("hex");
  const extension = cleaned.format === "image/png" ? "png" : "jpg";
  const storagePath = `${tenancyId}/huoltokirja/${entryId}/${randomUUID()}.${extension}`;

  const { error: uploadError } = await getServiceClient()
    .storage.from("photos")
    .upload(storagePath, cleaned.bytes, { contentType: cleaned.format, upsert: false });

  if (uploadError) {
    console.error("[huoltokirja] kuvan tallennus epäonnistui:", uploadError.message);
    return VIRHE(500, "Kuvan tallennus epäonnistui.");
  }

  try {
    const photo = await recordMaintenancePhoto({
      tenancyId,
      entryId,
      uploaderUserId: user.id,
      note,
      storagePath,
      sha256,
      bytes: cleaned.bytes.byteLength,
      width: cleaned.width,
      height: cleaned.height,
    });

    return NextResponse.json({ id: photo.id, sha256 }, { headers: { "cache-control": "no-store" } });
  } catch {
    // Rivin kirjaus epäonnistui: poistetaan tiedosto, jottei Storageen jää
    // kuvaa, jota mikään ei omista.
    await getServiceClient().storage.from("photos").remove([storagePath]);
    return VIRHE(500, "Kuvan tallennus epäonnistui.");
  }
}
