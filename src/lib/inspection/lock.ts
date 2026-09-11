/**
 * Milloin katselmuksen saa lukita (CLAUDE.md 5.3).
 *
 * ===========================================================================
 * LUKITUS ON SE HETKI, JOLLOIN KUVAT MUUTTUVAT TODISTEEKSI
 *
 * Lukituksen jälkeen katselmukseen ei voi lisätä kuvia. Siksi sääntö ei koske
 * vain sitä, kuka saa painaa nappia, vaan myös sitä milloin:
 *
 *   Vuokranantaja ei voi lukita katselmusta ennen kuin vuokralaisella on
 *   ollut aito mahdollisuus lisätä omansa.
 *
 * Ilman tätä vuokranantaja voisi kuvata asunnon itse, lukita sen ennen kuin
 * vuokralainen ehtii paikalle, ja katselmus kertoisi vain toisen osapuolen
 * näkemyksen. Sellainen pöytäkirja on riidassa arvottomampi kuin ei mitään:
 * se näyttää yhteiseltä olematta sitä.
 *
 * "Aito mahdollisuus" on jompikumpi näistä:
 *   1. Vuokralainen on itse merkinnyt olevansa valmis, tai
 *   2. hänen ensimmäisestä käynnistään katselmuksessa on kulunut 24 tuntia.
 *
 * Toinen ehto on olemassa, jottei vuokrasuhde jumiudu siihen, ettei
 * vuokralainen paina nappia. Se ei ole porsaanreikä: 24 tuntia on aikaa, joka
 * riittää kuvaamiseen, ja laskuri alkaa vasta kun hän on nähnyt näkymän.
 *
 * TÄMÄ ON PUHDAS FUNKTIO
 *
 * Sääntö on tässä ilman tietokantaa, jotta se on luettavissa ja testattavissa
 * kokonaan. Kutsuja hakee tilan ja kysyy vastauksen.
 * ===========================================================================
 */

export const TENANT_GRACE_HOURS = 24;

export interface LockState {
  /** Onko lukitsija vuokranantaja? */
  isLandlord: boolean;
  /** Katselmuksen tila. */
  status: "open" | "locked" | "signed";
  /** Onko katselmuksessa yhtään kuvaa? */
  photoCount: number;
  /** Milloin vuokralainen avasi katselmuksen ensimmäisen kerran. */
  tenantFirstSeenAt: string | null;
  /** Milloin vuokralainen merkitsi olevansa valmis. */
  tenantReadyAt: string | null;
  /** Onko vuokralainen ylipäätään liittynyt vuokrasuhteeseen? */
  tenantJoined: boolean;
  now: Date;
}

export type LockDecision =
  | { allowed: true }
  | { allowed: false; reason: LockBlockReason; message: string };

export type LockBlockReason =
  | "not_landlord"
  | "already_locked"
  | "no_photos"
  | "tenant_not_joined"
  | "tenant_has_not_had_time";

/** Saako katselmuksen lukita nyt? */
export function canLockInspection(state: LockState): LockDecision {
  if (!state.isLandlord) {
    return {
      allowed: false,
      reason: "not_landlord",
      message: "Vain vuokranantaja voi lukita katselmuksen.",
    };
  }

  if (state.status !== "open") {
    return {
      allowed: false,
      reason: "already_locked",
      message: "Katselmus on jo lukittu.",
    };
  }

  if (state.photoCount === 0) {
    // Tyhjä pöytäkirja ei todista mitään, mutta näyttää asiakirjalta.
    return {
      allowed: false,
      reason: "no_photos",
      message: "Katselmuksessa ei ole yhtään kuvaa.",
    };
  }

  if (!state.tenantJoined) {
    return {
      allowed: false,
      reason: "tenant_not_joined",
      message: "Vuokralainen ei ole vielä liittynyt. Odota, että hän kirjautuu kutsulinkistä.",
    };
  }

  if (state.tenantReadyAt) return { allowed: true };

  if (!state.tenantFirstSeenAt) {
    return {
      allowed: false,
      reason: "tenant_has_not_had_time",
      message: "Vuokralainen ei ole vielä avannut katselmusta.",
    };
  }

  const elapsed = state.now.getTime() - new Date(state.tenantFirstSeenAt).getTime();
  if (elapsed < TENANT_GRACE_HOURS * 60 * 60 * 1000) {
    return {
      allowed: false,
      reason: "tenant_has_not_had_time",
      message: `Vuokralaisella on ${TENANT_GRACE_HOURS} tuntia aikaa lisätä omat kuvansa. Voit lukita sen jälkeen, tai heti kun hän merkitsee olevansa valmis.`,
    };
  }

  return { allowed: true };
}

/**
 * Milloin lukitus on aikaisintaan mahdollinen? `null` = heti tai ei koskaan
 * pelkän ajan perusteella. Käyttöliittymä näyttää tämän odotusajan.
 */
export function lockAvailableAt(state: LockState): Date | null {
  if (state.tenantReadyAt || !state.tenantFirstSeenAt) return null;

  return new Date(
    new Date(state.tenantFirstSeenAt).getTime() + TENANT_GRACE_HOURS * 60 * 60 * 1000,
  );
}
