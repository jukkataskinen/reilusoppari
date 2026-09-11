import { defineConfig } from "vitest/config";
import path from "node:path";

const rootDir = import.meta.dirname;

/**
 * Esimerkkiasiakirjojen tuottaminen (`npm run samples`).
 *
 * Oma konfiguraatio eikä `mergeConfig`, koska `include` pitää KORVATA eikä
 * täydentää: muuten esimerkkien tuottaminen ajaisi koko testisarjan.
 * `npm test` ei saa kirjoittaa tiedostoja levylle, joten nämä ovat erillään.
 */
export default defineConfig({
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    environment: "node",
    include: ["tests/samples/**/*.test.tsx"],
    setupFiles: ["./tests/setup-env.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
      "@content": path.resolve(rootDir, "./content"),
    },
  },
});
