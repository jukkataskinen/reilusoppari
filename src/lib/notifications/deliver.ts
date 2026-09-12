/**
 * Ilmoitusten toimitus: push ensin, sähköposti varakanavana (CLAUDE.md 5.5).
 *
 * ===========================================================================
 * KIRJATAAN ENSIN, LÄHETETÄÄN VASTA SITTEN
 *
 * `rs_notifications`-rivi kirjoitetaan ennen lähetystä, ja sen
 * `dedupe_key`-sarakkeella on uniikkirajoite. Jos kaksi cron-ajoa osuu
 * päällekkäin, toinen insertti kaatuu eikä lähetä mitään.
 *
 * Toisin päin tehtynä — lähetä ensin, kirjaa sitten — kaatunut kirjaus
 * tarkoittaisi viestiä, joka lähtee uudelleen huomenna. Vuokralaiselle se
 * näyttäisi siltä, että palvelu jankuttaa.
 *
 * PUSH EI KORVAA TIETOA SOVELLUKSESSA
 *
 * Ilmoitus on herätys, ei sisältö. Kaikki, mitä ilmoituksessa lukee, näkyy
 * myös sovelluksessa — jos ilmoitus ei mene perille tai se pyyhkäistään pois,
 * mitään ei ole menetetty.
 *
 * SÄHKÖPOSTI ON VARAKANAVA, EI RINNAKKAINEN
 *
 * Sähköposti lähtee vain, jos push ei mennyt perille yhteenkään laitteeseen.
 * Molemmat yhdessä tarkoittaisivat kahta ilmoitusta samasta asiasta, ja Jukka
 * linjasi tästä suoraan: heräte puhelimeen on parempi kuin sähköposti.
 * ===========================================================================
 */

import webpush from "web-push";
import { getServiceClient } from "../db/supabase";
import { sendEmail } from "./email";

export interface DeliverableNotification {
  userId: string;
  kind: string;
  dedupeKey: string | null;
  title: string;
  body: string;
  path: string;
}

let vapidReady: boolean | null = null;

/**
 * VAPID-avaimet ympäristöstä.
 *
 * Ilman avaimia pushia ei lähetetä lainkaan, mutta ilmoitus kirjataan silti:
 * sovelluksessa se näkyy joka tapauksessa, ja kirjaus kertoo mitä olisi
 * pitänyt lähettää.
 */
function ensureVapid(): boolean {
  if (vapidReady !== null) return vapidReady;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:tuki@reilusoppari.fi";

  if (!publicKey || !privateKey) {
    vapidReady = false;
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidReady = true;
  return true;
}

/** Testien käyttöön: pakottaa avainten tarkistuksen uudelleen. */
export function resetVapidForTests(): void {
  vapidReady = null;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Lähettää yhden ilmoituksen.
 *
 * Palauttaa `false`, jos viesti oli jo lähetetty (`dedupe_key` osui). Se ei
 * ole virhe vaan koko mekanismin tarkoitus.
 */
export async function deliver(notification: DeliverableNotification): Promise<boolean> {
  const supabase = getServiceClient();

  const { error: insertError } = await supabase.from("rs_notifications").insert({
    user_id: notification.userId,
    kind: notification.kind,
    dedupe_key: notification.dedupeKey,
    channel: "push",
    payload: {
      title: notification.title,
      body: notification.body,
      path: notification.path,
    },
  });

  if (insertError) {
    // 23505 = uniikkirajoitteen rikkomus: viesti on jo lähetetty.
    if (insertError.code === "23505") return false;

    console.error("[ilmoitukset] kirjaus epäonnistui:", insertError.message);
    throw new Error("Ilmoituksen kirjaus epäonnistui.");
  }

  const { data: subscriptions } = ensureVapid()
    ? await supabase
        .from("rs_push_subscriptions")
        .select("id, endpoint, keys")
        .eq("user_id", notification.userId)
    : { data: null };

  const rows = (subscriptions ?? []) as unknown as SubscriptionRow[];

  if (rows.length === 0) {
    await fallbackToEmail(notification);
    return true;
  }

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    path: notification.path,
  });

  const now = new Date().toISOString();
  let delivered = 0;

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: row.keys }, payload);
        delivered += 1;
        await supabase
          .from("rs_push_subscriptions")
          .update({ last_success_at: now })
          .eq("id", row.id);
      } catch (err) {
        /*
          410 Gone ja 404 tarkoittavat, ettei tilaus ole enää voimassa:
          selain on poistanut sen tai sovellus on poistettu laitteelta.
          Sellainen tilaus poistetaan, jottei sitä yritetä loputtomiin.
        */
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await supabase.from("rs_push_subscriptions").delete().eq("id", row.id);
          return;
        }
        // Yksi rikkinäinen laite ei saa estää muiden ilmoituksia.
        console.error("[ilmoitukset] push epäonnistui:", status ?? "tuntematon virhe");
      }
    }),
  );

  // Yksikään laite ei ottanut vastaan: tilaukset olivat vanhentuneita tai
  // lähetys epäonnistui. Silloin viesti lähtee sähköpostina.
  if (delivered === 0) {
    await fallbackToEmail(notification);
    return true;
  }

  if (notification.dedupeKey) {
    await supabase
      .from("rs_notifications")
      .update({ sent_at: now })
      .eq("dedupe_key", notification.dedupeKey);
  }

  return true;
}

/**
 * Lähettää ilmoituksen sähköpostina ja merkitsee kanavan.
 *
 * Osoite luetaan `rs_users`-taulusta: se on sama, jolla käyttäjä kirjautuu,
 * eikä sitä tarvitse kysyä erikseen. Jos osoitetta ei ole, ei tehdä mitään —
 * ilmoitus on silti kirjattu ja näkyy sovelluksessa.
 */
async function fallbackToEmail(notification: DeliverableNotification): Promise<void> {
  const supabase = getServiceClient();

  const { data } = await supabase
    .from("rs_users")
    .select("email")
    .eq("id", notification.userId)
    .maybeSingle();

  const email = (data as { email: string } | null)?.email;
  if (!email) return;

  const sent = await sendEmail({
    to: email,
    title: notification.title,
    body: notification.body,
    path: notification.path,
  });

  if (!sent || !notification.dedupeKey) return;

  await supabase
    .from("rs_notifications")
    .update({ channel: "email", sent_at: new Date().toISOString() })
    .eq("dedupe_key", notification.dedupeKey);
}
