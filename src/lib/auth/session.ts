/**
 * Kirjautunut käyttäjä ja `rs_users`-rivin luonti (CLAUDE.md kohta 2).
 *
 * Auth0 tietää kuka on kirjautunut; tietokanta ei. Tämä moduuli on se silta:
 * Auth0:n `sub` → `rs_users`-rivi. Rivi luodaan ensimmäisellä kirjautumisella,
 * myös vuokralaiselle joka tulee kutsulinkin kautta.
 *
 * ===========================================================================
 * MITÄ TÄSSÄ EI OLE
 *
 * Henkilötunnusta ei tallenneta koskaan (CLAUDE.md kohta 6). Nimi ja
 * syntymäaika eivät tule Auth0:sta vaan eSinetin tunnistuksesta
 * allekirjoituksen yhteydessä, ja ne kirjataan vasta silloin
 * (`identity_verified_at`). Auth0:sta otetaan vain sähköposti ja `sub`.
 *
 * Auth0:n profiilinimi jätetään tarkoituksella käyttämättä: passwordless-
 * kirjautumisessa se on sama kuin sähköposti, ja jos se tallennettaisiin
 * `name`-kenttään, käyttöliittymä näyttäisi sähköpostiosoitteen paikassa
 * jossa lukijan pitäisi nähdä ihmisen nimi.
 * ===========================================================================
 */

import { auth0 } from "./auth0";
import { REFERRAL_COOKIE } from "../billing/referral-cookie";
import { getServiceClient } from "@/lib/db/supabase";

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  identityVerifiedAt: string | null;
  freeTenancyUsed: boolean;
}

/** Heitetään kun sivu vaatii kirjautumisen. Reitti ohjaa `/auth/login`:iin. */
export class NotSignedInError extends Error {
  constructor() {
    super("Kirjautuminen vaaditaan.");
    this.name = "NotSignedInError";
  }
}

/**
 * Nykyinen käyttäjä, tai `null` jos ei kirjautunut.
 *
 * Luo `rs_users`-rivin, jos sitä ei vielä ole. Upsert `auth0_sub`-avaimella on
 * idempotentti: kaksi rinnakkaista pyyntöä ensimmäisellä kirjautumisella ei
 * tuota kahta riviä, koska sarakkeella on unique-rajoite.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth0.getSession();
  const sub = session?.user?.sub;
  const email = typeof session?.user?.email === "string" ? session.user.email : null;

  if (!sub || !email) return null;

  const supabase = getServiceClient();
  const COLUMNS = "id, email, name, identity_verified_at, free_tenancy_used";

  /*
    Luku ensin, kirjoitus vain tarvittaessa.

    Aiemmin tämä oli `upsert`, joka kirjoittaa rivin JOKAISELLA sivulatauksella
    — myös silloin kun mikään ei muutu. Kierroksia tietokantaan on yhtä monta,
    mutta kirjoitus on kalliimpi kuin luku, ja se tehtiin jokaisesta
    pyynnöstä. Rivi luodaan vain ensimmäisellä kirjautumisella.
  */
  const { data: existing, error: readError } = await supabase
    .from("rs_users")
    .select(COLUMNS)
    .eq("auth0_sub", sub)
    .maybeSingle();

  if (readError) {
    // Ei paljasteta tietokannan virhettä käyttäjälle (esinetti 0.1 kohta 6).
    console.error("[auth] rs_users-rivin haku epäonnistui:", readError.message);
    throw new Error("Käyttäjätietojen haku epäonnistui.");
  }

  /*
    `upsert` eikä `insert`: kaksi rinnakkaista ensimmäistä pyyntöä voi molempi
    todeta rivin puuttuvan. `auth0_sub`-uniikkirajoite ratkaisee kilpajuoksun,
    ja `onConflict` tekee siitä idempotentin sen sijaan että toinen pyyntö
    kaatuisi.
  */
  const { data, error } = existing
    ? { data: existing, error: null }
    : await supabase
        .from("rs_users")
        .upsert({ auth0_sub: sub, email }, { onConflict: "auth0_sub", ignoreDuplicates: false })
        .select(COLUMNS)
        .single();

  if (error || !data) {
    console.error("[auth] rs_users-rivin luonti epäonnistui:", error?.message);
    throw new Error("Käyttäjätietojen haku epäonnistui.");
  }

  /*
    Suosittelu kirjataan VAIN uudelle riville.

    Yhteys on olemassa siitä hetkestä, kun tili syntyy. Jos sen voisi liittää
    myöhemmin, kuka tahansa voisi merkitä itsensä olemassa olevien käyttäjien
    suosittelijaksi käymällä suosittelulinkissä (CLAUDE.md 5.9).
  */
  if (!existing) await linkReferral(data.id, data.email);

  return {
    id: data.id,
    email: data.email,
    name: data.name,
    identityVerifiedAt: data.identity_verified_at,
    freeTenancyUsed: data.free_tenancy_used,
  };
}

/** Vaatii kirjautumisen. Käytä sivuilla, jotka eivät ole julkisia. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new NotSignedInError();
  return user;
}

/**
 * Liittää suosittelun uuteen tiliin, jos evästeessä on kelvollinen tunnus.
 *
 * Ei heitä koskaan: suosittelun kirjaaminen on etu, eikä sen epäonnistuminen
 * saa estää kirjautumista. Evästettä ei poisteta tässä — sen elinikä hoitaa
 * sen, ja poisto vaatisi vastauksen, jota tällä funktiolla ei ole.
 */
async function linkReferral(userId: string, email: string): Promise<void> {
  try {
    const { cookies } = await import("next/headers");
    const code = (await cookies()).get(REFERRAL_COOKIE)?.value;
    if (!code) return;

    const { recordReferral, userByReferralCode } = await import("../db/referrals");

    const referrer = await userByReferralCode(code);
    if (!referrer) return;

    await recordReferral({
      referrerUserId: referrer,
      referredUserId: userId,
      referredEmail: email,
    });
  } catch (err) {
    console.error("[auth] suosittelun liittäminen epäonnistui:", err instanceof Error ? err.message : err);
  }
}
