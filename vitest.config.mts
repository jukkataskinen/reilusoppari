import { defineConfig } from "vitest/config";
import path from "node:path";

const rootDir = import.meta.dirname;

export default defineConfig({
  /**
   * `tsconfig.json`:ssa `jsx: "preserve"`, koska Next.js kääntää JSX:n itse.
   * Vitest ei käytä Nextin kääntäjää, joten sille on kerrottava erikseen —
   * muuten asiakirjakomponenttien testit kaatuvat jäsennysvirheeseen.
   */
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    // Lataa .env.local, jotta live-Supabasea vasten ajettavat
    // integraatiotestit eivät ohitu turhaan (ks. tests/setup-env.ts).
    setupFiles: ["./tests/setup-env.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
      "@content": path.resolve(rootDir, "./content"),
    },
  },
});
