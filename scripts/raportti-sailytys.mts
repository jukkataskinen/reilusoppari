/**
 * Säilytysajan kuivaharjoitus.
 *
 * ===========================================================================
 * TÄMÄ SKRIPTI EI POISTA MITÄÄN
 *
 * Se lukee vuokrasuhteiden päättymispäivät ja kertoo, mitkä olisivat
 * poistokelpoisia (CLAUDE.md kohta 2: kolme vuotta päättymisestä). Poisto on
 * peruuttamaton, ja sen käyttöönotto on oma päätöksensä.
 *
 * Ensimmäinen poistettava rivi syntyy aikaisintaan 2029, joten tämän
 * raportin pitäisi olla tyhjä vielä pitkään. Jos se ei ole, joko testidataa
 * on jäänyt tuotantoon tai säännössä on virhe — kumpikin kannattaa tietää
 * ennen kuin poisto on olemassa.
 *
 * Aja: npm run raportti:sailytys
 * ===========================================================================
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

/** Lukee `.env.local`:n, jos sellainen on. Arvoja ei tulosteta. */
function lataaYmparisto() {
  try {
    const sisalto = readFileSync(".env.local", "utf8");

    for (const rivi of sisalto.split(/\r?\n/)) {
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

lataaYmparisto();

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error(
    "Supabase-tunnuksia ei löytynyt (.env.local tai ympäristömuuttujat).\n" +
      "Raporttia ei voi ajaa ilman niitä.",
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

/*
  Sääntö tuodaan sovelluskoodista eikä kirjoiteta tähän uudelleen.

  Kaksi kopiota samasta säännöstä ajautuisi erilleen, ja silloin raportti
  näyttäisi eri asiaa kuin mitä poisto joskus tekisi — mikä on pahin
  mahdollinen tilanne peruuttamattomassa toiminnossa.
*/
const { retentionReport, RETENTION_YEARS } = await import("../src/lib/retention/rules");

const { data, error } = await supabase
  .from("rs_tenancies")
  .select("id, end_date, notice_ends_at, status");

if (error) {
  console.error("Vuokrasuhteiden haku epäonnistui:", error.message);
  process.exit(1);
}

/*
  Päättymispäivä: irtisanomisesta laskettu päivä, jos se on, muuten
  sopimuksen loppupäivä. Vain päättyneet vuokrasuhteet lasketaan — kesken
  oleva ei ole poistokelpoinen, kesti se kuinka kauan tahansa.
*/
const tilat = (data ?? []).map((rivi: {
  id: string;
  end_date: string | null;
  notice_ends_at: string | null;
  status: string;
}) => ({
  tenancyId: rivi.id,
  endedAt:
    rivi.status === "ended" || rivi.status === "certified"
      ? (rivi.notice_ends_at ?? rivi.end_date ?? null)
      : null,
}));

const raportti = retentionReport(tilat);

console.log(`Säilytysaika: ${RETENTION_YEARS} vuotta vuokrasuhteen päättymisestä.\n`);
console.log(`Vuokrasuhteita yhteensä: ${tilat.length}`);
console.log(`Päättyneitä: ${tilat.filter((tila) => tila.endedAt).length}\n`);

if (raportti.due.length === 0) {
  console.log("Poistokelpoisia: ei yhtään.");
} else {
  console.log(`Poistokelpoisia: ${raportti.due.length}`);
  for (const rivi of raportti.due) {
    console.log(`  ${rivi.tenancyId}  poistokelpoinen ${rivi.deletableFrom}`);
  }
}

if (raportti.soon.length > 0) {
  console.log(`\nPoistokelpoisia vuoden sisällä: ${raportti.soon.length}`);
  for (const rivi of raportti.soon) {
    console.log(`  ${rivi.tenancyId}  ${rivi.deletableFrom} (${rivi.daysUntil} pv)`);
  }
}

console.log(`\nPoistettaisiin: ${raportti.categories.join(", ")}`);
console.log(`Säilyy aina: ${raportti.kept.join(", ")}`);
console.log("\nTämä on kuivaharjoitus. Mitään ei poistettu.");
