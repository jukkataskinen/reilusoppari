/**
 * Yhteydenottolupa ja keskustelun säännöt (CLAUDE.md 5.10).
 *
 * ===========================================================================
 * LUVAN ANTAA TODISTUKSEN ANTAJA, EI SEN OMISTAJA
 *
 * Vuokranantaja kirjoittaa todistuksen vuokralaisesta. Lupa siihen, että
 * häneen saa ottaa yhteyttä tästä vuokrasuhteesta, on hänen omansa — ei
 * vuokralaisen, joka todistusta jakaa. Tämä on helppo sekoittaa, koska
 * todistus on vuokralaisen omaisuutta.
 *
 * Vuokralainen näkee luvan ennen kuin jakaa todistuksen: hänen on tiedettävä,
 * mitä hän jakaa.
 *
 * KESKUSTELU ON PORTAALISSA, EI SÄHKÖPOSTISSA
 *
 * Kummankaan yhteystietoja ei näytetä toiselle. Näkyvissä on vain nimi, joka
 * on vahvasta tunnistautumisesta todennettu.
 *
 * VAHVA TUNNISTAUTUMINEN ON EHTO
 *
 * Keskustelu koskee kolmannen osapuolen — vuokralaisen — henkilötietoja.
 * Silloin on perusteltua tietää, kuka tiedon saa. Se on myös ainoa tehokas
 * suoja sitä vastaan, että kuka tahansa esiintyisi vuokranantajana ja
 * kalastelisi tietoja toisesta ihmisestä.
 *
 * VUOKRALAINEN NÄKEE KESKUSTELUN
 *
 * Keskustelu käydään hänestä, joten se näkyy hänelle kokonaisuudessaan.
 * Vaihtoehto olisi ensimmäinen kohta koko tuotteessa, jossa toisesta
 * kerätään tietoa hänen tietämättään.
 * ===========================================================================
 */

/** Montako keskustelua yhdestä todistuksesta saa avata oletuksena. */
export const DEFAULT_MAX_MESSAGES = 3;

/** Yhden viestin pituus. Sama kuin arviossa ja vastineessa. */
export const MESSAGE_MAX_LENGTH = 1000;

export interface ContactPermission {
  /** Onko lupa annettu ja voimassa? */
  allowed: boolean;
  /** Milloin lupa peruttiin, jos peruttiin. */
  revokedAt: string | null;
  /** Montako keskustelua saa avata. */
  maxMessages: number;
  /** Montako on jo avattu. */
  openedCount: number;
}

export type ContactBlockReason =
  | "no_permission"
  | "revoked"
  | "limit_reached"
  | "not_identified"
  | "own_certificate"
  | "already_open";

export type ContactDecision =
  | { allowed: true }
  | { allowed: false; reason: ContactBlockReason; message: string };

export interface AskerState {
  /** Onko kysyjä tunnistautunut vahvasti? */
  identityVerified: boolean;
  /** Onko kysyjä todistuksen oma osapuoli? */
  isOwnParty: boolean;
  /** Onko kysyjällä jo avoin keskustelu tästä todistuksesta? */
  hasOpenConversation: boolean;
}

/**
 * Saako tämä kysyjä avata keskustelun?
 *
 * Puhdas funktio. Järjestys on valittu niin, että kysyjä saa ensin tietää
 * puuttuuko lupa kokonaan — ei niin, että hän tunnistautuu vahvasti ja saa
 * vasta sitten kuulla, ettei lupaa ole.
 */
export function canOpenConversation(
  permission: ContactPermission,
  asker: AskerState,
): ContactDecision {
  if (!permission.allowed && !permission.revokedAt) {
    return {
      allowed: false,
      reason: "no_permission",
      message: "Todistuksen antaja ei ole sallinut yhteydenottoa tästä vuokrasuhteesta.",
    };
  }

  if (permission.revokedAt) {
    return {
      allowed: false,
      reason: "revoked",
      message: "Yhteydenottolupa on peruttu.",
    };
  }

  if (asker.isOwnParty) {
    /*
      Oman vuokrasuhteen osapuoli ei tarvitse tätä: hän tuntee toisen
      osapuolen jo, ja heillä on yhteinen näkymä vuokrasuhteeseen.
    */
    return {
      allowed: false,
      reason: "own_certificate",
      message: "Tämä on oman vuokrasuhteesi todistus.",
    };
  }

  if (permission.openedCount >= permission.maxMessages) {
    return {
      allowed: false,
      reason: "limit_reached",
      message: "Tästä todistuksesta on jo avattu niin monta keskustelua kuin lupa sallii.",
    };
  }

  if (asker.hasOpenConversation) {
    return {
      allowed: false,
      reason: "already_open",
      message: "Sinulla on jo avoin keskustelu tästä todistuksesta.",
    };
  }

  if (!asker.identityVerified) {
    return {
      allowed: false,
      reason: "not_identified",
      message:
        "Tunnistaudu pankkitunnuksilla ennen keskustelun avaamista. Keskustelu koskee toisen " +
        "ihmisen tietoja, ja siksi on tiedettävä kuka kysyy.",
    };
  }

  return { allowed: true };
}

/**
 * Saako keskusteluun kirjoittaa?
 *
 * Suljettuun keskusteluun ei kirjoiteta: luvan peruminen sulkee avoimet
 * keskustelut uusilta viesteiltä, mutta jo lähetetyt viestit jäävät
 * näkyviin — myös vuokralaiselle. Poistettu keskustelu olisi tieto, jota
 * hänellä ei enää olisi.
 */
export function canSendMessage(conversation: {
  closedAt: string | null;
  isParticipant: boolean;
}): ContactDecision {
  if (!conversation.isParticipant) {
    return {
      allowed: false,
      reason: "no_permission",
      message: "Tämä keskustelu ei ole sinun.",
    };
  }

  if (conversation.closedAt) {
    return {
      allowed: false,
      reason: "revoked",
      message: "Keskustelu on suljettu. Uusia viestejä ei voi enää lähettää.",
    };
  }

  return { allowed: true };
}

/** Viestin siivous. Tyhjä palauttaa `null`. */
export function cleanMessage(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, MESSAGE_MAX_LENGTH);
}
