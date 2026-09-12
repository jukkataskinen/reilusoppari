/**
 * Vuokratodistuksen vaiheet ja määräajat (CLAUDE.md 5.8).
 *
 * ===========================================================================
 * TODISTUS SYNTYY AINA
 *
 * Vastaanottaja ei voi estää todistuksen syntymistä, eikä antaja voi estää
 * sitä jättämällä arvion antamatta. Ilman arviota todistus kertoo tilastot —
 * kuinka kauan vuokrasuhde kesti, miten vuokra maksettiin, palautuiko vakuus.
 * Ne ovat tosiasioita, eivät mielipiteitä.
 *
 * ARVIO ON KAKSIARVOINEN
 *
 * `recommend` tai ei arviota. Kielteistä vaihtoehtoa ei ole (Jukan päätös
 * 2026-09-10). Eikä puuttuva arvio näy todistuksessa mitenkään — muuten
 * kaksiarvoisuudesta tulisi kiertoteitse kolmiportainen asteikko, jossa
 * "ei suositusta" olisi tosiasiallinen moite.
 *
 * KAKSI MÄÄRÄAIKAA
 *
 *   1. Arviolle on aikaa 7 päivää allekirjoituksesta. Sen jälkeen todistus
 *      voidaan sinetöidä ilman arviota.
 *   2. Vastineelle on aikaa 7 päivää arvion antamisesta. Sen jälkeen todistus
 *      voidaan sinetöidä ilman vastinetta.
 *
 * Määräajat ovat olemassa, jotta todistus valmistuu. Ilman niitä toinen
 * osapuoli voisi jättää todistuksen roikkumaan loputtomiin yksinkertaisesti
 * olemalla tekemättä mitään — ja juuri silloin todistusta eniten tarvitaan.
 * ===========================================================================
 */

export type CertificateFor = "tenant" | "landlord";
export type Rating = "recommend" | null;

export const RATING_WINDOW_DAYS = 7;
export const REPLY_WINDOW_DAYS = 7;

export interface CertificateState {
  /** Loppukatselmuksen allekirjoitushetki. `null` = ei vielä allekirjoitettu. */
  signedAt: string | null;
  /** Milloin arvio annettiin. `null` = ei annettu. */
  commentAt: string | null;
  /** Onko arvio suositus? */
  rating: Rating;
  /** Milloin vastine annettiin. */
  replyAt: string | null;
  sealedAt: string | null;
  now: Date;
}

export type CertificateStage =
  | "not_ready"
  | "awaiting_rating"
  | "awaiting_reply"
  | "sealable"
  | "sealed";

function daysSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 86_400_000;
}

/**
 * Missä vaiheessa todistus on?
 *
 * `awaiting_rating` tarkoittaa, että arviota vielä odotetaan — mutta myös
 * sitä, että se voidaan jättää antamatta. Kumpikin on sallittua.
 */
export function certificateStage(state: CertificateState): CertificateStage {
  if (state.sealedAt) return "sealed";
  if (!state.signedAt) return "not_ready";

  // Vastine annettu: mitään ei enää odoteta.
  if (state.replyAt) return "sealable";

  if (state.commentAt) {
    return daysSince(state.commentAt, state.now) >= REPLY_WINDOW_DAYS
      ? "sealable"
      : "awaiting_reply";
  }

  // Arviota ei ole annettu. Todistus syntyy silti, kun määräaika umpeutuu.
  return daysSince(state.signedAt, state.now) >= RATING_WINDOW_DAYS
    ? "sealable"
    : "awaiting_rating";
}

/** Voiko arvion antaa tai muuttaa nyt? */
export function canGiveRating(state: CertificateState): boolean {
  if (state.sealedAt || !state.signedAt) return false;

  /*
    Arviota voi muuttaa niin kauan kuin vastinetta ei ole annettu.

    Sen jälkeen ei: vastine on kirjoitettu siihen arvioon, joka silloin oli,
    ja arvion muuttaminen jälkikäteen tekisi vastineesta käsittämättömän.
  */
  return state.replyAt === null;
}

/** Voiko vastineen antaa nyt? */
export function canReply(state: CertificateState): boolean {
  if (state.sealedAt || !state.commentAt || state.replyAt) return false;
  return daysSince(state.commentAt, state.now) < REPLY_WINDOW_DAYS;
}

/** Mihin asti vastineen voi antaa. `null`, jos arviota ei ole annettu. */
export function replyDeadline(commentAt: string | null): Date | null {
  if (!commentAt) return null;
  return new Date(new Date(commentAt).getTime() + REPLY_WINDOW_DAYS * 86_400_000);
}

/** Mihin asti arvion voi antaa ennen kuin todistus sinetöidään ilman sitä. */
export function ratingDeadline(signedAt: string | null): Date | null {
  if (!signedAt) return null;
  return new Date(new Date(signedAt).getTime() + RATING_WINDOW_DAYS * 86_400_000);
}

/**
 * Kuka arvioi kenet.
 *
 * Vuokranantaja arvioi vuokralaisen, ja arvio päätyy vuokralaisen
 * todistukseen. Todistus siis kuuluu sille, josta se kertoo — ei sille, joka
 * sen kirjoitti.
 */
export function certificateSubject(author: CertificateFor): CertificateFor {
  return author === "landlord" ? "tenant" : "landlord";
}
