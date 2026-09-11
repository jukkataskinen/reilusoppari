import { NextResponse, type NextRequest } from "next/server";
import { auth0 } from "@/lib/auth/auth0";
import { buildContentSecurityPolicy, createNonce } from "@/lib/security/csp";

/**
 * Middleware tekee kaksi asiaa: Auth0:n istunnon ja CSP:n.
 *
 * ===========================================================================
 * SUOJAUS EI OLE TÄÄLLÄ
 *
 * Middleware EI suojaa sivuja: suojaus tehdään sivukohtaisesti
 * `requireUser()`:lla (`src/lib/auth/session.ts`). Syy on se, että osa
 * reiteistä on tarkoituksella julkisia — kutsulinkki ja todistuksen jakolinkki
 * toimivat ilman kirjautumista, ja middlewaressa tehtävä kaikenkattava
 * suojaus unohtaisi ne tai vuotaisi ne vahingossa.
 *
 * JÄRJESTYS ON MERKITSEVÄ
 *
 * Auth0:n middleware ajetaan ensin, koska se käsittelee `/auth/*`-reitit
 * kokonaan itse ja uusii istuntoevästeen. Sen jälkeen rakennetaan oma vastaus,
 * johon Auth0:n asettamat evästeet kopioidaan — jos tämä unohtuu, istunto
 * katoaa jokaisella pyynnöllä eikä kukaan pysy kirjautuneena.
 * ===========================================================================
 */
export async function middleware(request: NextRequest) {
  const authResponse = await auth0.middleware(request);

  // `/auth/*` on kokonaan Auth0:n: uudelleenohjaukset ja callback-käsittely.
  // Niihin ei kosketa, koska oma NextResponse.next() hukkaisi vastauksen.
  if (request.nextUrl.pathname.startsWith("/auth/")) {
    return authResponse;
  }

  const nonce = createNonce();
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV !== "production");

  // CSP asetetaan myös PYYNNÖN otsikoihin: Next.js lukee noncen sieltä ja
  // lisää sen omiin skriptitageihinsa. Ilman tätä sivu latautuisi ilman
  // skriptejä, koska ne eivät läpäisisi omaa policyämme.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Auth0:n uusima istuntoeväste mukaan. Tämä on se rivi, jonka unohtaminen
  // rikkoo kirjautumisen hiljaa.
  for (const cookie of authResponse.cookies.getAll()) {
    response.cookies.set(cookie);
  }

  response.headers.set("content-security-policy", csp);

  return response;
}

export const config = {
  matcher: [
    /*
     * Kaikki paitsi staattiset tiedostot ja kuvat. `_next/static` ja
     * `_next/image` jätetään pois suorituskyvyn vuoksi; PWA:n service worker
     * ja manifest eivät saa vaatia istuntoa, tai asennus epäonnistuu.
     */
    "/((?!_next/static|_next/image|favicon\.ico|manifest\.webmanifest|sw\.js|fonts/|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2)$).*)",
  ],
};
