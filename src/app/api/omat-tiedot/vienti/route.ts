import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getServiceClient } from "@/lib/db/supabase";
import { collectUserData } from "@/lib/export/collect";
import { createZip } from "@/lib/export/zip";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * Omien tietojen vienti zipinä (CLAUDE.md kohta 2 ja 6).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: kirjautunut käyttäjä, ja saa vain omat tietonsa.
 *    Käyttäjän tunniste tulee istunnosta eikä pyynnöstä, joten toisen
 *    tietoja ei voi pyytää.
 * 2. Henkilötieto: paketti on kokoelma käyttäjän omaa henkilötietoa.
 *    Henkilötunnus on peitettynä (`collect.ts`).
 * 3. Syöte: ei mitään.
 * 4. IDOR: ei kohde-id:tä lainkaan.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: neutraali viesti, syy lokiin ilman sisältöä.
 * 7. Lokitus: ei tiedostonimiä eikä sisältöä.
 *
 * PAKETTI KULKEE STORAGEN KAUTTA, EI VASTAUKSENA
 *
 * Kuvineen paketti on kymmeniä megatavuja, ja se ylittäisi funktion
 * vastauksen koon. Siksi paketti tallennetaan käyttäjän omaan polkuun ja
 * hänet ohjataan lyhytikäiseen allekirjoitettuun osoitteeseen.
 *
 * Polku on käyttäjän tunnisteen alla, ämpäri on yksityinen, ja edellinen
 * paketti korvautuu joka viennillä — vanhoja paketteja ei jää lojumaan.
 *
 * KUTSURAJA ON TIUKKA
 *
 * Vienti lukee kaikki käyttäjän kuvat ja asiakirjat. Se on raskain yksittäinen
 * toiminto koko sovelluksessa, eikä sitä ole syytä tehdä kuin muutaman kerran
 * tunnissa. Rajan tarkoitus ei ole rajoittaa oikeutta omiin tietoihin vaan
 * estää sen käyttäminen kuormitusvälineenä.
 * ===========================================================================
 */

/** Vienti lukee koko tilin sisällön: se vie sekunteja, ei millisekunteja. */
export const maxDuration = 60;

const KERTAA_TUNNISSA = 3;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Kirjautuminen vaaditaan.", { status: 401 });

  const { allowed } = await checkRateLimit(user.id, "vienti", KERTAA_TUNNISSA, 60);
  if (!allowed) {
    return new NextResponse(
      "Vienti on tehty äskettäin. Odota hetki ja yritä sitten uudelleen.",
      { status: 429 },
    );
  }

  let bytes: Uint8Array;
  try {
    const now = new Date();
    bytes = createZip(await collectUserData(user.id, now), now);
  } catch (err) {
    console.error("[vienti] paketin kokoaminen epäonnistui:", err instanceof Error ? err.message : err);
    return new NextResponse("Paketin kokoaminen ei onnistunut.", { status: 500 });
  }

  const supabase = getServiceClient();
  const path = `vienti/${user.id}/omat-tiedot.zip`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, bytes, { contentType: "application/zip", upsert: true });

  if (uploadError) {
    console.error("[vienti] tallennus epäonnistui:", uploadError.message);
    return new NextResponse("Pakettia ei voitu tallentaa.", { status: 500 });
  }

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(path, 3600, { download: "omat-tiedot-reilusoppari.zip" });

  if (error || !data) {
    console.error("[vienti] latauslinkin luonti epäonnistui:", error?.message);
    return new NextResponse("Latauslinkkiä ei voitu luoda.", { status: 500 });
  }

  /*
    Ohjaus allekirjoitettuun osoitteeseen.

    Osoite on voimassa tunnin ja se on kertakäyttöinen siinä mielessä, että
    seuraava vienti korvaa tiedoston. Selain lataa sen suoraan Storagesta,
    joten funktio ei siirrä tavuja kahdesti.
  */
  return NextResponse.redirect(data.signedUrl, {
    status: 303,
    headers: { "cache-control": "no-store, private" },
  });
}
