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
 * IKKUNA ON KIINTEÄ, EI LIUKUVA
 *
 * Ikkunan alku pyöristetään alaspäin, joten sama arvo osuu koko ikkunan ajan
 * samaan riviin. Liukuva ikkuna olisi tarkempi mutta vaatisi rivin per
 * kutsu. Tämä riittää siihen, mihin rajaa tarvitaan: pysäyttämään
 * rikkinäinen silmukka ennen kuin vahinko kasvaa.
 *
 * HUOM SARAKKEEN NIMESTÄ
 *
 * Tietokannassa sarake on `minuutti` (migraatio 0015), koska ensimmäinen
 * käyttö oli minuuttikohtainen. Se pitää sisällään ikkunan alun ikkunan
 * pituudesta riippumatta — tunnin ikkunassa se on tasatunti. Nimi on siis
 * hieman kapeampi kuin sisältö. Sitä ei nimetä uudelleen pelkän nimen
 * takia: migraatio on jo ajettu tuotantoon, ja sarakkeen uudelleennimeäminen
 * on riski, jonka ainoa hyöty olisi kosmeettinen.
 * ===========================================================================
 */

import { getServiceClient } from "../db/supabase";

export interface RateLimitResult {
  allowed: boolean;
  /** Monesko kutsu tämä oli tämän minuutin sisällä. */
  count: number;
}

/**
 * Ikkunan alku pyöristettynä alaspäin.
 *
 * Minuutin ikkuna alkaa tasaminuutilta, tunnin ikkuna tasatunnilta. Sama
 * arvo koko ikkunan ajan, joten kaikki sen kutsut osuvat samaan riviin.
 */
export function windowStart(now: Date, windowMinutes: number): Date {
  const start = new Date(now);
  start.setSeconds(0, 0);

  if (windowMinutes > 1) {
    const minutes = Math.floor(start.getMinutes() / windowMinutes) * windowMinutes;
    start.setMinutes(minutes);
  }

  return start;
}

/**
 * Kasvattaa laskuria ja kertoo, ylittyikö raja.
 *
 * `endpoint` on vapaa tunniste: sama merkkijono kaikissa kutsuissa, joita
 * sama raja koskee. `windowMinutes` on ikkunan pituus — 1 tarkoittaa
 * minuuttia, 60 tuntia.
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  limit: number,
  windowMinutes = 1,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const minute = windowStart(now, windowMinutes);

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

    return { allowed: count <= limit, count };
  } catch (err) {
    console.error(
      `[kutsuraja] ${endpoint}: tarkistus epäonnistui:`,
      err instanceof Error ? err.message : err,
    );
    return { allowed: true, count: 0 };
  }
}
