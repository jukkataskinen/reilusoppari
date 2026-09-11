import { defineConfig, devices } from "@playwright/test";

/**
 * Savutesti (CLAUDE.md kohta 8 ja 12, Vaihe A): kaikki (tässä vaiheessa
 * vain etusivu) sivut 200, ei konsolivirheitä, lomakkeet validoivat.
 * Vaihe B lisää loput sivukartan sivut samaan sarjaan.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    // LAUNCH_MODE=waitlist: oletus on `soon`, jossa odotuslistalomaketta ei ole.
    // Lomake on silti tuettu koodipolku, joten e2e ajaa sen omassa tilassaan.
    env: { LAUNCH_MODE: "waitlist" },
    command: "npm run build && npm run start -- -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
