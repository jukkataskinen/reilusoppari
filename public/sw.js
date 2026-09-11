/**
 * Service worker (PLAN.md vaihe 0, PWA).
 *
 * ===========================================================================
 * TÄRKEIN SÄÄNTÖ: HTML:ÄÄ EI VÄLIMUISTITETA KOSKAAN
 *
 * Sovelluksen sivut sisältävät vuokrasuhteen tietoja: toisen osapuolen nimen,
 * asunnon osoitteen, katselmuksen kuvat, maksuhistorian. Jos sivu jäisi
 * välimuistiin, se olisi luettavissa laitteelta uloskirjautumisen jälkeen —
 * ja puhelin on juuri se laite, joka lainataan tai myydään eteenpäin.
 *
 * Siksi tämä service worker välimuistittaa VAIN sellaista, mikä on samaa
 * kaikille: sovelluksen omat staattiset tiedostot, fontin, kuvakkeet ja
 * yhden offline-sivun. Ei sivuja, ei API-vastauksia, ei kuvia Supabasesta.
 *
 * Offline-tuki on siis tässä vaiheessa se, että sovellus kertoo rehellisesti
 * olevansa yhteydettä — ei se, että se näyttäisi vanhaa dataa uutena.
 * Varsinainen offline-työskentely (katselmuksen kuvat jonoon) tulee
 * vaiheessa 7 natiivikuoren kanssa, ja silloin se tehdään IndexedDB:hen
 * käyttäjäkohtaisesti eikä jaettuun välimuistiin.
 * ===========================================================================
 */

// Versio vaihdetaan, kun välimuistin sisältö muuttuu. Vanhat poistetaan
// aktivoinnissa, joten käyttäjälle ei jää kahta sukupolvea rinnakkain.
const CACHE_VERSION = "reilusoppari-v1";

const OFFLINE_URL = "/offline";

/** Nämä ovat samat kaikille käyttäjille, eivätkä ne muutu ilman uutta versiota. */
const PRECACHE = [
  OFFLINE_URL,
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon.svg",
  "/fonts/sans-variable.woff2",
];

/** Polut, joihin service worker ei koske lainkaan. */
function isOffLimits(url) {
  return (
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/api/") ||
    // Kutsu- ja jakolinkit ovat kertaluonteisia ja tokenillisia: niitä ei
    // saa jäädä laitteelle.
    url.pathname.startsWith("/kutsu/") ||
    url.pathname.startsWith("/todistus/")
  );
}

/** Muuttumattomat rakennusartefaktit ja omat staattiset tiedostot. */
function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".woff2")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      // Uusi versio otetaan heti käyttöön: vanha service worker ei saa jäädä
      // tarjoamaan vanhaa offline-sivua uuden asennuksen jälkeen.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Vain omat GET-pyynnöt. POST ei ole koskaan välimuistitettavaa, ja
  // ulkopuoliset alkuperät (Supabase Storage) eivät kuulu tänne lainkaan:
  // niiden sisältö on käyttäjäkohtaista.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isOffLimits(url)) return;

  if (request.mode === "navigate") {
    // Verkko ensin, eikä vastausta talleteta. Yhteydettä näytetään
    // offline-sivu — ei vanhaa sivua, joka näyttäisi ajantasaiselta.
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          // Vain onnistuneet ja perusmuotoiset vastaukset. `opaque`-vastausta
          // ei voi tarkistaa, joten sitä ei talleteta.
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }

  // Kaikki muu menee suoraan verkkoon ilman välimuistia.
});

/**
 * Uloskirjautuminen tyhjentää välimuistin.
 *
 * Välimuistissa ei pitäisi olla henkilökohtaista, mutta laitteen vaihtuessa
 * on parempi jättää mahdollisimman vähän. Sovellus lähettää tämän viestin
 * ennen kuin ohjaa `/auth/logout`-osoitteeseen.
 */
self.addEventListener("message", (event) => {
  if (event.data === "tyhjenna-valimuisti") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});
