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

/**
 * Palvelimen salaisuudet. Näitä ei lueta selainkomponentissa.
 *
 * Lista on tarkoituksella nimenomainen eikä hahmontunnistusta: uusi salaisuus
 * lisätään tänne käsin, ja se on hyvä hetki miettiä, kuuluuko se selaimeen.
 * Julkiset avaimet (VAPIDin julkinen, Supabasen anon, Stripen publishable)
 * EIVÄT ole tässä, koska ne ovat tarkoituksella selaimessa.
 */
const SALAISUUDET =
  /(^|[^A-Z_])(ANTHROPIC_API_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|SUPABASE_SERVICE_ROLE_KEY|ESINETTI_API_KEY|ESINETTI_WEBHOOK_SECRET|PERSON_DATA_KEY|RESEND_API_KEY|VAPID_PRIVATE_KEY)/;

/**
 * Oikean avaimen näköinen merkkijono.
 *
 * `sk-ant-` on Anthropicin, `sk_live_`/`sk_test_` Stripen, `whsec_` Stripen
 * webhook-salaisuus, ja service_role-JWT alkaa `eyJ`:llä. Nämä eivät osu
 * tavalliseen koodiin.
 *
 * Sanarajat kirjoitetaan ilman kenoviivaa (`[^A-Z_]`), koska pakomerkki
 * rikkoutui kerran tiedostoa muokatessa: `\b` muuttui oikeaksi
 * askelpalautinmerkiksi, ja vahti näytti toimivalta hälyttämättä koskaan.
 */
const KOVAKOODATTU_AVAIN =
  /(sk-ant-[A-Za-z0-9_-]{10,}|sk_(live|test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{10,})/;

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
    if (/NEXT_PUBLIC_[A-Z_]*(PERSON|SECRET|PRIVATE|SERVICE_ROLE|API_KEY|ANTHROPIC|PASSWORD)/.test(rivi)) {
      virheet.push(`${polku}:${index + 1}  salainen avain näyttää päätyvän selaimeen.`);
    }
  });

  /*
    Palvelimen salaisuus ei saa olla selainkomponentissa.

    Tämä on se virhe, joka Jukan toisessa järjestelmässä kävi toteen: kutsu
    tehtiin selaimesta avaimella, jonka nimi alkoi Viten etuliitteellä, ja
    avain oli kenen tahansa luettavissa sivun lähteestä. Lasku oli
    kolminumeroinen.

    Next.js ei upota muuttujaa selaimeen ilman `NEXT_PUBLIC_`-etuliitettä —
    arvo olisi `undefined`. Mutta jos joku myöhemmin "korjaa" sen lisäämällä
    etuliitteen, koodi alkaa toimia ja avain vuotaa samalla. Siksi kielto on
    jo siinä, että salaisuutta edes luetaan selainkomponentissa.
  */
  const onSelainkomponentti = rivit
    .slice(0, 5)
    .some((rivi) => /^\s*["']use client["']/.test(rivi));

  if (onSelainkomponentti) {
    rivit.forEach((rivi, index) => {
      if (SALAISUUDET.test(rivi)) {
        virheet.push(
          `${polku}:${index + 1}  palvelimen salaisuus selainkomponentissa.`,
        );
      }
    });
  }

  /*
    Avain ei saa olla kirjoitettuna koodiin.

    Tunnistetaan tunnetuista etuliitteistä. Koodiin liitetty avain päätyy
    git-historiaan, josta sitä ei saa pois ilman historian kirjoittamista
    uusiksi — ja siihen mennessä se on jo kaikkien kloonien mukana.
  */
  rivit.forEach((rivi, index) => {
    if (KOVAKOODATTU_AVAIN.test(rivi)) {
      virheet.push(
        `${polku}:${index + 1}  koodissa näyttää olevan oikea avain. MITÄTÖI se heti.`,
      );
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
