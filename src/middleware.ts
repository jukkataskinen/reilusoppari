import type { NextRequest } from "next/server";
import { auth0 } from "@/lib/auth/auth0";

/**
 * Auth0:n middleware hoitaa `/auth/*`-reitit ja istunnon uusimisen.
 *
 * Se EI suojaa sivuja: suojaus tehdään sivukohtaisesti `requireUser()`:lla
 * (`src/lib/auth/session.ts`). Syy on se, että osa reiteistä on
 * tarkoituksella julkisia — kutsulinkki ja todistuksen jakolinkki toimivat
 * ilman kirjautumista, ja middlewaressa tehtävä kaikenkattava suojaus
 * unohtaisi ne tai vuotaisi ne vahingossa.
 */
export async function middleware(request: NextRequest) {
  return await auth0.middleware(request);
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
