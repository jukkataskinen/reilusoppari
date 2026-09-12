import { NextResponse } from "next/server";
import { dispatchDueReminders } from "@/lib/rent/dispatch";

/**
 * Päivittäinen vuokramuistutusajo (CLAUDE.md 5.5).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: vain ajastin, `CRON_SECRET`-otsakkeella. Reitti ei ole
 *    käyttäjille tarkoitettu, eikä kirjautuminen riitä.
 * 2. Henkilötieto: ilmoitusten tekstit sisältävät kuukauden ja summan. Ei
 *    lokiteta.
 * 3. Syöte: ei mitään. Ajo käy läpi kaikki avoimet kaudet.
 * 4. IDOR: ei parametreja, joilla voisi valita kohteen.
 * 5. Salaisuus: `CRON_SECRET`. Ilman sitä kaikki kutsut hylätään — tyhjä
 *    arvo EI tarkoita "tarkistus ohi".
 * 6. Epäonnistuminen: 401 väärästä salaisuudesta. Muuten 200 ja lukumäärä.
 * 7. Lokitus: vain lähetettyjen määrä, ei vastaanottajia.
 *
 * AJASTUS
 *
 * Kerran vuorokaudessa. Ajon tarkka hetki ei ole kriittinen, koska
 * suunnittelija vertaa päivämääriä eikä kellonaikoja: myöhässä ajettu ajo
 * lähettää saman ketjun, eikä aiemmin lähetettyjä toisteta.
 * ===========================================================================
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (!secret || given !== secret) {
    return new NextResponse("Ei oikeutta.", { status: 401 });
  }

  try {
    const sent = await dispatchDueReminders();
    console.log(`[vuokrat] muistutusajo valmis, lähetettiin ${sent} ilmoitusta.`);
    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    console.error("[vuokrat] muistutusajo epäonnistui:", err instanceof Error ? err.message : err);
    return new NextResponse("Ajo epäonnistui.", { status: 500 });
  }
}
