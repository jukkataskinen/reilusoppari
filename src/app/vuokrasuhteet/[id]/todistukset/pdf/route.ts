import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listCertificates } from "@/lib/db/certificates";
import { getServiceClient } from "@/lib/db/supabase";

/**
 * Oman todistuksen lataus (CLAUDE.md 5.8).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: vuokrasuhteen osapuoli, ja hän saa VAIN oman
 *    todistuksensa. Toisen osapuolen todistus on tämän omaisuutta, ja hän
 *    päättää kenelle se näytetään.
 * 2. Henkilötieto: nimet ja arvio. Ei lokiteta.
 * 3. Syöte: vuokrasuhteen id polusta.
 * 4. IDOR: ei kohde-id:tä lainkaan — todistus valitaan kutsujan roolin
 *    perusteella, joten väärää ei voi pyytää.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: neutraali 404.
 * 7. Lokitus: ei sisältöä.
 * ===========================================================================
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Kirjautuminen vaaditaan.", { status: 401 });

  const { id } = await context.params;

  let mine;
  try {
    mine = (await listCertificates(user.id, id)).find((certificate) => certificate.isMine);
  } catch {
    return new NextResponse("Todistusta ei löytynyt.", { status: 404 });
  }

  if (!mine?.sealedPath) return new NextResponse("Todistusta ei löytynyt.", { status: 404 });

  const { data, error } = await getServiceClient()
    .storage.from("documents")
    .download(mine.sealedPath);

  if (error || !data) {
    console.error("[todistukset] lataus epäonnistui:", error?.message);
    return new NextResponse("Todistusta ei voitu ladata.", { status: 500 });
  }

  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="vuokratodistus.pdf"',
      "cache-control": "no-store, private",
      ...(mine.sealedSha256 ? { "x-document-sha256": mine.sealedSha256 } : {}),
    },
  });
}
