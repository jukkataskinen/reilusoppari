import { defineConfig, devices } from "@playwright/test";
import { loadEnvLocal } from "./tests/setup-env";

// Playwright ei lue `.env.local`:ia. Ilman tätä Auth0-testi ohittuisi myös
// paikallisesti, eikä koko ketjua todentaisi mikään.
loadEnvLocal();

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
