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
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
