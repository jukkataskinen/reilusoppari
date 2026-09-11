/**
 * Supabase-clientit (CLAUDE.md kohta 2).
 *
 * ===========================================================================
 * KAKSI CLIENTIÄ, ERI TARKOITUS — älä sekoita niitä
 *
 * `getServiceClient()` käyttää `service_role`-avainta ja **ohittaa RLS:n**.
 * Se on ainoa, jolla sovellus oikeasti lukee ja kirjoittaa, koska kirjautuminen
 * on Auth0:ssa eikä Supabase Authissa – tietokanta ei siis tiedä kuka käyttäjä
 * on. Siitä seuraa sääntö, joka ei jousta:
 *
 *   **Jokainen kysely on rajattava osapuoleen eksplisiittisesti koodissa.**
 *   `.eq("tenancy_id", …)` ei riitä yksin; on tarkistettava että kutsuja on
 *   kyseisen vuokrasuhteen osapuoli. Käytä `src/lib/db/access.ts`:n apureita
 *   äläkä kirjoita omaa rajausta kyselykohtaisesti.
 *
 * `getAnonClient()` on olemassa vain sitä varten, että RLS voidaan todentaa
 * testeissä: sillä ei näe mitään, ja juuri se on tarkoitus. Sovelluskoodi ei
 * käytä sitä.
 *
 * Avaimet luetaan vain palvelimella. Kumpaakaan ei saa päätyä selaimeen, joten
 * tässä tiedostossa ei ole `NEXT_PUBLIC_`-alkuisia muuttujia eikä saa olla.
 * ===========================================================================
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedService: SupabaseClient | null = null;
let cachedAnon: SupabaseClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    // Viesti kertoo puuttuvan muuttujan nimen mutta ei koskaan arvoa.
    throw new Error(`Ympäristömuuttuja ${name} puuttuu. Ks. .env.example.`);
  }
  return value;
}

/**
 * Palvelinpuolen client. Ohittaa RLS:n – osapuolirajaus tehdään koodissa.
 *
 * `persistSession: false`: tämä on palvelinprosessi, jossa ei ole istuntoa
 * jota säilyttää. Ilman tätä Supabase-kirjasto yrittää kirjoittaa
 * localStorageen, jota palvelimella ei ole.
 */
export function getServiceClient(): SupabaseClient {
  if (cachedService) return cachedService;

  cachedService = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "reilusoppari-server" } },
  });

  return cachedService;
}

/**
 * Anon-client. Käytössä VAIN testeissä, jotka todentavat ettei RLS päästä
 * läpi mitään. Jos huomaat kutsuvasi tätä sovelluskoodista, kyseessä on
 * virhe – anon-avaimella ei ole pääsyä mihinkään tauluun.
 */
export function getAnonClient(): SupabaseClient {
  if (cachedAnon) return cachedAnon;

  cachedAnon = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cachedAnon;
}

/** Onko Supabase konfiguroitu? Testit ohitetaan siististi, jos ei ole. */
export function hasSupabaseCredentials(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      process.env.SUPABASE_ANON_KEY?.trim(),
  );
}

/** Testien siivousta varten: pakottaa clientit luotavaksi uudelleen. */
export function resetClientsForTests(): void {
  cachedService = null;
  cachedAnon = null;
}
