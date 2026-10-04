/**
 * Sentryyn lähtevän virheen siistiminen (DECISIONS.md 2026-10-04).
 *
 * ===========================================================================
 * MITÄ SENTRYYN SAA MENNÄ
 *
 * Vain se, mitä vian korjaamiseen tarvitaan: virheen tyyppi, pinon rivit ja
 * sivun polku. Ei käyttäjää, ei evästeitä (Auth0-istunto), ei otsikoita, ei
 * pyynnön runkoa (lomakkeissa on nimiä, osoitteita ja henkilötunnus), ei
 * hakuparametreja eikä #-osaa.
 *
 * Julkisten linkkien polussa on itse avain: kutsulinkki `/kutsu/[token]`,
 * todistuksen jakolinkki `/todistus/[token]` ja suosittelukoodi
 * `/suosittelu/[koodi]`. Sentryyn päätynyt linkki olisi toimiva pääsy
 * toisen vuokrasuhteeseen tai todistukseen, joten avain korvataan aina.
 *
 * Virheviestin tekstistä peitetään sähköpostiosoitteet ja henkilötunnukset,
 * koska tietokannan virheviestissä on joskus syöte sellaisenaan.
 * ===========================================================================
 */

import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

const REQUEST_FIELDS_TO_DROP = ["cookies", "headers", "data", "query_string", "env"] as const;

/** Reitit, joiden seuraava polun osa on salainen avain. */
const TOKEN_ROUTES = ["kutsu", "todistus", "suosittelu"];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Suomalainen henkilötunnus: ppkkvv, välimerkki (+, -, A–F, U–Y), 3 numeroa, tarkiste.
const PERSON_ID = /\b\d{6}[-+A-FU-Y]\d{3}[0-9A-Y]\b/g;
// Pitkä satunnainen merkkijono missä tahansa polussa (esim. API-reitin avain).
// UUID:t ovat rivien tunnisteita eivätkä anna pääsyä mihinkään, joten ne jäävät.
const TOKEN_LIKE = /^[A-Za-z0-9_-]{32,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function scrubText<T>(text: T): T {
  if (typeof text !== "string") return text;
  return text.replace(EMAIL, "[email]").replace(PERSON_ID, "[hetu]") as T;
}

/**
 * Osoite ilman hakuparametreja ja #-osaa, avaimet korvattuina `[token]`:lla.
 * Toimii sekä täydelle osoitteelle että pelkälle polulle.
 */
export function scrubUrl<T>(url: T): T {
  if (typeof url !== "string" || url === "") return url;
  const withoutTail = url.split(/[?#]/)[0];
  const origin = withoutTail.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i)?.[0] ?? "";
  const segments = withoutTail.slice(origin.length).split("/");
  const scrubbed = segments.map((segment, i) => {
    if (i > 0 && TOKEN_ROUTES.includes(segments[i - 1]) && segment !== "") return "[token]";
    if (TOKEN_LIKE.test(segment) && !UUID.test(segment)) return "[token]";
    return segment;
  });
  return scrubText(origin + scrubbed.join("/")) as T;
}

function scrubBreadcrumbs(crumbs: Breadcrumb[] | undefined): Breadcrumb[] | undefined {
  if (!Array.isArray(crumbs)) return crumbs;
  return (
    crumbs
      // Konsolin rivit voivat sisältää mitä tahansa, joten niitä ei lähetetä.
      .filter((crumb) => crumb && crumb.category !== "console")
      .map((crumb) => {
        const data = crumb.data ? { ...crumb.data } : crumb.data;
        if (data) {
          for (const key of ["url", "from", "to"]) {
            if (typeof data[key] === "string") data[key] = scrubUrl(data[key]);
          }
        }
        return { ...crumb, message: scrubText(crumb.message), data };
      })
  );
}

/**
 * Sentryn `beforeSend`. Palauttaa siistityn kopion; alkuperäiseen ei kosketa,
 * jotta testi voi verrata.
 */
export function scrubEvent<E extends ErrorEvent>(event: E): E {
  const e = { ...event };

  delete e.user;
  delete e.server_name;

  if (e.request) {
    const request = { ...e.request };
    for (const field of REQUEST_FIELDS_TO_DROP) delete request[field];
    if (request.url) request.url = scrubUrl(request.url);
    e.request = request;
  }

  if (e.transaction) e.transaction = scrubUrl(e.transaction);
  if (e.message) e.message = scrubText(e.message);
  if (e.tags && typeof e.tags.url === "string") e.tags = { ...e.tags, url: scrubUrl(e.tags.url) };

  if (e.exception?.values) {
    e.exception = {
      ...e.exception,
      values: e.exception.values.map((value) => ({ ...value, value: scrubText(value.value) })),
    };
  }

  if (e.breadcrumbs) e.breadcrumbs = scrubBreadcrumbs(e.breadcrumbs);

  return e;
}
