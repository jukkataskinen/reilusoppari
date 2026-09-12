/**
 * Suosittelutunnuksen evästeen nimi.
 *
 * Omassa moduulissaan, koska sitä tarvitaan kahdessa paikassa: reitillä joka
 * asettaa evästeen (`app/suosittelu/[koodi]`) ja kirjautumisessa joka lukee
 * sen (`lib/auth/session.ts`). Vakio reittitiedostossa tarkoittaisi, että
 * kirjautuminen importtaa reitin — ja sitä myöten koko sen riippuvuuspuun.
 */
export const REFERRAL_COOKIE = "rs_suosittelija";

/** Eväste elää sen verran, että kirjautuminen ehditään tehdä. */
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
