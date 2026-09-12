import { NextResponse } from "next/server";
import { findCertificateByShare } from "@/lib/db/certificates";
import { getServiceClient } from "@/lib/db/supabase";

/**
 * Jaettu todistus PDF:nä (CLAUDE.md 5.8).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: kuka tahansa, jolla on voimassa oleva jakolinkki.
 *    Tunniste on 256-bittinen satunnaisluku, ja vertailu vakioaikainen.
 * 2. Henkilötieto: todistuksen sisältö. Sen jakaminen on kohteen oma päätös.
 * 3. Syöte: vain tunniste polusta, muoto tarkistetaan ennen kyselyä.
 * 4. IDOR: ei muuta tunnistetta kuin jakolinkin oma.
 * 5. Salaisuudet: `SHARE_TOKEN_SECRET` tiivistämiseen.
 * 6. Epäonnistuminen: vanhentunut, mitätöity ja olematon linkki antavat
 *    saman 404:n.
 * 7. Lokitus: ei tunnistetta eikä sisältöä.
 *
 * EI VÄLIMUISTIA
 *
 * Linkki voidaan mitätöidä milloin tahansa, eikä välimuistiin jäänyt kopio
 * saa elää mitätöinnin jälkeen.
 * ===========================================================================
 */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const certificate = await findCertificateByShare(token);

  if (!certificate) return new NextResponse("Linkki ei ole voimassa.", { status: 404 });

  const { data, error } = await getServiceClient()
    .storage.from("documents")
    .download(certificate.sealedPath);

  if (error || !data) {
    console.error("[todistukset] jaetun todistuksen lataus epäonnistui:", error?.message);
    return new NextResponse("Todistusta ei voitu ladata.", { status: 500 });
  }

  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="vuokratodistus.pdf"',
      "cache-control": "no-store, private",
    },
  });
}
