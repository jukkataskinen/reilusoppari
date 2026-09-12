/**
 * Suosittelu ja krediitit (CLAUDE.md 5.9).
 *
 * ===========================================================================
 * KREDIITTI SYNTYY VASTA KUN SUOSITELTU KÄYTTÄÄ PALVELUA
 *
 * Ei rekisteröitymisestä eikä kutsun avaamisesta, vaan siitä, että suositeltu
 * vuokranantaja lähettää ensimmäisen allekirjoituskierroksensa. Syy on
 * yksinkertainen: rekisteröitymisestä palkitseminen tekee tilien luomisesta
 * kannattavaa, ja silloin krediittejä kerätään tekemällä tilejä eikä
 * suosittelemalla palvelua.
 *
 * MOLEMMAT SAAVAT
 *
 * Sekä suosittelija että suositeltu. Suositellun krediitti tulee hänen
 * SEURAAVAAN vuokrasuhteeseensa, koska ensimmäinen oli jo ilmainen.
 *
 * SUOSITTELUA EI VOI OTTAA TAKAUTUVASTI
 *
 * Yhteys kirjataan siinä hetkessä, kun suositeltu luo tilinsä. Jos sen voisi
 * liittää myöhemmin, kuka tahansa voisi merkitä itsensä olemassa olevien
 * käyttäjien suosittelijaksi.
 * ===========================================================================
 */

import { createHash } from "node:crypto";
import { getServiceClient } from "./supabase";

/**
 * Suosittelutunnus käyttäjälle.
 *
 * Johdetaan käyttäjän id:stä eikä arvota: silloin sitä ei tarvitse
 * tallentaa, eikä linkki vanhene. Tiiviste eikä id sellaisenaan, koska
 * käyttäjän id esiintyy muualla järjestelmässä eikä sitä pidä levittää
 * linkeissä.
 */
export function referralCode(userId: string): string {
  const salt = process.env.REFERRAL_SALT?.trim() ?? "reilusoppari";
  return createHash("sha256").update(`${salt}:${userId}`).digest("hex").slice(0, 12);
}

/** Löytää käyttäjän suosittelutunnuksella. `null`, jos tunnus ei vastaa ketään. */
export async function userByReferralCode(code: string): Promise<string | null> {
  if (!/^[0-9a-f]{12}$/.test(code)) return null;

  /*
    Tunnus on tiiviste, jota ei voi kääntää takaisin — käyttäjät on siis
    käytävä läpi. Se on hyväksyttävää vain siksi, että tämä ajetaan kerran
    tilin luonnissa eikä millään kuumalla polulla.

    Jos käyttäjämäärä kasvaa, tunnus kannattaa tallentaa omaan sarakkeeseensa
    indeksoituna. Sitä ei tehdä nyt, koska sarake, jota ei vielä tarvita, on
    sarake, joka ehtii mennä epäsynkroniin.
  */
  const { data } = await getServiceClient().from("rs_users").select("id");

  for (const row of (data ?? []) as Array<{ id: string }>) {
    if (referralCode(row.id) === code) return row.id;
  }

  return null;
}

/**
 * Kirjaa suosittelun, kun suositeltu luo tilinsä.
 *
 * Hiljainen ei-mitään, jos suosittelija on sama henkilö tai jos suosittelu on
 * jo kirjattu. Itsensä suositteleminen ei ole virhe josta kannattaa
 * ilmoittaa — se on yritys, joka ei toimi.
 */
export async function recordReferral(input: {
  referrerUserId: string;
  referredUserId: string;
  referredEmail: string;
}): Promise<void> {
  if (input.referrerUserId === input.referredUserId) return;

  const supabase = getServiceClient();

  const { data: existing } = await supabase
    .from("rs_referrals")
    .select("id")
    .eq("referred_user_id", input.referredUserId)
    .limit(1)
    .maybeSingle();

  // Yksi suosittelu per suositeltu. Ensimmäinen jää voimaan.
  if (existing) return;

  const { error } = await supabase.from("rs_referrals").insert({
    referrer_user_id: input.referrerUserId,
    referred_user_id: input.referredUserId,
    referred_email: input.referredEmail,
  });

  if (error) {
    // Ei heitetä: suosittelun kirjaaminen ei saa estää tilin luontia.
    console.error("[suosittelu] kirjaus epäonnistui:", error.message);
  }
}

/**
 * Täyttää suosittelun, kun suositeltu lähettää ensimmäisen kierroksensa.
 *
 * Palauttaa suosittelijan id:n, jos krediitit myönnettiin — kutsuja voi
 * lähettää hänelle ilmoituksen. `null`, jos suosittelua ei ollut tai se oli
 * jo täytetty.
 */
export async function completeReferral(referredUserId: string, now: Date): Promise<string | null> {
  const supabase = getServiceClient();
  const timestamp = now.toISOString();

  const { data } = await supabase
    .from("rs_referrals")
    .select("id, referrer_user_id")
    .eq("referred_user_id", referredUserId)
    .is("completed_at", null)
    .limit(1)
    .maybeSingle();

  const referral = data as { id: string; referrer_user_id: string } | null;
  if (!referral) return null;

  /*
    Merkintä ennen krediittejä, ehdolla `completed_at is null`.

    Jos krediitit myönnettäisiin ensin, kaksi rinnakkaista kutsua voisi
    myöntää ne kahdesti. Näin toinen kutsu ei löydä täyttämätöntä riviä
    lainkaan ja lopettaa tähän.
  */
  const { data: claimed } = await supabase
    .from("rs_referrals")
    .update({ completed_at: timestamp, updated_at: timestamp })
    .eq("id", referral.id)
    .is("completed_at", null)
    .select("id");

  if (!claimed || claimed.length === 0) return null;

  await supabase.from("rs_credits").insert([
    { user_id: referral.referrer_user_id, kind: "referral", source_referral_id: referral.id },
    { user_id: referredUserId, kind: "referral", source_referral_id: referral.id },
  ]);

  return referral.referrer_user_id;
}

export interface ReferralSummary {
  code: string;
  /** Montako suosittelua on kirjattu. */
  invited: number;
  /** Montako on täyttynyt eli tuottanut krediitin. */
  completed: number;
  /** Käyttämättömiä krediittejä. */
  availableCredits: number;
}

/** Käyttäjän oma suosittelutilanne. */
export async function referralSummary(userId: string): Promise<ReferralSummary> {
  const supabase = getServiceClient();

  const [{ data: referrals }, { data: credits }] = await Promise.all([
    supabase.from("rs_referrals").select("completed_at").eq("referrer_user_id", userId),
    supabase.from("rs_credits").select("id").eq("user_id", userId).is("used_at", null),
  ]);

  const rows = (referrals ?? []) as Array<{ completed_at: string | null }>;

  return {
    code: referralCode(userId),
    invited: rows.length,
    completed: rows.filter((row) => row.completed_at !== null).length,
    availableCredits: (credits ?? []).length,
  };
}
