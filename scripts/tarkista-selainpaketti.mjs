/**
 * Vahti: oikea avain ei saa olla selaimeen ladattavassa koodissa.
 *
 * ===========================================================================
 * MIKSI TÄMÄ ON ERI ASIA KUIN LÄHDEKOODIN TARKISTUS
 *
 * `tarkista-tunnisteet.mjs` lukee lähdekoodia ja etsii sieltä kaavoja, jotka
 * TIEDÄN vaarallisiksi. Se ei voi nähdä sitä, mitä en osannut odottaa:
 * kirjaston, joka upottaa ympäristön käännökseen, tai asetuksen, joka
 * vuotaa muuttujan vahingossa.
 *
 * Tämä skripti katsoo lopputulosta. Se lukee ne tiedostot, jotka selain
 * oikeasti lataa, ja etsii niistä oikean avaimen näköisiä merkkijonoja.
 * Se on viimeinen portti ennen julkaisua.
 *
 * Tausta: Jukan toisessa järjestelmässä avain vuoti juuri näin — kääntäjä
 * kirjoitti ympäristömuuttujan selaimeen ladattavaan koodiin, eikä
 * lähdekoodia lukemalla sitä olisi huomannut. Lasku oli kolminumeroinen.
 *
 * Aja: npm run build && npm run tarkista:selainpaketti
 * ===========================================================================
 */

import { globSync, readFileSync } from "node:fs";

/**
 * Oikean avaimen näköinen merkkijono.
 *
 * Kirjoitettu ilman kenoviivoja tarkoituksella: pakomerkit rikkoutuvat
 * helposti, kun tiedostoa muokataan työkalujen läpi, ja rikkoutunut vahti
 * näyttää toimivalta hälyttämättä koskaan.
 */
const AVAIMET = [
  { nimi: "Anthropic", kaava: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { nimi: "Stripe (salainen)", kaava: /sk_(live|test)_[A-Za-z0-9]{20,}/ },
  { nimi: "Stripe (webhook)", kaava: /whsec_[A-Za-z0-9]{20,}/ },
  { nimi: "Resend", kaava: /re_[A-Za-z0-9]{20,}/ },
  /*
    Supabasen service_role on JWT, jonka hyötykuormassa lukee rooli. Anon-avain
    on myös JWT ja se KUULUU selaimeen, joten pelkkä `eyJ` ei kelpaa
    tuntomerkiksi — erottava tekijä on rooli.
  */
  { nimi: "Supabase service_role", kaava: /service_role/ },
];

const TIEDOSTOT = globSync(".next/static/**/*.{js,map,json}");

if (TIEDOSTOT.length === 0) {
  console.error(
    "Selainpakettia ei löytynyt (.next/static). Aja `npm run build` ensin.\n" +
      "Tyhjä tarkistus ei ole hyväksytty tarkistus.",
  );
  process.exit(1);
}

const osumat = [];

for (const tiedosto of TIEDOSTOT) {
  const sisalto = readFileSync(tiedosto, "utf8");

  for (const { nimi, kaava } of AVAIMET) {
    const osuma = kaava.exec(sisalto);
    if (!osuma) continue;

    /*
      Osumasta näytetään vain alku.

      Koko avain lokiin olisi sama vuoto uudestaan — CI:n loki on
      luettavissa, ja virheilmoitus päätyy sähköpostiin.
    */
    osumat.push(
      `${tiedosto.replaceAll("\\", "/")}\n    ${nimi}: ${osuma[0].slice(0, 12)}…`,
    );
  }
}

if (osumat.length > 0) {
  console.error("Selainpaketissa näyttää olevan oikea avain:\n");
  for (const osuma of osumat) console.error(`  ${osuma}`);
  console.error(
    "\nMITÄTÖI avain heti sen palvelun konsolissa ja tee uusi.\n" +
      "Avain on selaimeen ladattavassa tiedostossa, eli se on jo julkinen.\n",
  );
  process.exit(1);
}

console.log(
  `OK: ${TIEDOSTOT.length} selainpakettitiedostoa tarkistettu, avaimia ei löytynyt.`,
);
