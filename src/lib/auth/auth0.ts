import { Auth0Client } from "@auth0/nextjs-auth0/server";

/**
 * Auth0-client (CLAUDE.md kohta 2: passwordless, ei salasanoja).
 *
 * SDK lukee asetukset ympäristömuuttujista: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`,
 * `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET` ja `APP_BASE_URL`. Reitit `/auth/login`,
 * `/auth/logout` ja `/auth/callback` syntyvät middlewaren kautta, joten niille
 * ei kirjoiteta omia route handlereita.
 *
 * `connection: "email"` ohjaa suoraan sähköpostikoodiin ilman Auth0:n
 * valintaruutua. Se on myös se, mikä tekee "ei salasanoja" -linjauksesta
 * näkyvän käyttäjälle: hän ei näe salasanakenttää missään vaiheessa.
 */
export const auth0 = new Auth0Client({
  authorizationParameters: {
    connection: "email",
    ui_locales: "fi",
  },
});
