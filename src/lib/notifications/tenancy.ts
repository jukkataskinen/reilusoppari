/**
 * Ilmoitus vuokrasuhteen toiselle osapuolelle.
 *
 * ===========================================================================
 * TEKIJÄ EI SAA ILMOITUSTA OMASTA TEKEMISESTÄÄN
 *
 * Ilmoitus menee kaikille vuokrasuhteen osapuolille paitsi sille, joka
 * teon teki. Se kuulostaa itsestään selvältä, mutta ilman rajausta
 * vuokranantaja saisi ilmoituksen jokaisesta omasta kirjauksestaan — ja
 * oppisi hyvin nopeasti sivuuttamaan ilmoitukset.
 *
 * Kahden vuokralaisen tapauksessa molemmat saavat oman ilmoituksensa.
 * ===========================================================================
 */

import { getServiceClient } from "../db/supabase";
import { deliver } from "./deliver";

export interface TenancyNotification {
  kind: string;
  dedupeKey: string;
  title: string;
  body: string;
  path: string;
}

export async function notifyOtherParty(
  actorUserId: string,
  tenancyId: string,
  notification: TenancyNotification,
): Promise<void> {
  const { data } = await getServiceClient()
    .from("rs_tenancy_parties")
    .select("user_id")
    .eq("tenancy_id", tenancyId);

  const recipients = ((data ?? []) as Array<{ user_id: string | null }>)
    .map((row) => row.user_id)
    .filter((id): id is string => Boolean(id) && id !== actorUserId);

  for (const userId of recipients) {
    try {
      await deliver({
        userId,
        kind: notification.kind,
        // Vastaanottaja tunnisteeseen: muuten toinen vuokralainen jäisi
        // ilman, koska ensimmäinen insertti varaisi tunnisteen.
        dedupeKey: `${notification.dedupeKey}:${userId}`,
        title: notification.title,
        body: notification.body,
        path: notification.path,
      });
    } catch (err) {
      /*
        Ilmoitus ei saa kaataa toimintoa.

        Merkintä on jo tallessa, ja ilmoitus on herätys eikä sisältö. Jos
        lähetys epäonnistuu, toinen osapuoli näkee asian sovelluksessa
        seuraavalla kerralla.
      */
      console.error(
        "[ilmoitukset] osapuolen ilmoitus epäonnistui:",
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/**
 * Ilmoitus yhdelle käyttäjälle.
 *
 * Erillinen `notifyOtherParty`:sta, koska todistuskeskustelun osapuolet eivät
 * ole saman vuokrasuhteen osapuolia: kysyjä on ulkopuolinen vuokranantaja,
 * jolla ei ole mitään tekemistä sen vuokrasuhteen kanssa, jota todistus
 * koskee (CLAUDE.md 5.10).
 */
export async function notifyUser(
  userId: string,
  notification: TenancyNotification,
): Promise<void> {
  try {
    await deliver({
      userId,
      kind: notification.kind,
      dedupeKey: `${notification.dedupeKey}:${userId}`,
      title: notification.title,
      body: notification.body,
      path: notification.path,
    });
  } catch (err) {
    // Ilmoitus on herätys eikä sisältö: viesti on jo tallessa portaalissa.
    console.error(
      "[ilmoitukset] ilmoitus epäonnistui:",
      err instanceof Error ? err.message : err,
    );
  }
}
