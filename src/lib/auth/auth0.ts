import { Auth0Client } from "@auth0/nextjs-auth0/server";

/**
 * Auth0-client (CLAUDE.md kohta 2: passwordless, ei salasanoja).
 *
 * SDK lukee asetukset ympäristömuuttujista: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`,
 * `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET` ja `APP_BASE_URL`. Reitit `/auth/login`,
 * `/auth/logout` ja `/auth/callback` syntyvät middlewaren kautta, joten niille
 * ei kirjoiteta omia route handlereita.
 */

/**
 * Kirjautumisen parametrit.
 *
 * ===========================================================================
 * NÄMÄ KAKSI RIVIÄ OVAT KOKO PASSWORDLESS-KIRJAUTUMISEN EHTO
 *
 * `connection: "email"` ohjaa suoraan sähköpostikoodiin ilman Auth0:n
 * valintaruutua. Se on myös se, mikä tekee "ei salasanoja" -linjauksesta
 * näkyvän käyttäjälle: hän ei näe salasanakenttää missään vaiheessa.
 *
 * Auth0 **pudottaa tämän parametrin hiljaa**, jos tenantin Authentication
 * Profile ei ole "Identifier First" — ja silloin käyttäjälle näytetään
 * salasanalomake, vaikka salasanoja ei ole olemassa. Se ei näy mistään
 * lokista eikä kaada mitään. Tämä maksoi kerran tunteja (DECISIONS.md).
 *
 * Tästä seuraa kaksi asiaa: nämä parametrit ovat omassa vakiossaan, jotta
 * niiden poisto näkyy testissä (`tests/unit/auth0-config.test.ts`) — ja
 * tenantin asetusta ei voi testata täältä käsin lainkaan, joten se on
 * BLOCKERS.md:ssä muistutuksena siirron varalta.
 * ===========================================================================
 */
export const AUTHORIZATION_PARAMETERS = {
  connection: "email",
  ui_locales: "fi",
} as const;

export const auth0 = new Auth0Client({
  authorizationParameters: { ...AUTHORIZATION_PARAMETERS },
});
