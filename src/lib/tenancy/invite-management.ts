/**
 * Kutsun korjaus, uudelleenlähetys ja poisto sekä vuokrasuhteen poisto
 * (Jukan havainto 10.10.2026: väärä sähköposti kutsussa, eikä mitään voinut
 * korjata).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa: vain vuokrasuhteen vuokranantaja, ja vain osapuoleen, joka ei
 *    ole vielä liittynyt. Liittynyt vuokralainen omistaa tilinsä ja
 *    sähköpostinsa; vuokranantaja ei saa vaihtaa sitä eikä poistaa häntä.
 * 2. Henkilötieto: kutsuttavan sähköposti. Ei lokiin eikä lokin
 *    lisätietoihin (`rs_audit_log.details`).
 * 3. Syöte: zod (`inviteEmailSchema`).
 * 4. Toisto: sähköpostia lähettävät toiminnot kuluttavat kutsurajaa
 *    (`KUTSUSAHKOPOSTIRAJA`), jottei palvelua voi käyttää postituslistana.
 * 5. Säännöt ovat tässä puhtaina funktioina ja testattu kokonaan. Datakerros
 *    (`db/tenancies.ts`) hakee faktat ja kysyy päätöksen täältä.
 * 6. Epäonnistuminen: syy kerrotaan arkikielellä. Ulkopuoliselle sama
 *    vastaus kuin olemattomasta vuokrasuhteesta.
 * ===========================================================================
 */

import { z } from "zod";
import type { TenancyStatus } from "../db/tenancies";

export const inviteEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Sähköpostiosoite puuttuu")
    .email("Tarkista sähköpostiosoite")
    .max(320)
    .toLowerCase(),
});

/**
 * Kutsusähköpostien raja: 10 tunnissa per vuokranantaja.
 *
 * Oikea käyttö on kutsu tai kaksi ja ehkä korjaus perään. Raja estää
 * käyttämästä palvelua sähköpostien lähettämiseen vieraille — viesti lähtee
 * Reilusopparin nimissä, joten sen maine on panoksena.
 */
export const KUTSUSAHKOPOSTIRAJA = {
  endpoint: "kutsu.sahkoposti",
  limit: 10,
  windowMinutes: 60,
} as const;

export const KUTSUSAHKOPOSTIRAJA_VIESTI =
  "Kutsuja on lähetetty paljon lyhyessä ajassa. Odota hetki ja yritä sitten uudelleen.";

/**
 * Tilat, joissa kutsua voi vielä korjata tai poistaa.
 *
 * Kun allekirjoitus on alkanut, allekirjoittajat on jo lukittu
 * allekirjoituskierrokseen. Vuokralaisen vaihtaminen kesken kierroksen
 * tekisi sopimuksesta ja kierroksesta keskenään ristiriitaiset.
 */
const EDITABLE_STATUSES: TenancyStatus[] = ["draft", "inspection"];

export type PendingPartyAction = "resend" | "change_email" | "remove";

export type PendingPartyBlocker = "not_found" | "joined" | "status";

export interface PendingPartyFacts {
  userId: string;
  tenancy: { landlordUserId: string; status: TenancyStatus } | null;
  party: { role: "landlord" | "tenant"; userId: string | null; joinedAt: string | null } | null;
}

/**
 * Saako käyttäjä tehdä toiminnon kutsulle? `null` = saa.
 *
 * Ulkopuoliselle ja vuokralaiselle vastataan `not_found`: kutsun olemassaolo
 * ei saa paljastua sille, jolla ei ole siihen oikeutta.
 */
export function pendingPartyBlocker(
  facts: PendingPartyFacts,
  action: PendingPartyAction,
): PendingPartyBlocker | null {
  const { tenancy, party } = facts;
  if (!tenancy || tenancy.landlordUserId !== facts.userId) return "not_found";
  if (!party || party.role !== "tenant") return "not_found";

  // Vuokranantaja itse vuokralaisen paikalla (Jukan havainto 10.10.2026:
  // kutsu omaan osoitteeseen ja liittyminen omalla tilillä). Paikka on
  // käytännössä tyhjä, joten sen saa korjata — mutta vain ennen
  // allekirjoitusta, koska sen jälkeen allekirjoittajat on lukittu.
  if (isSelfJoined(tenancy.landlordUserId, party.userId)) {
    return EDITABLE_STATUSES.includes(tenancy.status) ? null : "status";
  }

  // Liittynyt osapuoli omistaa tilinsä. Uusi kutsu syrjäyttäisi hänet, ja
  // poisto veisi häneltä pääsyn yhteiseen vuokrasuhteeseen.
  if (party.userId || party.joinedAt) return "joined";

  // Uudelleenlähetys samaan osoitteeseen on aina sallittu: se ei muuta
  // sitä, kuka allekirjoittaa, vain sen miten hän pääsee sisään.
  if (action !== "resend" && !EDITABLE_STATUSES.includes(tenancy.status)) return "status";

  return null;
}

/**
 * Onko vuokralaisen paikalle liittynyt vuokranantaja itse?
 *
 * Tämä on virhetila, ei oikea liittyminen: vuokranantaja ei voi olla oman
 * vuokrasuhteensa vuokralainen. Katselmuksen vuokralaisen vaiheet (avaus ja
 * valmiiksi merkintä, `inspection/lock.ts`) jäisivät tekemättä, koska
 * oikeaa vuokralaista ei ole.
 */
export function isSelfJoined(landlordUserId: string, partyUserId: string | null): boolean {
  return partyUserId !== null && partyUserId === landlordUserId;
}

/** Vertailtava muoto: sama osoite eri kirjainkoolla on sama osoite. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Onko kutsuttavan osoite käyttäjän oma osoite? */
export function isOwnEmail(inviteEmail: string, ownEmail: string): boolean {
  const own = normalizeEmail(ownEmail);
  return own !== "" && normalizeEmail(inviteEmail) === own;
}

export const OWN_EMAIL_MESSAGE = "Tämä on oma sähköpostiosoitteesi. Anna vuokralaisen osoite.";

export type AcceptInviteBlocker = "own_tenancy" | "wrong_account";

/**
 * Saako kirjautunut käyttäjä lunastaa kutsun? `null` = saa.
 *
 * Oma vuokrasuhde tarkistetaan ensin: vuokranantaja, joka avaa kutsun
 * omalla tilillään, ei saa liittyä — riippumatta siitä, onko kutsu
 * osoitettu hänen omaan osoitteeseensa vahingossa vai ei.
 */
export function acceptInviteBlocker(facts: {
  userId: string;
  userEmail: string;
  inviteEmail: string;
  landlordUserId: string;
}): AcceptInviteBlocker | null {
  if (facts.userId === facts.landlordUserId) return "own_tenancy";
  if (normalizeEmail(facts.inviteEmail) !== normalizeEmail(facts.userEmail)) {
    return "wrong_account";
  }
  return null;
}

export const PENDING_PARTY_MESSAGES: Record<
  PendingPartyBlocker | "duplicate" | "own_email" | "failed",
  string
> = {
  not_found: "Kutsua ei löytynyt. Päivitä sivu ja yritä uudelleen.",
  joined:
    "Vuokralainen on jo liittynyt. Hän hallitsee omaa sähköpostiaan, eikä häntä voi poistaa täältä.",
  status:
    "Sopimus on jo lähetetty allekirjoitettavaksi, joten vuokralaista ei voi enää vaihtaa tai poistaa.",
  duplicate: "Toisella vuokralaisella on jo tämä sähköpostiosoite.",
  own_email: OWN_EMAIL_MESSAGE,
  failed: "Toiminto ei onnistunut. Yritä hetken kuluttua uudelleen.",
};

/* -------------------------------------------------------------------------
   Vuokrasuhteen poisto
   ------------------------------------------------------------------------- */

export interface TenancyDeletionFacts {
  isLandlord: boolean;
  status: TenancyStatus;
  joinedTenants: number;
  /** Sopimus tai katselmus on allekirjoitettu tai lähetetty allekirjoitettavaksi. */
  signingStarted: boolean;
  /** Maksettu, tai ilmainen vuokrasuhde on käytetty tähän. */
  paid: boolean;
  certificates: number;
  /** Vuokrasuhteeseen kirjatut kulut. Ne kuuluvat verolaskelmaan. */
  expenses: number;
}

export type TenancyDeletionBlocker =
  | "not_landlord"
  | "joined"
  | "signing"
  | "paid"
  | "certificates"
  | "expenses";

/**
 * Voiko vuokrasuhteen poistaa? `null` = voi.
 *
 * ===========================================================================
 * POISTO ON SALLITTU VAIN LUONNOKSELLE
 *
 * Säilytyssääntö (CLAUDE.md kohta 2, `retention/rules.ts`) koskee
 * vuokrasuhdetta, joka on ollut olemassa kahden ihmisen välillä. Luonnos,
 * johon kukaan ei ole liittynyt ja jota ei ole allekirjoitettu eikä maksettu,
 * ei ole sellainen: siinä on vain vuokranantajan omia kirjoituksia ja
 * kutsuttavan nimi ja osoite. Sen säilyttäminen säilyttäisi vain toisen
 * ihmisen sähköpostin ilman syytä.
 *
 * Heti kun toinen osapuoli on liittynyt, jotain on allekirjoitettu tai
 * maksettu, vuokrasuhde on yhteinen ja sitä koskevat säilytysajat. Silloin
 * poistoa ei ole, vaan vuokrasuhde päätetään.
 * ===========================================================================
 */
export function tenancyDeletionBlocker(facts: TenancyDeletionFacts): TenancyDeletionBlocker | null {
  if (!facts.isLandlord) return "not_landlord";
  if (facts.certificates > 0) return "certificates";
  if (facts.signingStarted || !EDITABLE_STATUSES.includes(facts.status)) return "signing";
  if (facts.paid) return "paid";
  if (facts.joinedTenants > 0) return "joined";
  // Kuitin kuva on vuokrasuhteen rivi ja lähtisi poiston mukana. Kulu itse
  // jäisi, mutta ilman kuittia — siksi poisto pysähtyy tähän.
  if (facts.expenses > 0) return "expenses";
  return null;
}

export const TENANCY_DELETION_MESSAGES: Record<TenancyDeletionBlocker, string> = {
  not_landlord: "Vain vuokranantaja voi poistaa vuokrasuhteen.",
  joined:
    "Vuokralainen on jo liittynyt vuokrasuhteeseen, joten se on teidän yhteinen eikä sitä voi poistaa. Voit poistaa kutsun vain vuokralaiselta, joka ei ole vielä liittynyt.",
  signing:
    "Vuokrasuhteella on allekirjoitettu tai allekirjoitettavaksi lähetetty sopimus, joten sitä ei voi poistaa. Voit päättää vuokrasuhteen.",
  paid: "Vuokrasuhde on jo maksettu tai siihen on käytetty ilmainen vuokrasuhde, joten sitä ei voi poistaa. Ota yhteyttä tukeen, jos tämä on virhe.",
  expenses:
    "Vuokrasuhteeseen on kirjattu kuluja, jotka kuuluvat verolaskelmaan, joten sitä ei voi poistaa.",
  certificates:
    "Vuokrasuhteesta on annettu todistuksia, joten sitä ei voi poistaa. Todistukset säilytetään pysyvästi.",
};
