import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getServiceClient } from "@/lib/db/supabase";
import { getExpense, recordReceiptPhoto } from "@/lib/db/expenses";
import { stripImageMetadata, UnsupportedImageError } from "@/lib/photos/strip-metadata";
import { checkRateLimit, KUVARAJA, KUVARAJA_VIESTI } from "@/lib/security/rate-limit";

/**
 * Kuitin kuvaaminen (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: VAIN asunnon omistaja. `getExpense` tekee
 *    omistajatarkistuksen — osapuoliasema ei riitä, koska vuokralainen on
 *    osapuoli muttei omistaja.
 * 2. Henkilötieto: kuitissa voi olla vuokranantajan kotiosoite, kortin
 *    loppunumerot tai muun asunnon tietoja. Ei lokiteta mitään sisällöstä.
 * 3. Syöte: tiedosto. Vain JPEG ja PNG.
 * 4. IDOR: kulu haetaan vuokrasuhteen ja omistajuuden kautta.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: neutraali viesti.
 * 7. Lokitus: ei tiedostonimiä.
 *
 * Kuitti ei näy vuokralaiselle missään: se tallentuu `expense_id`-viitteellä,
 * eivätkä katselmus- ja huoltokirjanäkymät hae kuvia sillä viitteellä.
 * ===========================================================================
 */

const MAX_BYTES = 4 * 1024 * 1024;
const VIRHE = (status: number, viesti: string) =>
  NextResponse.json({ error: viesti }, { status });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; kulu: string }> },
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

  const { id: tenancyId, kulu: expenseId } = await context.params;

  let expense;
  try {
    expense = await getExpense(user.id, tenancyId, expenseId);
  } catch {
    return VIRHE(404, "Kulua ei löytynyt.");
  }
  if (!expense) return VIRHE(404, "Kulua ei löytynyt.");

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) return VIRHE(400, "Kuva puuttuu.");
  if (file.size > MAX_BYTES) return VIRHE(413, "Kuva on liian suuri.");

  let cleaned;
  try {
    cleaned = stripImageMetadata(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof UnsupportedImageError) {
      return VIRHE(415, "Vain JPEG- ja PNG-kuvat kelpaavat.");
    }
    console.error("[kulut] metatietojen poisto epäonnistui");
    return VIRHE(500, "Kuvaa ei voitu käsitellä.");
  }

  const sha256 = createHash("sha256").update(cleaned.bytes).digest("hex");
  const extension = cleaned.format === "image/png" ? "png" : "jpg";
  const storagePath = `${tenancyId}/kuitit/${expenseId}/${randomUUID()}.${extension}`;

  const { error: uploadError } = await getServiceClient()
    .storage.from("photos")
    .upload(storagePath, cleaned.bytes, { contentType: cleaned.format, upsert: false });

  if (uploadError) {
    console.error("[kulut] kuitin tallennus epäonnistui:", uploadError.message);
    return VIRHE(500, "Kuitin tallennus epäonnistui.");
  }

  try {
    const photo = await recordReceiptPhoto({
      tenancyId,
      expenseId,
      uploaderUserId: user.id,
      storagePath,
      sha256,
      bytes: cleaned.bytes.byteLength,
      width: cleaned.width,
      height: cleaned.height,
    });

    return NextResponse.json({ id: photo.id }, { headers: { "cache-control": "no-store" } });
  } catch {
    await getServiceClient().storage.from("photos").remove([storagePath]);
    return VIRHE(500, "Kuitin tallennus epäonnistui.");
  }
}
