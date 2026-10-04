import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { loadTestEnv } from "./tests/setup-env";

// Testit lukevat avaimet vain `.env.test.local`:ista (ks. tests/setup-env.ts).
loadTestEnv();

// Playwrightin käynnistämä Next.js-palvelin lukee `.env.local`:in itse, ja se
// osoittaa toistaiseksi tuotannon Supabaseen (BLOCKERS.md). Siksi e2e ei
// käynnisty paikallisesti, jos tiedosto on olemassa, ellei sitä erikseen
// sallita (vain kun `.env.local` osoittaa kehitysprojektiin).
if (!process.env.CI && existsSync(".env.local") && process.env.E2E_SALLI_ENV_LOCAL !== "1") {
  throw new Error(
    "E2e pysäytetty: .env.local on olemassa ja Next.js lukisi sen (tuotantokanta). " +
      "Siirrä tiedosto sivuun tai aseta E2E_SALLI_ENV_LOCAL=1, jos se osoittaa kehitysprojektiin.",
  );
}

/**
 * E2E-testit (CLAUDE.md kohta 7).
 *
 * Ajetaan tuotantokäännöstä vasten, ei dev-palvelinta: CSP eroaa näissä
 * (kehityksessä sallitaan `'unsafe-eval'`), ja juuri tuotannon policy on se,
 * joka voi rikkoa sivun. Dev-palvelinta vasten ajettu testi ei näkisi sitä.
 *
 * Mobiili ensin: perusselain on 390 px leveä puhelin, koska katselmus tehdään
 * puhelimella asunnossa seisten. Työpöytäleveys on erikseen.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: "mobiili",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "tyopoyta",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
