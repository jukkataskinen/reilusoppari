import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getServiceClient } from "@/lib/db/supabase";
import { getPropertyExpense, recordReceiptPhoto } from "@/lib/db/expenses";
import { stripImageMetadata, UnsupportedImageError } from "@/lib/photos/strip-metadata";

/**
 * Asunnon kulun kuitti (CLAUDE.md 5.7 ja kohta 6).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: asunnon omistaja. Tarkistus on `getPropertyExpense`issa,
 *    joka heittää muille. Vuokralainen ei näe kuitteja lainkaan.
 * 2. Henkilötieto: kuitissa voi olla kotiosoite, kortin loppunumerot tai
 *    toisen asunnon tietoja. Bucket on private, katselu vain lyhytikäisellä
 *    signed URL:lla.
 * 3. Syöte: tiedosto. Vain JPEG ja PNG hyväksytään.
 * 4. IDOR: kulun id polusta, ja haku rajataan asuntoon — toisen asunnon
 *    kulua ei löydy omansa kautta.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: neutraali viesti, syy lokiin ilman kuvan sisältöä.
 * 7. Lokitus: ei tiedostonimiä eikä summia.
 *
 * KUITTI EI OLE KATSELMUSKUVA
 *
 * Rivillä on `expense_id` eikä `inspection_id`- tai
 * `maintenance_entry_id`-viitettä, ja `property_id` eikä `tenancy_id`
 * (migraatio 0014). Kaikki näkymät hakevat kuvat omalla viitteellään, joten
 * kuitti ei voi vahingossa päätyä pöytäkirjaan tai huoltokirjaan.
 * ===========================================================================
 */

/** Vercelin funktio ottaa vastaan 4,5 MB. Selain pakkaa noin megatavuun. */
const MAX_BYTES = 4 * 1024 * 1024;

const VIRHE = (status: number, viesti: string) =>
  NextResponse.json({ error: viesti }, { status });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; kulu: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return VIRHE(401, "Kirjautuminen vaaditaan.");

  const { id: propertyId, kulu: expenseId } = await context.params;

  let expense;
  try {
    expense = await getPropertyExpense(user.id, propertyId, expenseId);
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
  const storagePath = `asunnot/${propertyId}/kuitit/${expenseId}/${randomUUID()}.${extension}`;

  const { error: uploadError } = await getServiceClient()
    .storage.from("photos")
    .upload(storagePath, cleaned.bytes, { contentType: cleaned.format, upsert: false });

  if (uploadError) {
    console.error("[kulut] kuitin tallennus epäonnistui:", uploadError.message);
    return VIRHE(500, "Kuitin tallennus epäonnistui.");
  }

  try {
    /*
      Kuitti kirjataan sille kohteelle, jolle KULU on kirjattu.

      Vuokrasuhteeseen kirjatun kulun voi avata myös asunnon listalta, ja
      silloin sen kuitin on kuuluttava samaan vuokrasuhteeseen kuin kulu —
      muuten sama kulu näkyisi kahdella eri rajauksella.
    */
    const photo = await recordReceiptPhoto({
      tenancyId: expense.tenancyId,
      propertyId,
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
