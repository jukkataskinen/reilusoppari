import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getServiceClient } from "@/lib/db/supabase";
import { signedDocumentFile, type SignedDocumentKind } from "@/lib/tenancy/signed-documents";

/**
 * Allekirjoitetun asiakirjan lataus (Jukka 10.10.2026).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: vuokrasuhteen osapuoli (vuokranantaja tai liittynyt
 *    vuokralainen). Molemmat ovat allekirjoittaneet asiakirjan, joten
 *    kummallakin on oikeus siihen.
 * 2. Henkilötieto: sopimuksessa on henkilötunnukset. Tiedosto striimataan
 *    palvelimelta; julkista eikä allekirjoitettua Storage-osoitetta ei anneta.
 * 3. Syöte: vuokrasuhteen id ja asiakirjan laji polusta. Laji on suljettu
 *    lista; tuntematon on 404.
 * 4. IDOR: osapuolitarkistus `requireTenancyParty`llä, ja tiedoston polku
 *    luetaan kannasta, ei pyynnöstä.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: neutraali 404 sekä vieraalle että puuttuvalle.
 * 7. Lokitus: vain virheen viesti, ei polkua eikä sisältöä.
 * ===========================================================================
 */
const KINDS: SignedDocumentKind[] = ["sopimus", "alkukatselmus", "loppukatselmus"];

const FILE_NAMES: Record<SignedDocumentKind, string> = {
  sopimus: "vuokrasopimus.pdf",
  alkukatselmus: "alkukatselmus.pdf",
  loppukatselmus: "loppukatselmus.pdf",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; laji: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Kirjautuminen vaaditaan.", { status: 401 });

  const { id, laji } = await context.params;
  if (!KINDS.includes(laji as SignedDocumentKind)) {
    return new NextResponse("Asiakirjaa ei löytynyt.", { status: 404 });
  }
  const kind = laji as SignedDocumentKind;

  let file;
  try {
    file = await signedDocumentFile(user.id, id, kind);
  } catch {
    return new NextResponse("Asiakirjaa ei löytynyt.", { status: 404 });
  }
  if (!file) return new NextResponse("Asiakirjaa ei löytynyt.", { status: 404 });

  const { data, error } = await getServiceClient().storage.from("documents").download(file.path);
  if (error || !data) {
    console.error("[asiakirjat] lataus epäonnistui:", error?.message);
    return new NextResponse("Asiakirjaa ei voitu ladata.", { status: 500 });
  }

  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${FILE_NAMES[kind]}"`,
      "cache-control": "no-store, private",
      ...(file.sha256 ? { "x-document-sha256": file.sha256 } : {}),
    },
  });
}
