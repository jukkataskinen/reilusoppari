import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getReceiptReader, hasReceiptReading } from "@/lib/receipts";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * Kuitin luku kuvasta (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: kirjautunut käyttäjä. Ilman tätä reitti olisi auki
 *    koko internetille: kuka tahansa osoitteen tietävä voisi syöttää kuvia
 *    meidän laskuumme. Kuvakoon raja rajoittaa yhden kutsun hintaa, ei
 *    kutsujen määrää.
 * 2. Henkilötieto: kuitissa voi olla kotiosoite tai kortin loppunumerot.
 *    Kuvaa EI tallenneta täällä eikä lokiteta — se palaa selaimeen ja
 *    tallennetaan vasta, kun käyttäjä tallentaa kulun.
 * 3. Syöte: base64-kuva ja mediatyyppi. Molemmat tarkistetaan.
 * 4. IDOR: ei kohde-id:tä lainkaan. Reitti ei kirjoita mihinkään.
 * 5. Salaisuus: `ANTHROPIC_API_KEY` luetaan vain palvelimella.
 * 6. Epäonnistuminen: tilakoodi mukaan, koska ilman sitä vianetsintä on
 *    arvailua — 401 tarkoittaa avainta, 404 mallia, 429 ruuhkaa.
 * 7. Lokitus: ei kuvaa, ei luettuja summia, ei myyjän nimeä.
 *
 * KUTSURAJA ON TÄSSÄ, EI KÄYTTÖLIITTYMÄSSÄ
 *
 * Tämä on ensimmäinen reitti tässä sovelluksessa, jossa yksi kutsu maksaa
 * suoraan oikeaa rahaa. Raja on tunnistuksen jälkeen ja ennen kutsua, joten
 * rikkinäinen silmukka selaimessa pysähtyy ennen kuin lasku kasvaa.
 *
 * KUVAA EI TALLENNETA TÄÄLLÄ
 *
 * Luku ja tallennus ovat eri asioita. Jos kuva tallennettaisiin tässä,
 * jokainen keskeytetty kuvaus jättäisi orvon tiedoston Storageen. Nyt kuva
 * pysyy selaimen muistissa, kunnes kulu tallennetaan — silloin se menee
 * `/asunnot/[id]/kulut/[kulu]/kuitti`-reitille, joka poistaa metatiedot ja
 * laskee tiivisteen.
 * ===========================================================================
 */

/** Vercelin pyyntörungon katto on noin 4,5 MB. Selain pakkaa 2000 pikseliin. */
const MAX_BASE64 = 4_000_000;

/**
 * Kutsua minuutissa per käyttäjä.
 *
 * Kaksikymmentä riittää normaaliin tahtiin — kuitteja ei fyysisesti ehdi
 * kuvata nopeammin — mutta pysäyttää silmukan tai tahallisen hakkauksen.
 * Sama arvo kuin Jukan toisessa järjestelmässä samasta syystä.
 */
const PER_MINUTE = 20;

const SALLITUT_TYYPIT = new Set(["image/jpeg", "image/png"]);

const VIRHE = (status: number, viesti: string) =>
  NextResponse.json({ error: viesti }, { status });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return VIRHE(401, "Kirjautuminen vaaditaan.");

  // Raja tunnistuksen jälkeen, ennen kuin mitään maksavaa ehtii tapahtua.
  const { allowed } = await checkRateLimit(user.id, "kuitti.lue", PER_MINUTE);
  if (!allowed) {
    return VIRHE(429, "Liian monta lukua lyhyessä ajassa. Odota hetki ja yritä uudelleen.");
  }

  if (!hasReceiptReading()) {
    /*
      Ei 500: avaimen puuttuminen on ympäristön tila eikä käyttäjän virhe.
      Käyttöliittymä näyttää tyhjän lomakkeen, ja käyttäjä kirjoittaa summan
      itse. Toiminto, joka on hieman vaivalloisempi, on parempi kuin
      virheilmoitus, jolle käyttäjä ei voi mitään.
    */
    return NextResponse.json(
      { reading: null, unavailable: true },
      { headers: { "cache-control": "no-store" } },
    );
  }

  let body: { imageBase64?: unknown; mediaType?: unknown };
  try {
    body = await request.json();
  } catch {
    return VIRHE(400, "Pyyntö ei kelpaa.");
  }

  const imageBase64 = body.imageBase64;
  const mediaType = typeof body.mediaType === "string" ? body.mediaType : "image/jpeg";

  if (typeof imageBase64 !== "string" || imageBase64 === "") {
    return VIRHE(400, "Kuva puuttuu.");
  }
  if (imageBase64.length > MAX_BASE64) {
    return VIRHE(413, "Kuva on liian suuri.");
  }
  if (!SALLITUT_TYYPIT.has(mediaType)) {
    return VIRHE(415, "Vain JPEG- ja PNG-kuvat kelpaavat.");
  }

  const result = await getReceiptReader().read({ imageBase64, mediaType });

  if (!result.ok) return VIRHE(result.status, result.message);

  /*
    Vain jäsennetty luenta palautetaan, ei mallin raakavastausta.

    Raakavastaus voi sisältää tekstiä, jota ei ole tarkistettu, ja se
    päätyisi selaimeen sellaisenaan. Jäsennys on se kohta, jossa arvot
    tarkistetaan järkeviksi (`receipts/parse.ts`).
  */
  return NextResponse.json(
    { reading: result.reading },
    { headers: { "cache-control": "no-store" } },
  );
}
