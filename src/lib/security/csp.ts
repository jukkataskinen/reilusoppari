/**
 * Content-Security-Policy (CLAUDE.md kohta 11, "turvaotsakkeet").
 *
 * ===========================================================================
 * MIKSI NONCE EIKÄ 'unsafe-inline'
 *
 * Reilusopparissa näytetään toisen osapuolen kirjoittamaa tekstiä: vikailmoitukset,
 * kommentit, vastineet arvioihin. Ne tulevat tietokannasta ja renderöidään
 * Reactilla, joka pakenee ne — mutta CSP on se toinen lukko, joka pitää silloinkin
 * kun ensimmäinen pettää. `'unsafe-inline'` avaisi sen lukon kokonaan.
 *
 * `'strict-dynamic'`: Next.js lataa omat skriptinsä dynaamisesti. Ilman tätä
 * jokainen chunk pitäisi listata erikseen, mikä ei ole mahdollista.
 *
 * Tyyleissä `'unsafe-inline'` on sallittu. Tämä on tietoinen myönnytys: Next.js
 * ja Tailwind syöttävät inline-tyylejä, eikä tyyli-injektio ole samalla tavalla
 * vaarallinen kuin skripti-injektio — pahimmillaan se rikkoo ulkoasun. Jos
 * tulevaisuudessa tyyleihin liittyisi tiedon vuotamista (esim. `background-image:
 * url(...)` käyttäjän syötteestä), tämä on muutettava.
 * ===========================================================================
 */

/** Supabase Storagen alkuperä. Kuvat ja PDF:t haetaan sieltä allekirjoitetuilla linkeillä. */
function supabaseOrigin(): string | null {
  const url = process.env.SUPABASE_URL?.trim();
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Rakentaa CSP-otsikon.
 *
 * Kehityksessä sallitaan `'unsafe-eval'`, koska Next.js:n nopea päivitys
 * tarvitsee sitä. Tuotannossa ei — se on juuri se, mitä ei haluta.
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  const storage = supabaseOrigin();

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'nonce-" + nonce + "'",
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    // `blob:` on kameran ottama kuva ennen lähetystä, `data:` pienet ikonit.
    "img-src": ["'self'", "blob:", "data:", ...(storage ? [storage] : [])],
    "font-src": ["'self'"],
    // Kuvien lataus menee suoraan Supabase Storageen allekirjoitetulla
    // URL:illa, joten selaimen on saatava ottaa yhteys sinne.
    "connect-src": ["'self'", ...(storage ? [storage] : []), ...(isDev ? ["ws:"] : [])],
    // PDF-esikatselu omasta reitistä. Muualta ei upoteta mitään.
    "frame-src": ["'self'", "blob:"],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    // Sovellusta ei upoteta mihinkään — toisin kuin eSinetin /embed.
    "frame-ancestors": ["'none'"],
    // Lomake ei saa lähettää mihinkään muualle. Auth0-kirjautuminen on
    // uudelleenohjaus, ei lomakelähetys, joten tämä ei estä sitä.
    "form-action": ["'self'"],
    "base-uri": ["'none'"],
    "object-src": ["'none'"],
  };

  const parts = Object.entries(directives).map(([key, values]) => key + " " + values.join(" "));
  // `upgrade-insecure-requests` vain tuotannossa: kehityksessä ollaan httpissä.
  if (!isDev) parts.push("upgrade-insecure-requests");

  return parts.join("; ");
}

/** Satunnainen nonce per pyyntö. Web Crypto, koska middleware ajaa Edge-ympäristössä. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
