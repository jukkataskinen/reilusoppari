"use client";

import { useActionState, useState } from "react";
import {
  changeRecurringAction,
  endRecurringAction,
  startRecurringAction,
  type RecurringActionState,
} from "@/app/asunnot/recurring-actions";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/categories";
import { formatMonth, type RecurringPeriod } from "@/lib/expenses/recurring";
import type { RecurringSeries } from "@/lib/db/recurring-expenses";

const initialState: RecurringActionState = {};

function euro(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const hasCents = rounded % 1 !== 0;
  const [whole, cents] = rounded.toFixed(hasCents ? 2 : 0).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return cents ? `${grouped},${cents} €` : `${grouped} €`;
}

/** Kauden voimassaolo luettavana: `3/2026 alkaen` tai `1/2026 – 2/2026`. */
function period(row: RecurringPeriod): string {
  return row.endsMonth
    ? `${formatMonth(row.startsMonth)} – ${formatMonth(row.endsMonth)}`
    : `${formatMonth(row.startsMonth)} alkaen`;
}

/**
 * Toistuvat kuukausikulut (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * MUUTOS EI OLE MUOKKAUS
 *
 * Kun vastike nousee, käyttöliittymä ei tarjoa vanhan summan muokkaamista
 * vaan uuden summan kirjaamista kuukaudesta alkaen. Muokkausnappi olisi
 * houkutteleva ja väärä: se laskisi koko vuoden uudella summalla, vaikka
 * alkuvuosi on maksettu vanhalla.
 *
 * Historia näkyy: käyttäjän on nähtävä, mistä laskelman luku muodostuu, ja
 * kausien luettelo on se paikka, jossa sen näkee.
 * ===========================================================================
 */
export function RecurringExpenses({
  propertyId,
  series,
  /** Kuluva kuukausi `YYYY-MM`. Lomakkeiden oletusarvo. */
  now,
}: {
  propertyId: string;
  series: RecurringSeries[];
  now: string;
}) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      {series.map((item) => (
        <SeriesCard key={item.seriesId} propertyId={propertyId} series={item} now={now} />
      ))}

      <NewSeries propertyId={propertyId} now={now} />
    </div>
  );
}

function SeriesCard({
  propertyId,
  series,
  now,
}: {
  propertyId: string;
  series: RecurringSeries;
  now: string;
}) {
  const [changeState, change, changePending] = useActionState(changeRecurringAction, initialState);
  const [endState, end, endPending] = useActionState(endRecurringAction, initialState);
  const [open, setOpen] = useState<"none" | "change" | "end">("none");

  const label = EXPENSE_CATEGORIES.find((c) => c.value === series.category)?.label ?? series.category;
  const ended = series.periods.at(-1)?.endsMonth !== null;

  return (
    <section className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="font-medium">{series.description || label}</h3>
          {series.description ? <p className="text-sm text-ink/60">{label}</p> : null}
        </div>

        {series.current ? (
          <p className="text-lg">
            {euro(series.current.monthlyAmount)}
            <span className="ml-1 text-sm text-ink/60">/ kk</span>
          </p>
        ) : (
          <p className="text-sm text-ink/60">{ended ? "Päättynyt" : "Ei vielä voimassa"}</p>
        )}
      </div>

      {/* --- Kaudet -------------------------------------------------------
          Historia näkyy, koska käyttäjän on nähtävä mistä laskelman luku
          muodostuu. */}

      <ul className="mt-4 flex flex-col gap-1.5 text-sm">
        {series.periods.map((row) => (
          <li key={row.id} className="flex items-baseline justify-between gap-3">
            <span className={row.endsMonth && row.endsMonth < now ? "text-ink/50" : ""}>
              {period(row)}
            </span>
            <span className={row.endsMonth && row.endsMonth < now ? "text-ink/50" : ""}>
              {euro(row.monthlyAmount)} / kk
            </span>
          </li>
        ))}
      </ul>

      {!ended ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOpen(open === "change" ? "none" : "change")}
            className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
          >
            Summa muuttui
          </button>
          <button
            type="button"
            onClick={() => setOpen(open === "end" ? "none" : "end")}
            className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
          >
            Kulu loppui
          </button>
        </div>
      ) : null}

      {open === "change" ? (
        <form action={change} className="mt-4 rounded-[10px] border border-line p-4">
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="seriesId" value={series.seriesId} />

          <p className="text-sm text-ink/70">
            Uusi summa ei muuta mennyttä: vanha kausi päättyy edelliseen kuukauteen, ja
            laskelmassa alkuvuosi lasketaan edelleen vanhalla summalla.
          </p>

          <div className="mt-3 flex flex-wrap gap-3">
            <label className="flex-1">
              <span className="block text-sm font-medium">Uusi summa, € / kk</span>
              <input
                name="monthlyAmount"
                inputMode="decimal"
                required
                className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
              />
            </label>
            <label className="flex-1">
              <span className="block text-sm font-medium">Mistä kuukaudesta</span>
              <input
                type="month"
                name="fromMonth"
                defaultValue={now}
                required
                className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
              />
            </label>
          </div>

          {changeState.message ? (
            <p role="alert" className="mt-2 text-sm text-coral">
              {changeState.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={changePending}
            className="mt-3 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
          >
            {changePending ? "Tallennetaan…" : "Tallenna muutos"}
          </button>
        </form>
      ) : null}

      {open === "end" ? (
        <form action={end} className="mt-4 rounded-[10px] border border-line p-4">
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="seriesId" value={series.seriesId} />

          <p className="text-sm text-ink/70">
            Kulu päättyy antamasi kuukauden loppuun. Aiemmat kuukaudet jäävät laskelmiin —
            niitä ei poisteta, koska jo lasketut vuodet perustuvat niihin.
          </p>

          <label className="mt-3 block">
            <span className="block text-sm font-medium">Viimeinen kuukausi</span>
            <input
              type="month"
              name="lastMonth"
              defaultValue={now}
              required
              className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base sm:w-56"
            />
          </label>

          {endState.message ? (
            <p role="alert" className="mt-2 text-sm text-coral">
              {endState.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={endPending}
            className="mt-3 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm disabled:opacity-60"
          >
            {endPending ? "Tallennetaan…" : "Merkitse päättyneeksi"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function NewSeries({ propertyId, now }: { propertyId: string; now: string }) {
  const [state, start, pending] = useActionState(startRecurringAction, initialState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[var(--size-touch)] items-center self-start rounded-full bg-ink px-5 text-sm font-medium text-paper"
      >
        Lisää toistuva kulu
      </button>
    );
  }

  return (
    <form
      action={start}
      key={state.done ? "tallennettu" : "luonnos"}
      className="rounded-[var(--radius-panel)] border border-line bg-paper p-5"
    >
      <input type="hidden" name="propertyId" value={propertyId} />

      <h3 className="font-medium">Uusi toistuva kulu</h3>

      <label className="mt-4 block">
        <span className="block text-sm font-medium">Mikä kulu</span>
        <input
          name="description"
          placeholder="Esimerkiksi: hoitovastike"
          className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
        />
      </label>

      <label className="mt-4 block">
        <span className="block text-sm font-medium">Luokka</span>
        <select
          name="category"
          defaultValue="hoitovastike"
          className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
        >
          {EXPENSE_CATEGORIES.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4 flex flex-wrap gap-3">
        <label className="flex-1">
          <span className="block text-sm font-medium">Summa, € / kk</span>
          <input
            name="monthlyAmount"
            inputMode="decimal"
            required
            className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
          />
        </label>
        <label className="flex-1">
          <span className="block text-sm font-medium">Mistä kuukaudesta</span>
          <input
            type="month"
            name="startsMonth"
            defaultValue={now}
            required
            className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
          />
        </label>
      </div>

      {state.message ? (
        <p role="alert" className="mt-3 text-sm text-coral">
          {state.message}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
        >
          {pending ? "Tallennetaan…" : "Tallenna"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
        >
          Peruuta
        </button>
      </div>
    </form>
  );
}
