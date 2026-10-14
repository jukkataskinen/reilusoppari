import { NextResponse } from "next/server";
import { tarkistaSavutestinPaasy } from "@/lib/savutesti/auth";
import { ajaAskeleet } from "@/lib/savutesti/runner";
import { reilusoppariAskeleet } from "@/lib/savutesti/steps";

/**
 * `GET /api/savutesti`: tuotannon päivittäinen savutesti (Jukan päätös 14.10.2026).
 *
 * GitHub Actions (`.github/workflows/savutesti.yml`) kutsuu tätä joka aamu.
 * Askeleet `src/lib/savutesti/steps.ts`, kriittiset polut `docs/kriittiset-polut.md`.
 * Ei sama asia kuin `tests/e2e/savutesti.spec.ts`, joka tarkistaa CI:ssä
 * etusivun, turvaotsakkeet ja kirjautumisen ohjauksen.
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: vain `Authorization: Bearer <SAVUTESTI_SECRET>`.
 *    Ilman salaisuutta reitti on kiinni (503), väärällä 401.
 * 2. Henkilötieto: aineisto on keksittyä, ei henkilötunnuksia. Vastauksessa
 *    vain askeleiden nimet, tila, kesto ja lyhyt koodi.
 * 3. Syöte: ei mitään.
 * 4. Toisto: jokainen ajo siivoaa luomansa asunnon. Ei viestejä, kierroksia
 *    eikä maksuja.
 * 5. Salaisuus: oma `SAVUTESTI_SECRET`, ei CRON_SECRET, koska se on myös GitHubissa.
 * 6. Epäonnistuminen: 200 ja `ok: false`, jotta raportti näkyy kokonaan.
 * 7. Lokitus: askel ja koodi, ei virheviestejä.
 * ===========================================================================
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const EI_VALIMUISTIA = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const paasy = tarkistaSavutestinPaasy(request.headers.get("authorization"));
  if (paasy === "ei_asetettu") {
    console.error("[savutesti] SAVUTESTI_SECRET puuttuu, reitti pysyy kiinni.");
    return NextResponse.json({ error: { code: "not_configured" } }, { status: 503, headers: EI_VALIMUISTIA });
  }
  if (paasy === "kielletty") {
    return NextResponse.json({ error: { code: "unauthorized" } }, { status: 401, headers: EI_VALIMUISTIA });
  }

  const tulos = await ajaAskeleet(reilusoppariAskeleet());
  return NextResponse.json(tulos, { status: 200, headers: EI_VALIMUISTIA });
}
