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
   * Asiakirjojen fontit luetaan levyltä ajon aikana (`src/documents/fonts.ts`).
   * Ilman tätä ne eivät päädy Vercelin funktiopakettiin, ja PDF:n tuottaminen
   * kaatuisi vasta tuotannossa — paikallisesti kaikki toimisi.
   */
  outputFileTracingIncludes: {
    "/**": ["./src/documents/fonts/**"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
