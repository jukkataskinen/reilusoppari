import { NextResponse } from "next/server";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE } from "@/lib/billing/referral-cookie";

/**
 * Suosittelulinkin vastaanotto (CLAUDE.md 5.9).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: kuka tahansa. Tämä on julkinen linkki, jonka joku on
 *    saanut tutultaan.
 * 2. Henkilötieto: ei mitään. Tunnus on tiiviste, josta ei voi päätellä
 *    kuka suosittelija on.
 * 3. Syöte: tunnus polusta. Hyväksytään vain 12 heksamerkkiä — muu ohitetaan
 *    hiljaa, koska evästeeseen ei kirjoiteta mitä tahansa polusta tullutta.
 * 4. IDOR: tunnus ei anna pääsyä mihinkään; se vain kulkee mukana tilin
 *    luontiin asti.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: ohjataan silti etusivulle. Rikkinäinen suosittelulinkki
 *    ei saa olla umpikuja sille, joka yritti tulla palveluun.
 * 7. Lokitus: ei mitään.
 *
 * MIKSI EVÄSTE EIKÄ KYSELYPARAMETRI
 *
 * Tunnuksen on selvittävä kirjautumisen yli: käyttäjä lähtee Auth0:aan ja
 * palaa takaisin, eikä kyselyparametri kulje mukana. Eväste on lyhytikäinen
 * ja `SameSite=Lax`, jotta se selviää paluun mutta ei kulje kolmannen
 * osapuolen pyynnöissä.
 * ===========================================================================
 */

export async function GET(
  _request: Request,
  context: { params: Promise<{ koodi: string }> },
) {
  const { koodi } = await context.params;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.reilusoppari.fi";
  const response = NextResponse.redirect(new URL("/vuokrasuhteet", appUrl));

  if (/^[0-9a-f]{12}$/.test(koodi)) {
    response.cookies.set(REFERRAL_COOKIE, koodi, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: REFERRAL_COOKIE_MAX_AGE,
    });
  }

  return response;
}
