import { createElement } from "react";
import { NextResponse } from "next/server";
import { InspectionProtocol } from "@/documents/InspectionProtocol";
import { renderDocumentPdf } from "@/documents/render";
import { getCurrentUser } from "@/lib/auth/session";
import { buildInspectionProtocolData } from "@/lib/tenancy/inspection-document";

/**
 * Katselmuspöytäkirja PDF:nä (CLAUDE.md 5.3).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: vuokrasuhteen osapuoli. Molemmat näkevät pöytäkirjan —
 *    se on yhteinen asiakirja, jonka molemmat allekirjoittavat.
 * 2. Henkilötieto: kuvat kodista ja osapuolten nimet. Ei lokiteta.
 * 3. Syöte: vain vuokrasuhteen id polusta.
 * 4. IDOR: ulkopuoliselle 404, sama vastaus kuin olemattomalle
 *    vuokrasuhteelle.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: neutraali viesti, syy lokiin ilman sisältöä.
 * 7. Lokitus: ei kuvien tiivisteitä eikä selitteitä.
 *
 * LUKITSEMATTOMASTA KATSELMUKSESTA EI TEHDÄ ASIAKIRJAA
 *
 * `buildInspectionProtocolData` palauttaa `null`, jos katselmus on auki.
 * Luonnoksesta tehty pöytäkirja näyttäisi valmiilta olematta sitä, ja juuri
 * lukitus on se hetki, jolloin kuvista tulee todiste.
 * ===========================================================================
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Kirjautuminen vaaditaan.", { status: 401 });

  const { id } = await context.params;

  let data;
  try {
    data = await buildInspectionProtocolData(user.id, id);
  } catch (err) {
    console.error(
      "[katselmus] pöytäkirjan kokoaminen epäonnistui:",
      err instanceof Error ? err.message : err,
    );
    return new NextResponse("Pöytäkirjaa ei voitu tuottaa.", { status: 500 });
  }

  if (!data) return new NextResponse("Pöytäkirjaa ei löytynyt.", { status: 404 });

  try {
    const result = await renderDocumentPdf(createElement(InspectionProtocol, { data }));

    return new NextResponse(Buffer.from(result.bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'inline; filename="alkukatselmus.pdf"',
        "cache-control": "no-store, private",
        "x-document-sha256": result.sha256,
      },
    });
  } catch (err) {
    console.error(
      "[katselmus] renderöinti epäonnistui:",
      err instanceof Error ? err.message : err,
    );
    return new NextResponse("Pöytäkirjaa ei voitu tuottaa.", { status: 500 });
  }
}
