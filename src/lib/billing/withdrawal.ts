/**
 * Kuluttajan peruutusoikeus (CLAUDE.md kohta 2, kuluttajansuojalaki 6 luku).
 *
 * ===========================================================================
 * MITÄ LAKI SANOO JA MITÄ SIITÄ SEURAA TÄHÄN KOODIIN
 *
 * Etämyynnissä kuluttajalla on 14 päivän peruutusoikeus. Palvelun kohdalla
 * se raukeaa, kun palvelu on kuluttajan **nimenomaisesta pyynnöstä** aloitettu
 * ja hän on saanut tiedon siitä, että oikeus tällöin raukeaa.
 *
 * Reilusopparissa "palvelun aloittaminen" on allekirjoituskierroksen
 * lähettäminen eSinettiin: siinä hetkessä vuokralaiselle lähtee kutsu,
 * tunnistautuminen maksaa, eikä tapahtumaa voi perua. Kaikki sitä ennen —
 * sopimuksen täyttäminen, kuvaaminen, esikatselu — on peruttavissa.
 *
 * TIETO ON ANNETTAVA ENNEN MAKSUA, EI SEN JÄLKEEN
 *
 * `CONSENT_TEXT` näytetään maksun yhteydessä, ja käyttäjä hyväksyy sen
 * nimenomaisesti. Jos teksti näytettäisiin vasta kuitissa, oikeus ei
 * raukeaisi ja palvelu olisi velvollinen palauttamaan rahat vielä
 * allekirjoituksen jälkeen.
 *
 * MIKSI TÄMÄ ON OMA TIEDOSTONSA
 *
 * Tämä on sääntö, joka on helppo rikkoa vahingossa siirtämällä
 * allekirjoituskierroksen lähetys maksun eteen. Sääntö on siksi yhdessä
 * paikassa ja testattu, eikä hajallaan ehtolauseissa.
 * ===========================================================================
 */

/** Peruutusaika päivinä. Kuluttajansuojalaki 6:14. */
export const WITHDRAWAL_DAYS = 14;

/**
 * Suostumusteksti, joka on hyväksyttävä ennen maksua.
 *
 * Jukan tarkistettava käyttöehtojen yhteydessä (CLAUDE.md kohta 9.7). Sisältö
 * on juridisesti välttämätön, mutta sanamuoto saa muuttua.
 */
export const CONSENT_TEXT =
  "Hyväksyn, että palvelu aloitetaan heti kun lähetän sopimuksen " +
  "allekirjoitettavaksi, ja että menetän silloin 14 päivän peruutusoikeuteni " +
  "tämän vuokrasuhteen osalta. Siihen asti saan rahani takaisin pyytämällä.";

export type WithdrawalState =
  | { available: true; deadline: string; reason: string }
  | { available: false; reason: string };

export interface WithdrawalContext {
  /** Maksun hetki ISO-muodossa. */
  paidAt: string | null;
  /** Milloin allekirjoituskierros lähetettiin. `null`, jos ei vielä. */
  signingStartedAt: string | null;
  now: Date;
}

/** Päivämäärä N päivää eteenpäin, ISO. */
function plusDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

/**
 * Onko peruutusoikeus vielä voimassa?
 *
 * Kaksi asiaa lopettaa sen: määräajan umpeutuminen ja palvelun aloittaminen.
 * Jälkimmäinen on se, joka käytännössä osuu ensin.
 */
export function withdrawalState(context: WithdrawalContext): WithdrawalState {
  if (!context.paidAt) {
    return { available: false, reason: "Tästä vuokrasuhteesta ei ole maksettu mitään." };
  }

  if (context.signingStartedAt) {
    return {
      available: false,
      reason:
        "Sopimus on lähetetty allekirjoitettavaksi, joten palvelu on aloitettu " +
        "pyynnöstäsi ja peruutusoikeus on rauennut.",
    };
  }

  const deadline = plusDays(context.paidAt, WITHDRAWAL_DAYS);

  if (context.now.toISOString() > deadline) {
    return {
      available: false,
      reason: `Peruutusaika (${WITHDRAWAL_DAYS} päivää) on kulunut umpeen.`,
    };
  }

  return {
    available: true,
    deadline,
    reason:
      "Voit peruuttaa ja saada rahasi takaisin niin kauan kuin sopimusta ei ole " +
      "lähetetty allekirjoitettavaksi.",
  };
}

/**
 * Saako allekirjoituskierroksen lähettää?
 *
 * Vaatii nimenomaisen suostumuksen silloin, kun vuokrasuhteesta on maksettu
 * ja peruutusoikeus on vielä voimassa. Ilmaisessa vuokrasuhteessa
 * peruutusoikeutta ei ole menetettävänä, joten suostumusta ei kysytä — turha
 * valintaruutu opettaa klikkaamaan läpi lukematta.
 */
export function needsWithdrawalConsent(context: WithdrawalContext): boolean {
  return withdrawalState(context).available;
}
