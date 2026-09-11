import { NextResponse } from "next/server";
import { RentalAgreement } from "@/documents/RentalAgreement";
import { renderDocumentPdf } from "@/documents/render";
import { getCurrentUser } from "@/lib/auth/session";
import { buildRentalAgreementData } from "@/lib/tenancy/contract-document";
import { createElement } from "react";

/**
 * Sopimuksen esikatselu PDF:nä (CLAUDE.md 5.1).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: vuokrasuhteen osapuoli. Sekä vuokranantaja että
 *    vuokralainen näkevät luonnoksen (CLAUDE.md 5.2) — vuokralaisen on
 *    voitava lukea se, minkä hän allekirjoittaa.
 * 2. Henkilötieto: osapuolten nimet ja asunnon osoite. Ei lokiteta.
 * 3. Syöte: vain vuokrasuhteen id polusta.
 * 4. IDOR: ulkopuoliselle 404, sama vastaus kuin olemattomalle
 *    vuokrasuhteelle.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: neutraali 404 tai 500, ei tietokannan viestejä.
 * 7. Lokitus: ei asiakirjan sisältöä.
 *
 * EI VÄLIMUISTIA
 *
 * Vastaus on henkilökohtainen ja muuttuu sopimusta muokatessa. `no-store`
 * estää sekä selaimen että välipalvelimien tallennuksen; service worker ei
 * välimuistita tätä muutenkaan (`public/sw.js`).
 * ===========================================================================
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("Kirjautuminen vaaditaan.", { status: 401 });
  }

  const { id } = await context.params;

  let data;
  try {
    data = await buildRentalAgreementData(user.id, id);
  } catch {
    return new NextResponse("Esikatselua ei voitu tuottaa.", { status: 500 });
  }

  if (!data) {
    return new NextResponse("Sopimusta ei löytynyt.", { status: 404 });
  }

  try {
    const result = await renderDocumentPdf(createElement(RentalAgreement, { data }));

    return new NextResponse(Buffer.from(result.bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'inline; filename="vuokrasopimus-luonnos.pdf"',
        "cache-control": "no-store, private",
        // Tiiviste otsakkeeseen, jotta esikatselun ja allekirjoitettavan
        // asiakirjan voi todeta samaksi ilman että PDF avataan.
        "x-document-sha256": result.sha256,
      },
    });
  } catch {
    return new NextResponse("Esikatselua ei voitu tuottaa.", { status: 500 });
  }
}
