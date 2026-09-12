import { createElement } from "react";
import { NextResponse } from "next/server";
import { TaxReport } from "@/documents/TaxReport";
import { renderDocumentPdf } from "@/documents/render";
import { getCurrentUser } from "@/lib/auth/session";
import { getServiceClient } from "@/lib/db/supabase";
import { getStoredReport } from "@/lib/db/tax-reports";
import { buildTaxReportData } from "@/lib/tax/seal";

/**
 * Verolaskelma PDF:nä (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: asunnon omistaja. Tarkistus on datakerroksessa
 *    (`requireExpenseAccess`) — vuokralainen ei näe kuluja eikä laskelmaa.
 * 2. Henkilötieto: vuokratulot, kulut ja omistajan nimi. Ei lokiteta.
 * 3. Syöte: asunnon id polusta, vuosi kyselystä. Vuosi tarkistetaan luvuksi.
 * 4. IDOR: omistajatarkistus datakerroksessa, ei kohde-id:tä muualta.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: neutraali 404.
 * 7. Lokitus: ei summia eikä osoitteita.
 *
 * KAKSI TIEDOSTOA, KAKSI ERI ASIAA
 *
 * `?sinetoity=1` palauttaa tallennetun sinetöidyn tiedoston; ilman sitä
 * laskelma piirretään tässä hetkessä nykyisistä kirjauksista. Ne voivat
 * poiketa toisistaan, ja se on tarkoitus: sinetöity on se, jonka mukaan
 * ilmoitettiin, ja tuore se, joka vastaa tämänhetkistä kirjanpitoa.
 * ===========================================================================
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Kirjautuminen vaaditaan.", { status: 401 });

  const { id } = await context.params;
  const url = new URL(request.url);

  const year = Number(url.searchParams.get("vuosi"));
  if (!Number.isInteger(year) || year < 2020 || year > new Date().getFullYear() + 1) {
    return new NextResponse("Vuosi puuttuu.", { status: 400 });
  }

  if (url.searchParams.get("sinetoity") === "1") {
    return sealedFile(user.id, id, year);
  }

  let data;
  try {
    data = await buildTaxReportData(user.id, id, year);
  } catch {
    return new NextResponse("Laskelmaa ei löytynyt.", { status: 404 });
  }

  if (!data) return new NextResponse("Laskelmaa ei löytynyt.", { status: 404 });

  const rendered = await renderDocumentPdf(createElement(TaxReport, { data }));

  return new NextResponse(Buffer.from(rendered.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="verolaskelma-${year}.pdf"`,
      "cache-control": "no-store, private",
    },
  });
}

/** Tallennettu sinetöity laskelma. Sitä ei piirretä uudelleen. */
async function sealedFile(
  userId: string,
  propertyId: string,
  year: number,
): Promise<NextResponse> {
  let stored;
  try {
    stored = await getStoredReport(userId, propertyId, year);
  } catch {
    return new NextResponse("Laskelmaa ei löytynyt.", { status: 404 });
  }

  if (!stored?.sealedPath) return new NextResponse("Laskelmaa ei löytynyt.", { status: 404 });

  const { data, error } = await getServiceClient()
    .storage.from("documents")
    .download(stored.sealedPath);

  if (error || !data) {
    console.error("[verolaskelma] lataus epäonnistui:", error?.message);
    return new NextResponse("Laskelmaa ei voitu ladata.", { status: 500 });
  }

  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="verolaskelma-${year}-sinetoity.pdf"`,
      "cache-control": "no-store, private",
      ...(stored.sealedSha256 ? { "x-document-sha256": stored.sealedSha256 } : {}),
    },
  });
}
