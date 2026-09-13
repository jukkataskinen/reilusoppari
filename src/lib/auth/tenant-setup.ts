/**
 * Auth0-tenantin asetusskriptin turvalogiikka ja arvojen rakentaminen.
 *
 * ===========================================================================
 * MIKSI TÄMÄ ON ERILLÄÄN SKRIPTISTÄ
 *
 * Skripti (`scripts/auth0-asetukset.mts`) puhuu verkkoon eikä sitä voi ajaa
 * testissä. Nämä funktiot ovat puhtaita, joten juuri se osa, joka estää
 * vahingon, on testattavissa (`tests/unit/tenant-setup.test.ts`).
 *
 * VAARA, JOTA VASTAAN TÄMÄ ON KIRJOITETTU
 *
 * Sama Management API -kutsu, joka asettaa uuden tenantin oikein, rikkoo
 * vanhan: se kytkisi passwordless-yhteyden pois eSinetiltä, Adepta PPR:ltä ja
 * SKOGilta ja vaihtaisi niiden kirjautumissivun nimen. Ero tenanttien välillä
 * on yksi ympäristömuuttujan rivi, ja väärä rivi ei näytä väärältä.
 *
 * Siksi skripti kieltäytyy ajamasta tenanttiin, jossa on muita kuin odotetut
 * sovellukset. Tarkistus perustuu siihen, mitä tenantissa oikeasti on — ei
 * siihen, mitä ajaja luuli valitsevansa.
 * ===========================================================================
 */

/** Sovellus sellaisena kuin Management API sen palauttaa. */
export interface TenantClient {
  client_id: string;
  name: string;
}

/**
 * Auth0:n omat sovellukset, jotka syntyvät jokaiseen uuteen tenanttiin
 * automaattisesti. Näiden olemassaolo ei kerro mitään tenantin käytöstä.
 */
const AUTH0_OMAT = [
  "All Applications",
  "Default App",
  "API Explorer Application",
  "Auth0 Management API",
  "Quickstarts API (Test Application)",
];

/**
 * Sovellukset, jotka eivät kuulu uuteen Reilusoppari-tenanttiin.
 *
 * Tyhjä tulos tarkoittaa, että tenantti on tyhjä tai sisältää vain odotetut.
 * Ei-tyhjä tulos on pysäytys: nimet kertovat ajajalle, minkä tenantin hän oli
 * juuri rikkomassa.
 *
 * @param clients tenantin sovellukset Management API:sta
 * @param odotetut nimet, jotka tähän tenanttiin kuuluvat (sovellus + M2M)
 */
export function vieraatSovellukset(clients: TenantClient[], odotetut: string[]): string[] {
  const sallitut = new Set([...AUTH0_OMAT, ...odotetut].map((nimi) => nimi.toLowerCase()));

  return clients
    .map((client) => client.name)
    .filter((nimi) => !sallitut.has(nimi.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "fi"));
}

/**
 * Onko tenantti turvallinen asetettavaksi.
 *
 * Erillinen funktio eikä pelkkä `length === 0`, koska kutsupaikan on määrä
 * lukea kuin lause: tämä on päätös, ei laskutoimitus.
 */
export function tenanttiOnTyhja(vieraat: string[]): boolean {
  return vieraat.length === 0;
}

/* -------------------------------------------------------------------------
   Sovelluksen osoitteet

   Auth0 hylkää kirjautumisen, jos paluuosoite ei ole listassa täsmälleen
   oikeassa muodossa. Yksi puuttuva `/auth/callback` tai ylimääräinen
   kauttaviiva lopussa riittää. Siksi ne rakennetaan yhdestä perusosoitteesta
   eikä kirjoiteta käsin neljään paikkaan.
   ------------------------------------------------------------------------- */

export interface SovellusOsoitteet {
  callbacks: string[];
  allowed_logout_urls: string[];
  web_origins: string[];
}

/** Poistaa lopun kauttaviivan: `https://x.fi/` ja `https://x.fi` ovat sama. */
function siisti(perusta: string): string {
  return perusta.replace(/\/+$/, "");
}

/**
 * Paluu- ja uloskirjautumisosoitteet kaikille ympäristöille.
 *
 * `/auth/callback` tulee Auth0:n Next.js-SDK:sta: reitti syntyy middlewaren
 * kautta, joten polkua ei voi valita vapaasti.
 */
export function sovellusOsoitteet(perustat: string[]): SovellusOsoitteet {
  const puhtaat = [...new Set(perustat.map(siisti))].filter(Boolean);

  return {
    callbacks: puhtaat.map((perusta) => `${perusta}/auth/callback`),
    allowed_logout_urls: puhtaat,
    web_origins: puhtaat,
  };
}

/* -------------------------------------------------------------------------
   Ympäristömuuttujat
   ------------------------------------------------------------------------- */

/**
 * Kirjoittaa arvot `.env.local`-sisältöön olemassa olevat rivit korvaten.
 *
 * Palauttaa uuden sisällön; tiedoston kirjoittaminen jää kutsujalle, jotta
 * tämä pysyy testattavana.
 *
 * Muut rivit säilyvät koskemattomina järjestyksineen ja kommentteineen:
 * `.env.local` sisältää myös Supabasen ja eSinetin tunnukset, eikä niitä saa
 * menettää siksi, että Auth0 vaihtui.
 */
export function paivitaYmparisto(sisalto: string, arvot: Record<string, string>): string {
  let tulos = sisalto;
  const puuttuvat: string[] = [];

  for (const [avain, arvo] of Object.entries(arvot)) {
    // Rivin alussa oleva avain, myös kommentoituna (`# AUTH0_DOMAIN=`).
    const rivi = new RegExp(`^#?\\s*${avain}=.*$`, "m");
    if (rivi.test(tulos)) {
      tulos = tulos.replace(rivi, `${avain}=${arvo}`);
    } else {
      puuttuvat.push(`${avain}=${arvo}`);
    }
  }

  if (puuttuvat.length > 0) {
    const loppu = tulos.endsWith("\n") ? "" : "\n";
    tulos += `${loppu}\n# Auth0 (kirjoitettu skriptillä auth0-asetukset)\n${puuttuvat.join("\n")}\n`;
  }

  return tulos;
}
