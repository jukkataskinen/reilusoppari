import { defineConfig } from "vitest/config";
import path from "node:path";

const rootDir = import.meta.dirname;

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
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
