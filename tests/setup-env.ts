/**
 * Lataa `.env.local` yksikkötesteihin.
 *
 * Next.js lataa sen automaattisesti sovelluksessa, mutta Vitest ei – ilman
 * tätä live-Supabasea vasten ajettavat integraatiotestit ohittuisivat aina,
 * vaikka tunnukset ovat olemassa.
 *
 * Oma jäsennin eikä `dotenv`: tarve on yksi tiedosto ja `KEY=value`-rivit,
 * eikä testiajoon kannata lisätä riippuvuutta sitä varten. Arvoja ei tulosteta
 * mihinkään – ne ovat salaisuuksia.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const envPath = path.resolve(import.meta.dirname, "..", ".env.local");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();

    // Ympäristöstä tuleva arvo voittaa aina: CI asettaa ne siellä, eikä
    // paikallinen tiedosto saa ohittaa niitä.
    if (value && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
