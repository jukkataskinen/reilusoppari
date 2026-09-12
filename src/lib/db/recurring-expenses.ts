/**
 * Toistuvat kuukausikulut tietokannassa (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * SÄÄNNÖT OVAT `lib/expenses/recurring.ts`:SSÄ
 *
 * Tämä moduuli lukee ja kirjoittaa. Se, mihin kuukauteen muutos saa alkaa ja
 * miten vuosi lasketaan, on puhdas funktio ja testattu ilman tietokantaa.
 *
 * KAUSI TALLENNETAAN PÄIVÄMÄÄRÄNÄ, KÄSITELLÄÄN KUUKAUTENA
 *
 * Kanta tallentaa kuukauden ensimmäisenä päivänä (`2026-03-01`), koska
 * Postgresilla ei ole kuukausityyppiä. Sovelluksessa se on `YYYY-MM`, ja
 * muunnos tapahtuu vain tässä tiedostossa — muualla kuukausi on kuukausi.
 * ===========================================================================
 */

import { getServiceClient } from "./supabase";
import { requireExpenseAccess } from "./access";
import { isExpenseCategory, type ExpenseCategory } from "../expenses/categories";
import {
  currentMonth,
  isMonth,
  planChange,
  type Month,
  type RecurringPeriod,
} from "../expenses/recurring";

/** `2026-03-01` → `2026-03`. */
function toMonth(date: string): Month {
  return date.slice(0, 7);
}

/** `2026-03` → `2026-03-01`. */
function toDate(month: Month): string {
  return `${month}-01`;
}

interface Row {
  id: string;
  series_id: string;
  category: string;
  description: string | null;
  monthly_amount: number | string;
  starts_month: string;
  ends_month: string | null;
}

function fromRow(row: Row): RecurringPeriod {
  return {
    id: row.id,
    seriesId: row.series_id,
    // Tuntematon luokka jätetään "muuksi" eikä hylätä: rivi on olemassa ja
    // sen summa on maksettu. Pois jättäminen tekisi vuosikuluista liian
    // pienet ilman että kukaan näkee syytä.
    category: isExpenseCategory(row.category) ? row.category : "muu",
    description: row.description,
    monthlyAmount: Number(row.monthly_amount),
    startsMonth: toMonth(row.starts_month),
    endsMonth: row.ends_month ? toMonth(row.ends_month) : null,
  };
}

/** Asunnon toistuvat kulut, kaikki kaudet. Vain omistajalle. */
export async function listRecurringExpenses(
  userId: string,
  propertyId: string,
): Promise<RecurringPeriod[]> {
  await requireExpenseAccess(userId, propertyId);

  const { data, error } = await getServiceClient()
    .from("rs_recurring_expenses")
    .select("id, series_id, category, description, monthly_amount, starts_month, ends_month")
    .eq("property_id", propertyId)
    .order("starts_month", { ascending: true });

  if (error) {
    console.error("[toistuvat kulut] haku epäonnistui:", error.message);
    throw new Error("Toistuvien kulujen haku epäonnistui.");
  }

  return ((data ?? []) as unknown as Row[]).map(fromRow);
}

export interface RecurringSeries {
  seriesId: string;
  category: ExpenseCategory;
  description: string | null;
  /** Kaudet vanhimmasta uusimpaan. */
  periods: RecurringPeriod[];
  /** Voimassa oleva kausi, jos sellainen on. */
  current: RecurringPeriod | null;
}

/**
 * Kaudet sarjoiksi.
 *
 * Luokka ja kuvaus otetaan VIIMEISIMMÄSTÄ kaudesta: jos autopaikan vastike
 * on joskus kirjattu väärään luokkaan ja korjattu myöhemmin, listalla lukee
 * se, mikä on nyt voimassa.
 */
export function groupIntoSeries(periods: RecurringPeriod[], now: Month): RecurringSeries[] {
  const bySeries = new Map<string, RecurringPeriod[]>();

  for (const period of periods) {
    bySeries.set(period.seriesId, [...(bySeries.get(period.seriesId) ?? []), period]);
  }

  return [...bySeries.values()]
    .map((group) => {
      const sorted = [...group].sort((a, b) => a.startsMonth.localeCompare(b.startsMonth));
      const latest = sorted.at(-1)!;

      const current =
        sorted.find(
          (period) =>
            period.startsMonth <= now && (period.endsMonth === null || period.endsMonth >= now),
        ) ?? null;

      return {
        seriesId: latest.seriesId,
        category: latest.category,
        description: latest.description,
        periods: sorted,
        current,
      };
    })
    .sort((a, b) => (a.description ?? "").localeCompare(b.description ?? ""));
}

export type RecurringResult = { ok: true; seriesId: string } | { ok: false; message: string };

/**
 * Aloittaa uuden toistuvan kulun.
 *
 * `series_id` on rivin oma id: ensimmäinen kausi aloittaa sarjan. Se
 * kirjoitetaan erillisellä päivityksellä, koska riviä luodessa id:tä ei vielä
 * tiedetä — vaihtoehto olisi generoida uuid sovelluksessa, mutta silloin
 * kannan oletusarvo jäisi käyttämättä ja kaksi paikkaa päättäisi id:n.
 */
export async function startRecurringExpense(input: {
  userId: string;
  propertyId: string;
  category: string;
  description: string;
  monthlyAmount: number;
  startsMonth: string;
}): Promise<RecurringResult> {
  await requireExpenseAccess(input.userId, input.propertyId);

  if (!isExpenseCategory(input.category)) return { ok: false, message: "Valitse kululuokka." };
  if (!isMonth(input.startsMonth)) return { ok: false, message: "Tarkista alkukuukausi." };

  if (!Number.isFinite(input.monthlyAmount) || input.monthlyAmount <= 0) {
    return { ok: false, message: "Anna kuukausisumma euroina." };
  }

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("rs_recurring_expenses")
    .insert({
      property_id: input.propertyId,
      // Väliaikainen: korvataan rivin omalla id:llä heti perään.
      series_id: "00000000-0000-0000-0000-000000000000",
      category: input.category,
      description: input.description.trim().slice(0, 200) || null,
      monthly_amount: input.monthlyAmount,
      starts_month: toDate(input.startsMonth),
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[toistuvat kulut] luonti epäonnistui:", error?.message);
    return { ok: false, message: "Toistuvan kulun tallennus epäonnistui." };
  }

  const { error: updateError } = await supabase
    .from("rs_recurring_expenses")
    .update({ series_id: data.id })
    .eq("id", data.id);

  if (updateError) {
    // Rivi jäisi muuten nollatunnisteiseen sarjaan, jossa se sekoittuisi
    // muihin epäonnistuneisiin. Poistetaan se kokonaan.
    await supabase.from("rs_recurring_expenses").delete().eq("id", data.id);
    console.error("[toistuvat kulut] sarjan asetus epäonnistui:", updateError.message);
    return { ok: false, message: "Toistuvan kulun tallennus epäonnistui." };
  }

  return { ok: true, seriesId: data.id };
}

/**
 * Muuttaa kuukausisumman annetusta kuukaudesta alkaen.
 *
 * Vanha kausi päätetään edelliseen kuukauteen ja uusi alkaa. Sääntö siitä,
 * mihin muutos saa alkaa, on `planChange`issa ja testattu erikseen.
 */
export async function changeRecurringAmount(input: {
  userId: string;
  propertyId: string;
  seriesId: string;
  monthlyAmount: number;
  fromMonth: string;
  now?: Date;
}): Promise<RecurringResult> {
  await requireExpenseAccess(input.userId, input.propertyId);

  if (!Number.isFinite(input.monthlyAmount) || input.monthlyAmount <= 0) {
    return { ok: false, message: "Anna kuukausisumma euroina." };
  }

  const supabase = getServiceClient();

  const { data } = await supabase
    .from("rs_recurring_expenses")
    .select("id, series_id, category, description, monthly_amount, starts_month, ends_month")
    .eq("property_id", input.propertyId)
    .eq("series_id", input.seriesId);

  const series = ((data ?? []) as unknown as Row[]).map(fromRow);
  if (series.length === 0) return { ok: false, message: "Kulua ei löytynyt." };

  const plan = planChange(series, input.fromMonth, currentMonth(input.now));
  if (!plan.ok) return { ok: false, message: plan.message };

  const latest = [...series].sort((a, b) => a.startsMonth.localeCompare(b.startsMonth)).at(-1)!;

  /*
    Vanha kausi päätetään ENNEN uuden luontia.

    Osittainen uniikki indeksi sallii vain yhden avoimen kauden sarjassa. Jos
    uusi luotaisiin ensin, insert kaatuisi indeksiin — ja toisessa
    järjestyksessä keskeytyminen jättäisi sarjaan aukon, joka näkyy
    `seriesProblems`issa. Aukko on korjattavissa; kaksinkertainen kuukausi
    ei näy laskelmassa mitenkään.
  */
  const { error: closeError } = await supabase
    .from("rs_recurring_expenses")
    .update({ ends_month: toDate(plan.closeAt!), updated_at: new Date().toISOString() })
    .eq("id", latest.id)
    .is("ends_month", null);

  if (closeError) {
    console.error("[toistuvat kulut] kauden päätös epäonnistui:", closeError.message);
    return { ok: false, message: "Muutosta ei voitu tallentaa." };
  }

  const { error } = await supabase.from("rs_recurring_expenses").insert({
    property_id: input.propertyId,
    series_id: input.seriesId,
    category: latest.category,
    description: latest.description,
    monthly_amount: input.monthlyAmount,
    starts_month: toDate(plan.startAt),
  });

  if (error) {
    // Palautetaan vanha kausi avoimeksi: muuten sarjaan jää aukko siitä
    // kuukaudesta eteenpäin, eikä vastiketta laskettaisi lainkaan.
    await supabase
      .from("rs_recurring_expenses")
      .update({ ends_month: null })
      .eq("id", latest.id);

    console.error("[toistuvat kulut] uuden kauden luonti epäonnistui:", error.message);
    return { ok: false, message: "Muutosta ei voitu tallentaa." };
  }

  return { ok: true, seriesId: input.seriesId };
}

/**
 * Päättää toistuvan kulun kokonaan.
 *
 * Käytetään kun asunto myydään tai kulu loppuu — ei kun summa muuttuu.
 * Rivejä ei poisteta: jo lasketut vuodet perustuvat niihin, ja poistettu
 * kausi muuttaisi menneen vuoden laskelmaa takautuvasti.
 */
export async function endRecurringExpense(input: {
  userId: string;
  propertyId: string;
  seriesId: string;
  lastMonth: string;
}): Promise<RecurringResult> {
  await requireExpenseAccess(input.userId, input.propertyId);

  if (!isMonth(input.lastMonth)) return { ok: false, message: "Tarkista kuukausi." };

  const { error } = await getServiceClient()
    .from("rs_recurring_expenses")
    .update({ ends_month: toDate(input.lastMonth), updated_at: new Date().toISOString() })
    .eq("property_id", input.propertyId)
    .eq("series_id", input.seriesId)
    .is("ends_month", null)
    // Avointa kautta ei voi päättää ennen sen alkua.
    .lte("starts_month", toDate(input.lastMonth));

  if (error) {
    console.error("[toistuvat kulut] päättäminen epäonnistui:", error.message);
    return { ok: false, message: "Päättämistä ei voitu tallentaa." };
  }

  return { ok: true, seriesId: input.seriesId };
}

/** Laskelmaa varten: kaikki kaudet ilman omistajatarkistusta kutsujalta. */
export async function recurringForProperty(propertyId: string): Promise<RecurringPeriod[]> {
  const { data, error } = await getServiceClient()
    .from("rs_recurring_expenses")
    .select("id, series_id, category, description, monthly_amount, starts_month, ends_month")
    .eq("property_id", propertyId);

  if (error) {
    console.error("[toistuvat kulut] haku epäonnistui:", error.message);
    throw new Error("Toistuvien kulujen haku epäonnistui.");
  }

  return ((data ?? []) as unknown as Row[]).map(fromRow);
}
