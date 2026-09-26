/**
 * Kutsuraja julkisille linkeille: kutsulinkki ja todistuksen jakolinkki
 * (CLAUDE.md kohta 6).
 *
 * ===========================================================================
 * MIKSI VERKKO-OSOITTEEN MUKAAN
 *
 * Linkin avaaja ei ole kirjautunut, joten käyttäjäkohtainen raja
 * (`rate-limit.ts`) ei ilmaise tätä. Tunniste on 256-bittinen ja tiivisteenä,
 * joten arvaaminen ei ole realistinen uhka. Raja on kuormituksen rajausta:
 * yksi osoite ei voi pommittaa tietokantaa tunnistehauilla.
 *
 * IP-OSOITETTA EI TALLENNETA
 *
 * Tauluun menee HMAC(salaisuus, päivä + IP). Päivä on mukana, jotta saman
 * osoitteen rivejä ei voi yhdistää päivien yli, ja salaisuus, jottei avainta
 * voi kääntää takaisin kokeilemalla kaikki IPv4-osoitteet (niitä on vain
 * neljä miljardia). Rivit poistuvat vuorokaudessa (migraatio 0016).
 *
 * Salaisuus johdetaan `INVITE_TOKEN_SECRET`:stä omalla etuliitteellä eikä
 * uutta ympäristömuuttujaa lisätä: uusi muuttuja olisi yksi asia lisää, joka
 * voi unohtua Verceliin, ja silloin raja olisi hiljaa pois päältä.
 *
 * RAJA ON VÄLJÄ, KOSKA VERKKO-OSOITE ON JAETTU
 *
 * Suomalaiset mobiiliverkot jakavat saman julkisen osoitteen monelle
 * liittymälle (CGNAT), ja samoin toimistoverkot. Tiukka raja estäisi oikean
 * vuokralaisen, joka sattuu olemaan samassa verkossa kuin joku toinen.
 * Raja on siksi mitoitettu silmukkaa ja hakkausta vastaan, ei tavallista
 * käyttöä vastaan.
 *
 * PUUTTUVA RAJA ON PAREMPI KUIN RIKKI OLEVA LINKKI
 *
 * Sama linjaus kuin `rate-limit.ts`:ssä: jos tarkistus epäonnistuu, linkki
 * avautuu, mutta asia kirjataan lokiin. Lokiin ei kirjoiteta osoitetta eikä
 * tunnistetta.
 * ===========================================================================
 */

import { createHmac } from "node:crypto";
import { getServiceClient } from "../db/supabase";
import { windowStart } from "./rate-limit";

export interface LinkRateLimit {
  endpoint: string;
  limit: number;
  windowMinutes: number;
}

/**
 * Kutsulinkki. Oikea vuokralainen avaa linkin muutaman kerran: ennen
 * kirjautumista, sen jälkeen ja ehkä uudelleen seuraavana päivänä.
 * Kuusikymmentä kymmenessä minuutissa on moninkertainen.
 */
export const KUTSULINKKIRAJA: LinkRateLimit = {
  endpoint: "linkki.kutsu",
  limit: 60,
  windowMinutes: 10,
};

/**
 * Todistuksen jakolinkki: sivu ja PDF kuluttavat samaa rajaa, koska
 * katselija avaa tavallisesti molemmat.
 */
export const JAKOLINKKIRAJA: LinkRateLimit = {
  endpoint: "linkki.todistus",
  limit: 60,
  windowMinutes: 10,
};

export const LINKKIRAJA_VIESTI =
  "Linkkiä on avattu tästä verkosta poikkeuksellisen monta kertaa lyhyessä ajassa. Odota hetki ja yritä uudelleen.";

/**
 * Asiakkaan osoite pyyntöotsakkeista.
 *
 * Vercel kirjoittaa `x-real-ip`:n ja `x-forwarded-for`:n itse eikä päästä
 * asiakkaan omaa arvoa läpi, joten niihin voi luottaa. `x-forwarded-for`:n
 * ensimmäinen osoite on asiakas, loput välityspalvelimia.
 */
export function clientIp(headers: Pick<Headers, "get">): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return null;
}

/**
 * Rajan avain: HMAC(salaisuus, päivä + IP), 32 heksamerkkiä.
 *
 * Päivä otetaan ikkunan alusta eikä kellosta, jotta saman ikkunan kaikki
 * kutsut saavat varmasti saman avaimen myös keskiyön kohdalla.
 */
export function linkRateKey(ip: string, window: Date, secret: string): string {
  const day = window.toISOString().slice(0, 10);
  return createHmac("sha256", `linkkiraja:${secret}`)
    .update(`${day}|${ip}`)
    .digest("hex")
    .slice(0, 32);
}

function secret(): string | null {
  return process.env.INVITE_TOKEN_SECRET?.trim() || null;
}

/**
 * Kasvattaa osoitteen laskuria ja kertoo, saako linkin avata.
 *
 * Ilman osoitetta (paikallinen kehitys) tai salaisuutta rajaa ei voi laskea,
 * ja linkki avautuu.
 */
export async function checkLinkRateLimit(
  headers: Pick<Headers, "get">,
  rule: LinkRateLimit,
  now: Date = new Date(),
): Promise<{ allowed: boolean }> {
  const ip = clientIp(headers);
  const key = secret();
  if (!ip || !key) return { allowed: true };

  const window = windowStart(now, rule.windowMinutes);

  try {
    const { data, error } = await getServiceClient().rpc("rs_kasvata_linkkiraja", {
      p_avain: linkRateKey(ip, window, key),
      p_endpoint: rule.endpoint,
      p_ikkuna: window.toISOString(),
    });

    if (error) {
      console.error(`[linkkiraja] ${rule.endpoint}: laskurin kasvatus epäonnistui:`, error.message);
      return { allowed: true };
    }

    const count = Number(data);
    if (!Number.isFinite(count)) {
      console.error(`[linkkiraja] ${rule.endpoint}: laskuri palautti odottamatonta`);
      return { allowed: true };
    }

    return { allowed: count <= rule.limit };
  } catch (err) {
    console.error(
      `[linkkiraja] ${rule.endpoint}: tarkistus epäonnistui:`,
      err instanceof Error ? err.message : err,
    );
    return { allowed: true };
  }
}
