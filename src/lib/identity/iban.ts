/**
 * Tilinumeron tarkistus ja muotoilu.
 *
 * ===========================================================================
 * TARKISTUSLUKU KANNATTAA LASKEA TÄSSÄKIN
 *
 * Väärä tilinumero sopimuksessa on ikävämpi kuin väärä henkilötunnus: sen
 * mukaan maksetaan. Vuokralainen maksaa vuokran numeroon, joka on
 * sopimuksessa, ja jos numero on väärin näppäilty, maksu joko ei mene läpi
 * tai menee jonnekin muualle.
 *
 * IBANin tarkistusluku (ISO 13616, mod 97) ottaa kiinni käytännössä kaikki
 * yksittäiset näppäilyvirheet ja numeroparien vaihtumiset. Se ei kerro, onko
 * tili olemassa tai kenen se on — sitä ei voi tarkistaa mistään ilman
 * pankkiyhteyttä.
 * ===========================================================================
 */

/** Välit ja väliviivat pois, isoiksi kirjaimiksi. */
export function normalizeIban(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Kelpaako IBAN?
 *
 * Suomalaisen IBANin pituus on 18 merkkiä, mutta tämä hyväksyy myös muut
 * maat: vuokranantaja voi asua ulkomailla, ja tili voi olla siellä.
 */
export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;

  // Neljä ensimmäistä merkkiä loppuun, kirjaimet numeroiksi (A=10 … Z=35).
  const siirretty = iban.slice(4) + iban.slice(0, 4);
  const numeroina = siirretty.replace(/[A-Z]/g, (kirjain) =>
    String(kirjain.charCodeAt(0) - 55),
  );

  // Luku on liian iso `Number`ille, joten jakojäännös lasketaan palasittain.
  let jaannos = 0;
  for (const merkki of numeroina) {
    jaannos = (jaannos * 10 + Number(merkki)) % 97;
  }

  return jaannos === 1;
}

/** Neljän merkin ryhmiin: `FI21 1234 5600 0007 85`. Näin sen voi lukea ääneen. */
export function formatIban(value: string): string {
  const iban = normalizeIban(value);
  return iban.replace(/(.{4})(?=.)/g, "$1 ");
}
