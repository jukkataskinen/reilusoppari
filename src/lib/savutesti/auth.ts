/**
 * `/api/savutesti`-reitin suojaus: `Authorization: Bearer <SAVUTESTI_SECRET>`.
 *
 * Oma salaisuus eikä CRON_SECRET: savutestin salaisuus on myös GitHubissa,
 * ja sen vuoto avaisi vain tämän yhden reitin, ei cron-töitä.
 * Ilman asetettua salaisuutta reitti on aina kiinni (fail closed).
 */
import { timingSafeEqual } from "node:crypto";

export type SavutestiPaasy = "ok" | "ei_asetettu" | "kielletty";

export function tarkistaSavutestinPaasy(authorization: string | null): SavutestiPaasy {
  const secret = process.env.SAVUTESTI_SECRET;
  // Lyhyt salaisuus on todennäköisesti virhe asetuksissa, ei tarkoituksellinen.
  if (!secret || secret.length < 32) return "ei_asetettu";
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const given = Buffer.from(authorization ?? "", "utf8");
  if (expected.length !== given.length) return "kielletty";
  return timingSafeEqual(expected, given) ? "ok" : "kielletty";
}
