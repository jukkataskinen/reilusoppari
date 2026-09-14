/**
 * Auth0-tenantin asetukset Management API:n kautta.
 *
 * ===========================================================================
 * MIKSI SKRIPTI EIKÄ KLIKKAILU
 *
 * Sama asetus tehdään vielä uudelleen, kun eSinetti, Adepta PPR ja SKOG
 * joskus siirretään omaan tenanttiinsa. Klikkailtu asetus ei ole
 * toistettavissa eikä tarkistettavissa: puolen vuoden päästä kukaan ei muista
 * mitä ruudulla oli valittuna. Tämä tiedosto on versionhallinnassa.
 *
 * EI TEE MITÄÄN ILMAN `--aja`
 *
 * Oletuksena skripti lukee tenantin tilan ja tulostaa, mitä se muuttaisi.
 * Mitään ei kirjoiteta. Se on oletus siksi, että tämä ajetaan käsin, harvoin
 * ja jännittyneenä.
 *
 * KIELTÄYTYY AJAMASTA VÄÄRÄÄN TENANTTIIN
 *
 * Ennen mitään kirjoitusta skripti listaa tenantin sovellukset. Jos siellä on
 * muita kuin odotetut, se pysähtyy ja näyttää nimet. Tämä on koko skriptin
 * tärkein kohta: sama kutsu, joka asettaa uuden tenantin oikein, rikkoisi
 * vanhan — kytkisi passwordless-yhteyden pois eSinetiltä ja vaihtaisi
 * kirjautumissivun nimen kolmelta tuotantojärjestelmältä.
 *
 * Ero tenanttien välillä on yksi ympäristömuuttujan rivi, eikä väärä rivi
 * näytä väärältä. Siksi tarkistus katsoo, mitä tenantissa oikeasti on.
 *
 * SALAISUUKSIA EI TULOSTETA
 *
 * Sovelluksen client secret kirjoitetaan suoraan `.env.local`:iin eikä
 * näytetä ruudulla. Ruudulle tulee vain vahvistus siitä, montako riviä
 * kirjoitettiin.
 *
 * Aja:
 *   npm run auth0:asetukset              kuivaharjoitus, ei kirjoita mitään
 *   npm run auth0:asetukset -- --aja     tekee muutokset
 * ===========================================================================
 */

import { readFileSync, writeFileSync } from "node:fs";
import {
  paivitaYmparisto,
  sovellusOsoitteet,
  tenanttiOnTyhja,
  vieraatSovellukset,
  type TenantClient,
} from "../src/lib/auth/tenant-setup.js";

/* -------------------------------------------------------------------------
   Asetukset, jotka tähän tenanttiin kuuluvat
   ------------------------------------------------------------------------- */

const SOVELLUS = "Reilusoppari";
const ASETUSSKRIPTI = "Asetusskripti";

/** Osoitteet, joista kirjautuminen saa palata. */
const PERUSTAT = ["http://localhost:3000", "https://app.reilusoppari.fi"];

const LAHETTAJA = "noreply@reilusoppari.fi";
const AIHE = "{{ application.name }}: kirjautumiskoodi";

/** Viestipohja luetaan tiedostosta: yksi totuus, versionhallinnassa. */
const POHJA = "auth0/kirjautumiskoodi.liquid";

/*
  Tenantin nimi näkyy kirjautumissivulla ("Syötä {nimi}-salasanasi").
  Tässä tenantissa on vain Reilusoppari, joten nimi saa olla Reilusoppari.
  Vanhassa tenantissa se EI saa olla — ks. BLOCKERS.md.
*/
const TENANTIN_NIMI = "Reilusoppari";
const TUKIOSOITE = "https://reilusoppari.fi/yhteystiedot";

/* -------------------------------------------------------------------------
   Ympäristö
   ------------------------------------------------------------------------- */

function lataaYmparisto(): void {
  try {
    for (const rivi of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const kohta = rivi.indexOf("=");
      if (kohta === -1 || rivi.trimStart().startsWith("#")) continue;

      const avain = rivi.slice(0, kohta).trim();
      const arvo = rivi.slice(kohta + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[avain]) process.env[avain] = arvo;
    }
  } catch {
    // Tiedostoa ei ole: ympäristömuuttujat voivat silti olla asetettuina.
  }
}

function vaadi(nimi: string): string {
  const arvo = process.env[nimi]?.trim();
  if (!arvo) {
    throw new Error(
      `${nimi} puuttuu. Katso auth0/AJO-OHJE.md — se kertoo mistä arvo otetaan.`,
    );
  }
  return arvo;
}

/* -------------------------------------------------------------------------
   Management API
   ------------------------------------------------------------------------- */

let token = "";
let domain = "";

async function kutsu<T>(
  metodi: "GET" | "POST" | "PATCH",
  polku: string,
  runko?: unknown,
): Promise<T> {
  const vastaus = await fetch(`https://${domain}/api/v2${polku}`, {
    method: metodi,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: runko === undefined ? undefined : JSON.stringify(runko),
  });

  const teksti = await vastaus.text();

  if (!vastaus.ok) {
    /*
      Auth0:n virheviesti tulostetaan sellaisenaan. Se kertoo täsmälleen mikä
      kenttä on väärin, ja oma tulkintani siitä olisi vain huonompi kopio.
    */
    throw new Error(`${metodi} ${polku} → ${vastaus.status}\n${teksti}`);
  }

  return (teksti ? JSON.parse(teksti) : {}) as T;
}

async function haeToken(): Promise<void> {
  const vastaus = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: vaadi("AUTH0_MGMT_CLIENT_ID"),
      client_secret: vaadi("AUTH0_MGMT_CLIENT_SECRET"),
      audience: `https://${domain}/api/v2/`,
    }),
  });

  if (!vastaus.ok) {
    throw new Error(
      `Management API -tunnistautuminen epäonnistui (${vastaus.status}).\n` +
        `${await vastaus.text()}\n\n` +
        "Tarkista, että M2M-sovellukselle on annettu oikeudet Management APIin " +
        "(auth0/AJO-OHJE.md, kohta 3).",
    );
  }

  token = ((await vastaus.json()) as { access_token: string }).access_token;
}

/* -------------------------------------------------------------------------
   Vaiheet
   ------------------------------------------------------------------------- */

const aja = process.argv.includes("--aja");
const pakota = process.argv.includes("--pakota");
const muutokset: string[] = [];

function kerro(teksti: string): void {
  muutokset.push(teksti);
  console.log(`  ${aja ? "✓" : "·"} ${teksti}`);
}

/** Pysäyttää ajon, jos tenantissa on muiden projektien sovelluksia. */
async function tarkistaTenantti(): Promise<TenantClient[]> {
  const clients = await kutsu<TenantClient[]>(
    "GET",
    "/clients?fields=client_id,name&include_fields=true&per_page=100",
  );

  const vieraat = vieraatSovellukset(clients, [SOVELLUS, ASETUSSKRIPTI]);

  if (!tenanttiOnTyhja(vieraat)) {
    if (!pakota) {
      throw new Error(
        "PYSÄYTETTY: tenantissa on sovelluksia, jotka eivät kuulu tänne:\n" +
          vieraat.map((nimi) => `  - ${nimi}`).join("\n") +
          "\n\nTämä näyttää vanhalta tenantilta. Jos ajat tämän tässä, " +
          "noiden sovellusten kirjautuminen menee rikki.\n" +
          "Tarkista AUTH0_MGMT_DOMAIN.\n\n" +
          "Jos tiedät mitä teet, lisää --pakota.",
      );
    }
    console.log(`  ⚠ Ohitetaan varoitus: ${vieraat.join(", ")}`);
  }

  return clients;
}

async function asetaTenantinNimi(): Promise<void> {
  const nyt = await kutsu<{ friendly_name?: string }>("GET", "/tenants/settings");

  if (nyt.friendly_name === TENANTIN_NIMI) {
    console.log(`  – tenantin nimi on jo ${TENANTIN_NIMI}`);
    return;
  }

  kerro(`tenantin nimi: ${nyt.friendly_name ?? "(tyhjä)"} → ${TENANTIN_NIMI}`);
  if (!aja) return;

  await kutsu("PATCH", "/tenants/settings", {
    friendly_name: TENANTIN_NIMI,
    support_url: TUKIOSOITE,
    enabled_locales: ["fi"],
  });
}

/**
 * Identifier First.
 *
 * Ilman tätä Auth0 pudottaa `connection: "email"` -parametrin hiljaa ja
 * näyttää salasanalomakkeen, vaikka salasanoja ei ole olemassa. Se ei kaada
 * mitään eikä näy lokista. Maksoi kerran tunteja (DECISIONS.md).
 */
async function asetaTunnistusprofiili(): Promise<void> {
  const nyt = await kutsu<{ identifier_first?: boolean }>("GET", "/prompts");

  if (nyt.identifier_first === true) {
    console.log("  – Identifier First on jo päällä");
    return;
  }

  kerro("Authentication Profile → Identifier First");
  if (!aja) return;

  await kutsu("PATCH", "/prompts", { identifier_first: true });
}

async function asetaSovellus(clients: TenantClient[]): Promise<string> {
  const osoitteet = sovellusOsoitteet(PERUSTAT);
  const olemassa = clients.find((client) => client.name === SOVELLUS);

  if (olemassa) {
    kerro(`sovellus ${SOVELLUS}: paluuosoitteet päivitetään`);
    if (aja) await kutsu("PATCH", `/clients/${olemassa.client_id}`, osoitteet);
    return olemassa.client_id;
  }

  kerro(`sovellus ${SOVELLUS} luodaan (Regular Web Application)`);
  if (!aja) return "";

  const luotu = await kutsu<{ client_id: string; client_secret: string }>("POST", "/clients", {
    name: SOVELLUS,
    app_type: "regular_web",
    oidc_conformant: true,
    grant_types: ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: "client_secret_post",
    ...osoitteet,
  });

  // Arvoja ei tulosteta; ne menevät suoraan .env.local:iin.
  kirjoitaYmparisto({
    AUTH0_DOMAIN: domain,
    AUTH0_CLIENT_ID: luotu.client_id,
    AUTH0_CLIENT_SECRET: luotu.client_secret,
  });

  return luotu.client_id;
}

async function asetaSahkopostipalvelin(): Promise<void> {
  const salasana = process.env.RESEND_API_KEY?.trim();

  if (!salasana) {
    console.log("  ⚠ RESEND_API_KEY puuttuu — sähköpostipalvelin jää asettamatta");
    return;
  }

  const asetus = {
    name: "smtp",
    enabled: true,
    default_from_address: LAHETTAJA,
    credentials: {
      smtp_host: "smtp.resend.com",
      smtp_port: 587,
      smtp_user: "resend",
      smtp_pass: salasana,
    },
  };

  const nyt = await kutsu<{ name?: string }>("GET", "/emails/provider").catch(() => null);

  kerro(`sähköpostipalvelin: SMTP (Resend), lähettäjä ${LAHETTAJA}`);
  if (!aja) return;

  await kutsu(nyt?.name ? "PATCH" : "POST", "/emails/provider", asetus);
}

/**
 * Yhteyden ja sovelluksen kytkentä.
 *
 * Auth0 siirsi tämän omaan päätepisteeseensä: `enabled_clients` yhteyden
 * päivityksessä tuottaa nyt virheen "Additional properties not allowed".
 * Vanha muoto on silti käytössä osassa tenantteja, joten uutta kokeillaan
 * ensin ja vanhaan palataan vain jos päätepistettä ei ole.
 */
async function haeYhteydenAsiakkaat(
  yhteysId: string,
  vanhaKentta: string[] | undefined,
): Promise<Set<string>> {
  try {
    const vastaus = await kutsu<{ clients?: Array<{ client_id: string }> } | Array<{ client_id: string }>>(
      "GET",
      `/connections/${yhteysId}/clients`,
    );
    const lista = Array.isArray(vastaus) ? vastaus : (vastaus.clients ?? []);
    return new Set(lista.map((rivi) => rivi.client_id));
  } catch {
    return new Set(vanhaKentta ?? []);
  }
}

/** Kytkee sovelluksen yhteyteen päälle tai pois. */
async function kytkeAsiakas(
  yhteysId: string,
  clientId: string,
  paalle: boolean,
): Promise<void> {
  try {
    await kutsu("PATCH", `/connections/${yhteysId}/clients`, [
      { client_id: clientId, status: paalle },
    ]);
  } catch (virhe) {
    // Vanha tenantti: kytkentä on yhteyden oma kenttä.
    const yhteys = await kutsu<{ enabled_clients?: string[] }>("GET", `/connections/${yhteysId}`);
    const nyt = new Set(yhteys.enabled_clients ?? []);

    if (paalle) nyt.add(clientId);
    else nyt.delete(clientId);

    await kutsu("PATCH", `/connections/${yhteysId}`, { enabled_clients: [...nyt] }).catch(() => {
      throw virhe;
    });
  }
}

/**
 * Passwordless-sähköpostiyhteys.
 *
 * Asetukset luetaan ensin ja kirjoitetaan siihen muotoon, jossa ne jo ovat:
 * Auth0 on esittänyt nämä kentät kahdessa eri rakenteessa eri aikoina, ja
 * arvaaminen tuottaisi hiljaa väärän asetuksen. Tästä syystä yhteys pitää
 * luoda käsin ennen ajoa (AJO-OHJE.md, kohta 4).
 */
async function asetaYhteys(clientId: string): Promise<void> {
  const yhteydet = await kutsu<Array<{ id: string; name: string; options: Record<string, unknown>; enabled_clients?: string[] }>>(
    "GET",
    "/connections?strategy=email",
  );

  const yhteys = yhteydet[0];

  if (!yhteys) {
    console.log(
      "  ⚠ Passwordless-sähköpostiyhteyttä ei ole. Kytke se päälle ensin:\n" +
        "     Authentication → Passwordless → Email (AJO-OHJE.md, kohta 4)",
    );
    return;
  }

  const pohja = readFileSync(POHJA, "utf8");
  const options = { ...yhteys.options };

  // Kumpi rakenne tenantissa on käytössä: `options.email.*` vai `options.*`.
  const sisakkainen = options.email && typeof options.email === "object";
  const kohde = sisakkainen ? { ...(options.email as Record<string, unknown>) } : options;

  kohde.syntax = "liquid";
  kohde.from = LAHETTAJA;
  kohde.subject = AIHE;
  // Kumpikin nimi on ollut käytössä; kirjoitetaan se, joka jo on olemassa.
  if ("template" in kohde) kohde.template = pohja;
  else kohde.body = pohja;

  if (sisakkainen) options.email = kohde;

  kerro(
    `passwordless-yhteys: lähettäjä, aihe ja pohja (${sisakkainen ? "options.email" : "options"})`,
  );

  const asiakkaat = await haeYhteydenAsiakkaat(yhteys.id, yhteys.enabled_clients);
  const kytkettava = Boolean(clientId) && !asiakkaat.has(clientId);

  if (kytkettava) kerro(`passwordless-yhteys päälle sovellukselle ${SOVELLUS}`);

  if (!aja) return;

  // Asetukset ja kytkentä ovat eri kutsuja: `enabled_clients` yhteyden
  // päivityksessä tuottaa virheen "Additional properties not allowed".
  await kutsu("PATCH", `/connections/${yhteys.id}`, { options });
  if (kytkettava) await kytkeAsiakas(yhteys.id, clientId, true);
}

/** Salasanayhteys pois sovellukselta: Reilusopparissa ei ole salasanoja. */
async function poistaSalasanayhteys(clientId: string): Promise<void> {
  if (!clientId) return;

  const yhteydet = await kutsu<Array<{ id: string; name: string; enabled_clients?: string[] }>>(
    "GET",
    "/connections?strategy=auth0",
  );

  for (const yhteys of yhteydet) {
    const kaytossa = await haeYhteydenAsiakkaat(yhteys.id, yhteys.enabled_clients);
    if (!kaytossa.has(clientId)) continue;

    kerro(`tietokantayhteys ${yhteys.name} pois sovellukselta ${SOVELLUS}`);
    if (!aja) continue;

    await kytkeAsiakas(yhteys.id, clientId, false);
  }
}

function kirjoitaYmparisto(arvot: Record<string, string>): void {
  let sisalto = "";
  try {
    sisalto = readFileSync(".env.local", "utf8");
  } catch {
    // Tiedostoa ei ole vielä; luodaan.
  }

  writeFileSync(".env.local", paivitaYmparisto(sisalto, arvot), "utf8");
  console.log(`  ✓ .env.local: ${Object.keys(arvot).length} riviä kirjoitettu (arvoja ei tulosteta)`);
}

/* -------------------------------------------------------------------------
   Ajo
   ------------------------------------------------------------------------- */

/**
 * Virheet tulostetaan pelkkänä viestinä.
 *
 * Kutsupino näyttää siltä kuin jokin olisi rikki, vaikka kyse olisi
 * puuttuvasta ympäristömuuttujasta. Tämän skriptin ajaa ihminen, joka ei lue
 * `ModuleJob.run`-riviä vaan säikähtää sitä.
 */
async function ajo(): Promise<void> {
  lataaYmparisto();
  domain = vaadi("AUTH0_MGMT_DOMAIN");

  console.log("");
  console.log(`Tenantti: ${domain}`);
  console.log(aja ? "Tila: TEHDÄÄN MUUTOKSET" : "Tila: kuivaharjoitus — mitään ei kirjoiteta");
  console.log("");

  await haeToken();

  const clients = await tarkistaTenantti();
  console.log(`Sovelluksia tenantissa: ${clients.length}`);
  console.log("");

  await asetaTenantinNimi();
  await asetaTunnistusprofiili();
  const clientId = await asetaSovellus(clients);
  await asetaSahkopostipalvelin();
  await asetaYhteys(clientId);
  await poistaSalasanayhteys(clientId);

  console.log("");

  if (muutokset.length === 0) {
    console.log("Kaikki oli jo kunnossa.");
  } else if (aja) {
    console.log(`Valmis: ${muutokset.length} muutosta.`);
    console.log("");
    console.log("Seuraavaksi: kirjaudu sovellukseen ja tarkista että koodi tulee suomeksi.");
    console.log("Muista myös viedä .env.local:n Auth0-arvot Vercelin ympäristömuuttujiin.");
  } else {
    console.log(`${muutokset.length} muutosta tehtäisiin. Aja uudelleen: --aja`);
  }
}

try {
  await ajo();
} catch (virhe) {
  console.error("");
  console.error(virhe instanceof Error ? virhe.message : String(virhe));
  console.error("");
  // Ei `process.exit`iä: se katkaisisi tulostuksen kesken Windowsilla.
  process.exitCode = 1;
}
