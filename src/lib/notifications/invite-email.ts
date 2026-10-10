/**
 * Kutsuviesti vuokralaiselle (CLAUDE.md 5.1: "kutsu lähtee vuokralaiselle").
 *
 * ===========================================================================
 * LINKKI KULKEE VAIN VIESTISSÄ
 *
 * Viestissä on kutsulinkki, joka on salaisuus (256 bittiä). Se ei päädy
 * lokiin eikä osoiteriville: lähetys palauttaa vain tiedon siitä, lähtikö
 * viesti. Vastaanottajaa ei lokiteta.
 *
 * ILMAN AVAINTA EI LÄHETETÄ
 *
 * Kuten muutkin viestit (`email.ts`): `RESEND_API_KEY` puuttuu → viesti ei
 * lähde, ja käyttöliittymä kertoo sen ja näyttää linkin, jonka
 * vuokranantaja voi lähettää itse. Paikallisesti ja testeissä mitään ei
 * siis lähde.
 * ===========================================================================
 */

import { INVITE_TTL_DAYS } from "../tenancy/invite";
import { sendEmail } from "./email";

export interface InviteEmail {
  to: string;
  /** Kutsulinkki kokonaisena. */
  url: string;
  /** Asunnon osoite, jos tiedossa: vastaanottaja tunnistaa siitä, mistä on kyse. */
  address: string | null;
}

export function inviteEmailContent(invite: InviteEmail): {
  title: string;
  body: string;
  footer: string;
} {
  const where = invite.address ? ` asuntoon ${invite.address}` : "";
  return {
    title: "Kutsu vuokrasuhteeseen Reilusopparissa",
    body:
      `Vuokranantajasi kutsuu sinut vuokrasuhteeseen${where}. ` +
      "Avaa kutsu alla olevasta napista ja kirjaudu tällä sähköpostiosoitteella. " +
      `Kutsu on voimassa ${INVITE_TTL_DAYS} päivää. Liittyminen on sinulle maksutonta.`,
    footer:
      "Sait tämän viestin, koska vuokranantaja kirjoitti osoitteesi kutsuun. Jos et tunne asiaa, voit jättää viestin huomiotta.",
  };
}

/** Lähettää kutsun. `false`, jos viesti ei lähtenyt (avain puuttuu tai virhe). */
export async function sendInviteEmail(invite: InviteEmail): Promise<boolean> {
  const content = inviteEmailContent(invite);
  return sendEmail({
    to: invite.to,
    title: content.title,
    body: content.body,
    path: invite.url,
    buttonLabel: "Avaa kutsu",
    footer: content.footer,
  });
}
