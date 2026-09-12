/**
 * Kutsuraja per käyttäjä per endpoint (CLAUDE.md kohta 6).
 *
 * ===========================================================================
 * PUUTTUVA RAJA ON PAREMPI KUIN RIKKI OLEVA TOIMINTO
 *
 * Jos rajan tarkistus epäonnistuu — tietokanta ei vastaa, funktio puuttuu —
 * kutsu päästetään läpi. Vaihtoehto olisi, että tietokantahäiriö estäisi
 * kuvaamisen keskellä katselmusta.
 *
 * Mutta se KIRJATAAN lokiin, koska se tarkoittaa, ettei raja sillä hetkellä
 * suojaa mitään. Hiljainen läpipäästö olisi turvallisuusaukko, josta kukaan
 * ei tietäisi. Sama linjaus kuin Jukan toisessa järjestelmässä
 * (`kasamaster/app/api/_kutsuraja.js`).
 *
 * RAJA ON MINUUTTIKOHTAINEN, EI LIUKUVA
 *
 * Minuutti pyöristetään alaspäin, joten sama arvo osuu koko minuutin ajan
 * samaan riviin. Liukuva ikkuna olisi tarkempi mutta vaatisi rivin per
 * kutsu. Tämä riittää siihen, mihin rajaa tarvitaan: pysäyttämään
 * rikkinäinen silmukka ennen kuin lasku kasvaa.
 * ===========================================================================
 */

import { getServiceClient } from "../db/supabase";

export interface RateLimitResult {
  allowed: boolean;
  /** Monesko kutsu tämä oli tämän minuutin sisällä. */
  count: number;
}

/**
 * Kasvattaa laskuria ja kertoo, ylittyikö raja.
 *
 * `endpoint` on vapaa tunniste: sama merkkijono kaikissa kutsuissa, joita
 * sama raja koskee.
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  perMinute: number,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const minute = new Date(now);
  minute.setSeconds(0, 0);

  try {
    const { data, error } = await getServiceClient().rpc("rs_kasvata_kutsuraja", {
      p_user_id: userId,
      p_endpoint: endpoint,
      p_minuutti: minute.toISOString(),
    });

    if (error) {
      console.error(`[kutsuraja] ${endpoint}: laskurin kasvatus epäonnistui:`, error.message);
      return { allowed: true, count: 0 };
    }

    const count = Number(data);
    if (!Number.isFinite(count)) {
      console.error(`[kutsuraja] ${endpoint}: laskuri palautti odottamatonta`);
      return { allowed: true, count: 0 };
    }

    return { allowed: count <= perMinute, count };
  } catch (err) {
    console.error(
      `[kutsuraja] ${endpoint}: tarkistus epäonnistui:`,
      err instanceof Error ? err.message : err,
    );
    return { allowed: true, count: 0 };
  }
}
