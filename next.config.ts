import type { NextConfig } from "next";

/**
 * Turvaotsakkeet. CSP asetetaan `src/middleware.ts`:ssä, koska se vaatii
 * per-pyyntö-noncen – sama ratkaisu kuin esinetti- ja reilusoppari-web-repoissa.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Sovellus ei ole upotettava, toisin kuin eSinetin /embed.
  { key: "X-Frame-Options", value: "DENY" },
  /**
   * Kamera on sallittu: katselmuksen kuvat otetaan selaimessa (CLAUDE.md 5.3).
   *
   * Paikannus on nimenomaisesti KIELLETTY. Kuvista poistetaan EXIF-GPS
   * palvelimella (CLAUDE.md 5.3), ja olisi epäjohdonmukaista pyytää samaa
   * tietoa selaimelta erikseen. Mikrofonia ei tarvita mihinkään.
   */
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  /**
   * Tiedostot, jotka on pakattava mukaan palvelinfunktioihin.
   *
   * ==========================================================================
   * MIKSI NÄMÄ ON LUETELTAVA KÄSIN
   *
   * Next.js päättelee riippuvuudet koodia lukemalla. Se ei näe kahta asiaa:
   *
   * 1. **Omat fontit.** Ne luetaan levyltä polulla, joka muodostetaan ajon
   *    aikana (`src/documents/fonts.ts`).
   * 2. **pdfkitin vakiofontit.** pdfkit lataa ne dynaamisella `require`illa,
   *    jota jäljitin ei tunnista. Näitä tarvitaan, vaikka asiakirjoissa
   *    käytetään omaa fonttia: pdfkit alustaa dokumentin Helveticalla.
   *
   * Molemmat toimivat paikallisesti, koska silloin koko `node_modules` on
   * olemassa. Vika näkyy vasta tuotannossa — ja näkyi:
   * `Cannot find module '/var/task/node_modules/pdfkit/js/standard-fonts/Helvetica.cjs'`.
   * ==========================================================================
   */
  outputFileTracingIncludes: {
    "/**": [
      "./src/documents/fonts/**",
      "./node_modules/pdfkit/js/standard-fonts/**",
      "./node_modules/pdfkit/js/data/**",
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
