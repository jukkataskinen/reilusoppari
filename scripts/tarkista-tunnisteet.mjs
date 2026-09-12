/**
 * Vahti: henkilötunnus ei saa vuotaa.
 *
 * ===========================================================================
 * MIKSI TÄMÄ ON OLEMASSA
 *
 * Aiemmin repossa oli sääntö "ei henkilötunnuksia missään", ja sitä vartioi
 * yksinkertainen grep. Jukka muutti linjausta 2026-09-11: suomalaisessa
 * vuokrasopimuksessa osapuolet yksilöidään henkilötunnuksella, ja ilman sitä
 * sopimus on perinnässä heikompi (DECISIONS.md).
 *
 * Kielto ei siis enää koske tunnuksen olemassaoloa vaan sitä, mihin se pääsee.
 * Riski ei ole tietokannassa — siellä se on salattuna — vaan siinä, että
 * selkokielinen tunnus livahtaa lokiin, listanäkymään tai selaimeen. Tämä
 * skripti tarkistaa ne kolme asiaa, jotka sen estävät.
 *
 * Aja paikallisesti: npm run tarkista:tunnisteet
 * ===========================================================================
 */

import { globSync, readFileSync } from "node:fs";

const LÄHTEET = globSync("src/**/*.{ts,tsx}");

/** Näissä tiedostoissa selkokielinen tunnus on tarkoituksella käsillä. */
const SALLITUT = {
  // Salaus ja purku.
  decryptSensitive: ["src/lib/identity/crypto.ts", "src/lib/tenancy/party-details.ts"],
  // Kokonainen tunnus asiakirjaa varten. Tämä on koko listan tärkein rivi:
  // jos tämä funktio päätyy sivulle tai reitille, tunnus menee selaimeen.
  partyDetailsForDocument: ["src/lib/tenancy/party-details.ts", "src/lib/tenancy/contract-document.ts"],
};

const virheet = [];

for (const tiedosto of LÄHTEET) {
  const polku = tiedosto.replaceAll("\\", "/");
  const rivit = readFileSync(tiedosto, "utf8").split(/\r?\n/);

  for (const [nimi, sallitut] of Object.entries(SALLITUT)) {
    if (sallitut.includes(polku)) continue;

    rivit.forEach((rivi, index) => {
      if (new RegExp(`\\b${nimi}\\b`).test(rivi) && !/^\s*(\*|\/\/)/.test(rivi)) {
        virheet.push(
          `${polku}:${index + 1}  ${nimi} on käytössä tiedostossa, jossa sen ei kuulu olla.\n` +
            `    Sallittu vain: ${sallitut.join(", ")}`,
        );
      }
    });
  }

  // Tunnistetta ei lokiteta. Lokirivi päätyy Vercelin lokiin, joka ei ole
  // salattu eikä osapuolirajattu.
  rivit.forEach((rivi, index) => {
    const lokitus = /console\.(log|info|warn|error|debug)/.test(rivi);
    const tunniste = /personalId|party_id_encrypted|identifier\b|henkil[oö]tunnus/i.test(rivi);
    if (lokitus && tunniste) {
      virheet.push(`${polku}:${index + 1}  tunniste lokirivillä.`);
    }
  });

  /*
    Salainen avain ei saa olla selaimessa.

    Sääntö oli ensin "mikä tahansa NEXT_PUBLIC_*KEY", ja se osui VAPIDin
    julkiseen avaimeen — joka on tarkoituksella julkinen, kuten Supabasen
    anon-avain ja Stripen publishable-avain. Sääntö sanoo nyt sen, mitä se
    tarkoittaa: salaiselta kuulostava nimi ei saa olla NEXT_PUBLIC-etuliitteen
    takana.
  */
  rivit.forEach((rivi, index) => {
    if (/NEXT_PUBLIC_[A-Z_]*(PERSON|SECRET|PRIVATE|SERVICE_ROLE)/.test(rivi)) {
      virheet.push(`${polku}:${index + 1}  salainen avain näyttää päätyvän selaimeen.`);
    }
  });
}

if (virheet.length > 0) {
  console.error("Tunnistetietojen vahti löysi ongelmia:\n");
  for (const virhe of virheet) console.error(`  ${virhe}`);
  console.error(
    "\nHenkilötunnus saa olla kannassa salattuna ja asiakirjassa kokonaisena.\n" +
      "Se ei saa olla lokissa, listanäkymässä eikä selaimeen lähetetyssä HTML:ssä.\n",
  );
  process.exit(1);
}

console.log(`OK: ${LÄHTEET.length} tiedostoa tarkistettu, tunnisteet pysyvät paikoillaan.`);
