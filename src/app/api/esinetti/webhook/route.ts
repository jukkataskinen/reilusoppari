import { NextResponse } from "next/server";
import {
  isKnownWebhookEvent,
  parseExternalRef,
  parseWebhookPayload,
  verifyWebhookSignature,
} from "@/lib/esinetti";
import {
  handleFinalRoundCompleted,
  handleRoundCompleted,
} from "@/lib/tenancy/round-completed";

/**
 * eSinetin webhook (CLAUDE.md 5.4).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: vain eSinetti. Todennus on allekirjoitettu otsake,
 *    ei IP-osoite eikä salainen polku.
 * 2. Henkilötieto: allekirjoittajien nimet ja sähköpostit rungossa. Ei
 *    lokiteta.
 * 3. Syöte: raaka runko luetaan tavuina ennen jäsentämistä —
 *    allekirjoitus lasketaan siitä, mitä lähetettiin, ei siitä, miksi se
 *    jäsentyi.
 * 4. IDOR: vuokrasuhde tulee `external_ref`-kentästä, jonka me itse
 *    asetimme. Tuntematon muoto ohitetaan.
 * 5. Salaisuus: `ESINETTI_WEBHOOK_SECRET`. Ilman sitä kaikki hylätään —
 *    tyhjä arvo EI tarkoita "tarkistus ohi".
 * 6. Epäonnistuminen: 401 väärästä allekirjoituksesta, 400 rikkinäisestä
 *    rungosta. Muuten 200, myös silloin kun tapahtuma ohitetaan.
 * 7. Lokitus: tapahtuman tunniste ja tyyppi, ei sisältöä.
 *
 * MIKSI 200 MYÖS SILLOIN KUN EI TEHDÄ MITÄÄN
 *
 * Tuntematon tapahtumatyyppi ei ole virhe: eSinetti voi lisätä uusia. Jos
 * vastaisimme 400, se yrittäisi uudelleen loputtomasti ja jonoon kertyisi
 * tapahtumia, joita emme koskaan käsittele.
 * ===========================================================================
 */
export async function POST(request: Request) {
  const secret = process.env.ESINETTI_WEBHOOK_SECRET?.trim() ?? "";

  // Raaka runko ennen jäsentämistä: allekirjoitus lasketaan tavuista.
  const rawBody = await request.text();
  const signature = request.headers.get("x-esinetti-signature");

  if (!verifyWebhookSignature(secret, signature, rawBody)) {
    // Ei kerrota kumpi meni pieleen: puuttuva salaisuus vai väärä
    // allekirjoitus. Kumpikin on kutsujalle sama asia.
    return new NextResponse("Allekirjoitus ei kelpaa.", { status: 401 });
  }

  const event = parseWebhookPayload(rawBody);
  if (!event) return new NextResponse("Runko ei kelpaa.", { status: 400 });

  if (!isKnownWebhookEvent(event.event)) {
    return NextResponse.json({ ok: true, ignored: "tuntematon tapahtuma" });
  }

  if (event.event !== "round.completed") {
    // Muut tapahtumat ovat näytettävää tilatietoa, joka luetaan suoraan
    // eSinetiltä silloin kun sivu sitä tarvitsee.
    return NextResponse.json({ ok: true, ignored: event.event });
  }

  const ref = parseExternalRef(event.externalRef);
  if (!ref) {
    console.warn("[esinetti] tuntematon external_ref tapahtumassa", event.id);
    return NextResponse.json({ ok: true, ignored: "tuntematon viite" });
  }

  try {
    const outcome =
      ref.phase === "alku"
        ? await handleRoundCompleted(event, ref.tenancyId)
        : await handleFinalRoundCompleted(event, ref.tenancyId);

    return NextResponse.json({ ok: true, ...outcome });
  } catch (err) {
    console.error(
      "[esinetti] tapahtuman käsittely epäonnistui:",
      event.id,
      err instanceof Error ? err.message : err,
    );
    // 500 on tässä oikea: eSinetti yrittää uudelleen, ja käsittely on
    // idempotentti, joten toisto ei tee vahinkoa.
    return new NextResponse("Käsittely epäonnistui.", { status: 500 });
  }
}
