/**
 * Allekirjoituskierroksen valmistumisen simulointi.
 *
 * ===========================================================================
 * MIKSI TÄMÄ ON OLEMASSA
 *
 * Vuokrasuhde lähtee käyntiin `round.completed`-webhookista: se merkitsee
 * asiakirjat allekirjoitetuiksi, vie tilan `active`:ksi, luo vuokrakaudet ja
 * kirjaa allekirjoittajien vahvan tunnistautumisen.
 *
 * eSinetin mock EI lähetä webhookeja. Se luo kierroksen ja kertoo tilan
 * kysyttäessä, mutta kukaan ei soita takaisin — joten mockilla
 * allekirjoitetusta vuokrasuhteesta ei tapahdu mitään sen jälkeen.
 *
 * Käytännössä se tarkoittaa, ettei koko kaarta ole voinut ajaa läpi ennen
 * kuin oikea eSinetti on pystyssä. Tämä skripti poistaa sen esteen:
 * se rakentaa saman tapahtuman, jonka eSinetti lähettäisi, ja antaa sen
 * samalle käsittelijälle, jota webhook-reitti kutsuu.
 *
 * TÄMÄ EI OLE OIKOTIE TUOTANTOON
 *
 * Skripti kutsuu käsittelijää suoraan eikä mene HTTP-reitin läpi, joten
 * `ESINETTI_WEBHOOK_SECRET`-tarkistus pysyy koskemattomana. Tuotantoon ei
 * synny reittiä, jolla vuokrasuhteen saisi käyntiin ilman allekirjoitusta —
 * tämä ajetaan omalta koneelta omilla tunnuksilla.
 *
 * ALLEKIRJOITTAJAT OVAT TEKAISTUJA
 *
 * Nimet ja syntymäajat tulevat vuokrasuhteen osapuoliriveiltä, koska juuri
 * ne eSinetti palauttaisi tunnistuksesta. Jos osapuolen nimi puuttuu,
 * tunnistautumista ei kirjata — sama kuin oikeassa kierroksessa.
 *
 * Aja:
 *   npm run testi:allekirjoitus -- --listaa
 *   npm run testi:allekirjoitus -- <vuokrasuhteen-id>
 *   npm run testi:allekirjoitus -- <vuokrasuhteen-id> --loppu
 * ===========================================================================
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

/** Lukee `.env.local`:n, jos sellainen on. Arvoja ei tulosteta. */
function lataaYmparisto(): void {
  try {
    for (const rivi of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const kohta = rivi.indexOf("=");
      if (kohta === -1 || rivi.trimStart().startsWith("#")) continue;

      const avain = rivi.slice(0, kohta).trim();
      const arvo = rivi.slice(kohta + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[avain]) process.env[avain] = arvo;
    }
  } catch {
    // Tiedostoa ei ole: ympäristömuuttujat voivat silti olla asetettuina.
  }
}

interface OsapuoliRivi {
  user_id: string | null;
  role: string;
  party_name: string | null;
  contact_email: string | null;
}

/** Vuokrasuhteet, joissa on allekirjoitettavaa. */
async function listaa(supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase
    .from("rs_tenancies")
    .select("id, status, start_date")
    .order("created_at", { ascending: false });

  const rivit = (data ?? []) as Array<{ id: string; status: string; start_date: string | null }>;

  if (rivit.length === 0) {
    console.log("Yhtään vuokrasuhdetta ei löytynyt.");
    return;
  }

  console.log(`${rivit.length} vuokrasuhdetta:`);
  console.log("");

  for (const rivi of rivit) {
    const { data: inspections } = await supabase
      .from("rs_inspections")
      .select("kind, status, signed_at")
      .eq("tenancy_id", rivi.id);

    const katselmukset = (inspections ?? []) as Array<{
      kind: string;
      status: string;
      signed_at: string | null;
    }>;

    console.log(`  ${rivi.id}`);
    console.log(`    tila: ${rivi.status} · alkaa ${rivi.start_date ?? "?"}`);

    for (const katselmus of katselmukset) {
      const nimi = katselmus.kind === "initial" ? "alkukatselmus" : "loppukatselmus";
      const allekirjoitettu = katselmus.signed_at ? "allekirjoitettu" : katselmus.status;
      console.log(`    ${nimi}: ${allekirjoitettu}`);
    }

    console.log("");
  }

  console.log("Simuloi allekirjoitus: npm run testi:allekirjoitus -- <id>");
}

/**
 * Rakentaa tapahtuman, jonka eSinetti lähettäisi kierroksen valmistuttua.
 *
 * `documents` jätetään tyhjäksi: sinetöityjä tiedostoja ei ole olemassa,
 * eikä niitä kannata keksiä. Käsittelijä on kirjoitettu kestämään se —
 * allekirjoituksen leima ja vuokrakausien luonti tehdään asiakirjoista
 * riippumatta, ja juuri sen varmistamiseksi on oma testinsä
 * (`signing.test.ts`).
 */
async function rakennaTapahtuma(
  supabase: SupabaseClient,
  tenancyId: string,
  loppu: boolean,
): Promise<{ tapahtuma: Record<string, unknown>; osapuolia: number } | null> {
  const { data: inspection } = await supabase
    .from("rs_inspections")
    .select("esinetti_round_id, status")
    .eq("tenancy_id", tenancyId)
    .eq("kind", loppu ? "final" : "initial")
    .maybeSingle();

  const katselmus = inspection as { esinetti_round_id: string | null; status: string } | null;

  if (!katselmus) {
    console.error(
      `Vuokrasuhteella ei ole ${loppu ? "loppu" : "alku"}katselmusta. ` +
        "Avaa se sovelluksessa ensin.",
    );
    return null;
  }

  if (katselmus.status === "open") {
    console.error(
      "Katselmus on vielä auki. Lukitse se sovelluksessa ja lähetä " +
        "allekirjoitettavaksi ennen tätä.",
    );
    return null;
  }

  const { data: parties } = await supabase
    .from("rs_tenancy_parties")
    .select("user_id, role, party_name, contact_email")
    .eq("tenancy_id", tenancyId);

  const osapuolet = (parties ?? []) as OsapuoliRivi[];
  const hetki = new Date().toISOString();

  return {
    osapuolia: osapuolet.length,
    tapahtuma: {
      id: `evt_testi_${randomUUID()}`,
      event: "round.completed",
      createdAt: hetki,
      // Kierroksen tunniste: se, joka lähetyksessä tallennettiin.
      roundId: katselmus.esinetti_round_id ?? `round_testi_${randomUUID()}`,
      externalRef: `tenancy:${tenancyId}:${loppu ? "loppu" : "alku"}`,
      status: "completed",
      signers: osapuolet.map((osapuoli, index) => ({
        id: `signer_${index + 1}`,
        // Nimi osapuoliriviltä: juuri sen eSinetti palauttaisi tunnistuksesta.
        name: osapuoli.party_name ?? "",
        email: osapuoli.contact_email ?? "",
        roleLabel: osapuoli.role === "landlord" ? "Vuokranantaja" : "Vuokralainen",
        status: "signed",
        openedAt: hetki,
        identifiedAt: hetki,
        signedAt: hetki,
        declinedAt: null,
      })),
      documents: [],
    },
  };
}

/** Näyttää, mitä vuokrasuhteelle tapahtui. */
async function kerroTila(supabase: SupabaseClient, tenancyId: string): Promise<void> {
  const [{ data: tenancy }, { count: kausia }] = await Promise.all([
    supabase.from("rs_tenancies").select("status").eq("id", tenancyId).maybeSingle(),
    supabase
      .from("rs_rent_periods")
      .select("id", { count: "exact", head: true })
      .eq("tenancy_id", tenancyId),
  ]);

  const rivi = tenancy as { status: string } | null;

  console.log("");
  console.log(`  vuokrasuhteen tila: ${rivi?.status ?? "?"}`);
  console.log(`  vuokrakausia: ${kausia ?? 0}`);
}

/* -------------------------------------------------------------------------
   Ajo
   ------------------------------------------------------------------------- */

lataaYmparisto();

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  throw new Error("Supabase-tunnuksia ei löytynyt (.env.local tai ympäristömuuttujat).");
}

const argumentit = process.argv.slice(2);
const loppu = argumentit.includes("--loppu");
const tenancyId = argumentit.find((a) => /^[0-9a-f-]{36}$/i.test(a)) ?? null;

const supabase = createClient(url, key, { auth: { persistSession: false } });

if (argumentit.includes("--listaa") || !tenancyId) {
  if (!tenancyId && !argumentit.includes("--listaa")) {
    console.log("Anna vuokrasuhteen tunniste. Vuokrasuhteet:");
    console.log("");
  }
  await listaa(supabase);
} else {
  const rakennettu = await rakennaTapahtuma(supabase, tenancyId, loppu);

  if (rakennettu) {
    const { handleRoundCompleted, handleFinalRoundCompleted } = await import(
      "../src/lib/tenancy/round-completed"
    );

    console.log(
      `Simuloidaan ${loppu ? "loppu" : "alku"}katselmuksen allekirjoitusta ` +
        `(${rakennettu.osapuolia} allekirjoittajaa).`,
    );

    const kasittelija = loppu ? handleFinalRoundCompleted : handleRoundCompleted;

    // Sama käsittelijä, jota webhook-reitti kutsuu. Tapahtuman muoto on
    // tarkistettu `parseWebhookPayload`illa tuotannossa; tässä se rakennetaan
    // valmiiksi oikean muotoisena.
    const tulos = await kasittelija(
      rakennettu.tapahtuma as never,
      tenancyId,
    );

    if (tulos.handled) {
      console.log(
        tulos.alreadyDone
          ? "Käsitelty: tämä kierros oli jo merkitty allekirjoitetuksi."
          : "Käsitelty.",
      );
      await kerroTila(supabase, tenancyId);
    } else {
      console.error(`Ei käsitelty: ${tulos.reason}`);
    }
  }
}
