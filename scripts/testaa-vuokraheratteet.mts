/**
 * Vuokraherätteiden kokeilu ilman kuukausien odottamista.
 *
 * ===========================================================================
 * AIKAA SIIRRETÄÄN, EI DATAA
 *
 * Muistutusketju on sidottu eräpäivään: ensimmäinen tarkistus kolme päivää
 * sen jälkeen, toinen kymmenen päivän kohdalla. Oikeasti odottaminen veisi
 * kuukausia.
 *
 * Houkutteleva oikotie olisi siirtää vuokrakausien eräpäiviä menneisyyteen.
 * Sitä EI tehdä: se muuttaisi oikeaa dataa, ja siirretty eräpäivä jäisi
 * väärin vuokratodistukseen ja verolaskelmaan.
 *
 * `dispatchDueReminders` ottaa `now`-parametrin, joten koko ketjun voi ajaa
 * niin kuin olisi jokin toinen päivä. Mitään ei muuteta — vain kysytään,
 * mitä sinä päivänä tapahtuisi.
 *
 * KUIVAHARJOITUS ON OLETUS
 *
 * Ilman `--laheta`-lippua skripti kertoo mitä lähtisi muttei lähetä mitään.
 * Ilmoitukset menevät oikeille ihmisille oikeisiin puhelimiin, eikä sitä
 * pidä tapahtua vahingossa.
 *
 * TOISTON ESTO ON VOIMASSA MYÖS TÄSSÄ
 *
 * Sama ilmoitus lähtee kerran (`dedupe_key`). Jos haluat nähdä saman
 * herätteen uudelleen, poista sen rivi `rs_notifications`-taulusta — se on
 * tietoinen teko, kuten pitääkin.
 *
 * VUOKRAKAUDET SYNTYVÄT ALLEKIRJOITUKSESTA
 *
 * Ilman niitä ei ole mitään herätettävää. Ne luodaan `round.completed`
 * -webhookissa, eikä eSinetin mock lähetä webhookeja — joten mockilla
 * allekirjoitetusta vuokrasuhteesta ei synny kausia.
 *
 * `--luo <id>` luo ne samalla tuotantofunktiolla, jota webhook kutsuu. Se on
 * ainoa kohta, jossa tämä skripti kirjoittaa mitään, ja se vaatii
 * nimenomaisen vuokrasuhteen tunnisteen.
 *
 * Aja:
 *   npm run testi:vuokraherätteet -- --listaa
 *   npm run testi:vuokraherätteet -- --luo <id>
 *   npm run testi:vuokraherätteet -- 3
 *   npm run testi:vuokraherätteet -- 3 --laheta
 * ===========================================================================
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

/** Vuokrasuhteet tunnisteineen, jotta `--luo` osaa valita oikean. */
async function listaaVuokrasuhteet(supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase
    .from("rs_tenancies")
    .select("id, status, start_date, rent_amount, rent_due_day")
    .order("created_at", { ascending: false });

  const rivit = (data ?? []) as Array<{
    id: string;
    status: string;
    start_date: string | null;
    rent_amount: number | null;
    rent_due_day: number | null;
  }>;

  if (rivit.length === 0) {
    console.log("Yhtään vuokrasuhdetta ei löytynyt.");
    return;
  }

  console.log(`${rivit.length} vuokrasuhdetta:`);
  console.log("");

  for (const rivi of rivit) {
    const puuttuu = !rivi.start_date || !rivi.rent_due_day || rivi.rent_amount === null;

    console.log(`  ${rivi.id}`);
    console.log(
      `    ${rivi.status} · alkaa ${rivi.start_date ?? "?"} · ` +
        `${rivi.rent_amount ?? "?"} € · eräpäivä ${rivi.rent_due_day ?? "?"}.`,
    );
    if (puuttuu) console.log("    (tiedot kesken: kausia ei voi luoda)");
    console.log("");
  }

  console.log("Luo kaudet: npm run testi:vuokraherätteet -- --luo <id>");
}

/**
 * Luo vuokrakaudet samalla funktiolla, jota webhook kutsuu.
 *
 * Oma SQL-insertti olisi nopeampi kirjoittaa, mutta se olisi toinen toteutus
 * eräpäivien laskennasta — ja juuri se laskenta (31. päivä → kuukauden
 * viimeinen) on se, jonka halutaan toimivan oikein.
 */
async function luoKaudet(supabase: SupabaseClient, tenancyId: string): Promise<void> {
  const { data } = await supabase
    .from("rs_tenancies")
    .select(
      "id, property_id, landlord_user_id, status, start_date, end_date, " +
        "rent_amount, rent_due_day, deposit_amount, created_at",
    )
    .eq("id", tenancyId)
    .maybeSingle();

  if (!data) {
    console.error(`Vuokrasuhdetta ${tenancyId} ei löytynyt.`);
    return;
  }

  // `as unknown` välissä: PostgREST-clientin palautustyyppi ei ole
  // suoraan yhteensopiva, mutta rivin muoto tiedetään kyselystä.
  const rivi = data as unknown as Record<string, unknown>;
  const { createRentPeriods } = await import("../src/lib/db/tenancies");

  const maara = await createRentPeriods(String(rivi.id), {
    id: String(rivi.id),
    propertyId: String(rivi.property_id),
    landlordUserId: String(rivi.landlord_user_id),
    status: rivi.status as never,
    startDate: (rivi.start_date as string | null) ?? null,
    endDate: (rivi.end_date as string | null) ?? null,
    rentAmount: rivi.rent_amount === null ? null : Number(rivi.rent_amount),
    rentDueDay: rivi.rent_due_day === null ? null : Number(rivi.rent_due_day),
    depositAmount: rivi.deposit_amount === null ? null : Number(rivi.deposit_amount),
    createdAt: String(rivi.created_at),
  });

  console.log(`Luotiin ${maara} vuokrakautta vuokrasuhteelle ${tenancyId}.`);
  console.log("");
  console.log("Kokeile nyt: npm run testi:vuokraherätteet -- 3");
}

/** Mitä tapahtuisi, jos tänään olisi `kuviteltu`. */
async function kokeileHerätteet(
  supabase: SupabaseClient,
  nyt: Date,
  kuviteltu: Date,
  paivat: number,
  laheta: boolean,
): Promise<void> {
  const { loadPeriodState, dispatchDueReminders } = await import("../src/lib/rent/dispatch");
  const { plannedNotifications } = await import("../src/lib/rent/notifications");

  const merkki = paivat >= 0 ? "+" : "";

  console.log(`Tänään on ${nyt.toISOString().slice(0, 10)}.`);
  console.log(
    `Ajetaan niin kuin olisi ${kuviteltu.toISOString().slice(0, 10)} (${merkki}${paivat} pv).`,
  );
  console.log("");

  /*
    Sama rajaus kuin `dispatchDueReminders`illa: kaudet, joiden eräpäivä on
    vähintään kolme päivää ennen kuviteltua päivää. Haku toistetaan tässä,
    jotta raportti voi kertoa mitä lähtisi — itse lähetys kulkee silti
    tuotantokoodin läpi eikä tämän kopion.
  */
  const alkaen = new Date(kuviteltu.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);
  const asti = new Date(kuviteltu.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("rs_rent_periods")
    .select("id, due_date, amount")
    .gte("due_date", alkaen)
    .lte("due_date", asti)
    .order("due_date", { ascending: true });

  if (error) throw new Error(`Vuokrakausien haku epäonnistui: ${error.message}`);

  const kaudet = (data ?? []) as Array<{ id: string; due_date: string; amount: number }>;

  if (kaudet.length === 0) {
    console.log("Yhtään vuokrakautta ei osu tähän ikkunaan.");
    console.log("");
    console.log("Vuokrakaudet syntyvät allekirjoituksesta. Luo ne käsin:");
    console.log("  npm run testi:vuokraherätteet -- --listaa");
    console.log("  npm run testi:vuokraherätteet -- --luo <id>");
    return;
  }

  console.log(`Ikkunassa ${kaudet.length} vuokrakautta:`);
  console.log("");

  let suunniteltu = 0;

  for (const kausi of kaudet) {
    const tila = await loadPeriodState(kausi.id);
    if (!tila) continue;

    const aiotut = plannedNotifications(tila, kuviteltu);
    suunniteltu += aiotut.length;

    console.log(`  Eräpäivä ${kausi.due_date} · ${kausi.amount} €`);
    console.log(`    kuittaus: ${tila.status ?? "ei kuitattu"}`);

    if (aiotut.length === 0) {
      console.log("    ei herätteitä tälle päivälle");
    } else {
      for (const ilmoitus of aiotut) {
        console.log(`    → ${ilmoitus.kind}: ${ilmoitus.title}`);
      }
    }

    console.log("");
  }

  if (!laheta) {
    console.log(`Kuivaharjoitus: ${suunniteltu} heräte lähtisi. Mitään ei lähetetty.`);
    console.log("Lisää --laheta, jos haluat oikeasti lähettää ne.");
    return;
  }

  console.log("Lähetetään…");
  console.log("");

  const lahetetty = await dispatchDueReminders(kuviteltu);

  console.log(`Lähetettiin ${lahetetty} ilmoitusta.`);
  console.log("");
  console.log("Jos luku on pienempi kuin yllä, osa herätteistä oli jo lähetetty:");
  console.log("toiston esto (dedupe_key) sallii saman ilmoituksen kerran.");
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
const laheta = argumentit.includes("--laheta");
const listaa = argumentit.includes("--listaa");
const luoIndex = argumentit.indexOf("--luo");
const luoTenancyId = luoIndex === -1 ? null : (argumentit[luoIndex + 1] ?? null);
const paivat = Number(argumentit.find((a) => /^-?\d+$/.test(a)) ?? "3");

const supabase = createClient(url, key, { auth: { persistSession: false } });

/*
  Ei `process.exit`iä.

  Se sulkisi Supabase-clientin kahvat kesken, ja Windows kirjoittaa siitä
  lopuksi virheen näköisen viestin — vaikka ajo onnistui. Skripti päättyy
  luonnollisesti, kun tekemistä ei enää ole.
*/
if (listaa) {
  await listaaVuokrasuhteet(supabase);
} else if (luoTenancyId) {
  await luoKaudet(supabase, luoTenancyId);
} else {
  const nyt = new Date();
  await kokeileHerätteet(supabase, nyt, new Date(nyt.getTime() + paivat * 86_400_000), paivat, laheta);
}
