"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  createExpenseAction,
  type ExpenseActionState,
} from "@/app/vuokrasuhteet/expense-actions";
import {
  EXPENSE_CATEGORIES,
  categoryInfo,
  isKmRateConfirmed,
  kmRate,
  travelCost,
  type ExpenseCategory,
} from "@/lib/expenses/categories";

const initialState: ExpenseActionState = {};

/**
 * Kulun kirjaus korjauksen yhteydessä (Jukan pyyntö 2026-09-12).
 *
 * ===========================================================================
 * KYSYTÄÄN SILLOIN, KUN ASIA ON TUOREENA
 *
 * Lomake ilmestyy siinä hetkessä, kun vuokranantaja merkitsee vian
 * korjatuksi. Se on ainoa hetki, jolloin kuitti on vielä taskussa ja
 * ajokilometrit muistissa — keväällä veroilmoitusta tehdessä kumpikaan ei
 * ole.
 *
 * Lomake on suljettuna oletuksena. Kaikista korjauksista ei tule kuluja, ja
 * aina auki oleva lomake olisi kysymys, johon vastataan ohittamalla.
 *
 * MATKAKULUISSA RIITTÄVÄT KILOMETRIT
 *
 * Summa lasketaan verottajan taksalla sen vuoden mukaan, jolle kulu
 * kirjataan. Käyttäjän ei tarvitse tietää taksaa eikä laskea mitään.
 *
 * EI NÄY VUOKRALAISELLE
 *
 * Kulut ja kuitit ovat vuokranantajan kirjanpitoa. Sivun teksti sanoo sen
 * ääneen: ihmisen on tiedettävä, mitä hän kirjaa yhteiseen palveluun ja mitä
 * vain itselleen.
 * ===========================================================================
 */
export function ExpenseForm({
  tenancyId,
  maintenanceEntryId,
  defaultDate,
}: {
  tenancyId: string;
  maintenanceEntryId?: string;
  /** Oletuspäivä `VVVV-KK-PP`. Korjauspäivä on paras arvaus. */
  defaultDate: string;
}) {
  const [state, formAction, pending] = useActionState(createExpenseAction, initialState);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>("vuosikorjaus");
  const [km, setKm] = useState("");

  const year = Number(defaultDate.slice(0, 4));
  const isTravel = category === "matkat";
  const kmNumber = Number(km.replace(",", "."));
  const estimate =
    isTravel && Number.isFinite(kmNumber) && kmNumber > 0 ? travelCost(kmNumber, year) : null;

  if (state.savedId) {
    return (
      <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <p className="font-medium">Kulu kirjattu</p>
        <p className="mt-2 text-sm text-ink/70">
          Kuitin voi kuvata talteen nyt. Kuitti ja kulu näkyvät vain sinulle.
        </p>
        <Link
          href={`/vuokrasuhteet/${tenancyId}/kulut/${state.savedId}`}
          className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper"
        >
          Kuvaa kuitti
        </Link>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <p className="font-medium">Tuliko tästä kuluja?</p>
        <p className="mt-2 text-sm text-ink/70">
          Kirjaa kulut ja ajokilometrit nyt, kun kuitti on vielä tallessa. Ne kootaan
          verolaskelmaan, eivätkä ne näy vuokralaiselle.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
        >
          Kirjaa kulu
        </button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5"
    >
      <input type="hidden" name="tenancyId" value={tenancyId} />
      {maintenanceEntryId ? (
        <input type="hidden" name="maintenanceEntryId" value={maintenanceEntryId} />
      ) : null}

      <p className="font-medium">Kulun tiedot</p>
      <p className="mt-2 text-sm text-ink/70">Näkyy vain sinulle, ei vuokralaiselle.</p>

      <div className="mt-4">
        <label htmlFor="kulu-luokka" className="text-sm font-medium">
          Kululuokka
        </label>
        <select
          id="kulu-luokka"
          name="category"
          value={category}
          onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
          className="mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border border-line bg-paper px-3 text-base"
        >
          {EXPENSE_CATEGORIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-sm text-ink/60">{categoryInfo(category).hint}</p>
        {categoryInfo(category).deductibleAnnually ? null : (
          <p className="mt-1.5 text-sm text-ink/60">
            Tämä ei ole vuosikulu. Se kirjataan silti, mutta laskelmassa se on omassa
            osiossaan.
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row">
        <div className="sm:w-[11rem]">
          <label htmlFor="kulu-paiva" className="text-sm font-medium">
            Päivä
          </label>
          <input
            id="kulu-paiva"
            name="date"
            type="date"
            defaultValue={defaultDate}
            className="mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border border-line bg-paper px-3 text-base"
          />
        </div>

        {isTravel ? (
          <div className="sm:w-[9rem]">
            <label htmlFor="kulu-km" className="text-sm font-medium">
              Kilometrit
            </label>
            <input
              id="kulu-km"
              name="km"
              inputMode="decimal"
              value={km}
              onChange={(event) => setKm(event.target.value)}
              placeholder="24"
              className="mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border border-line bg-paper px-3 text-base"
            />
          </div>
        ) : null}

        <div className="sm:w-[9rem]">
          <label htmlFor="kulu-summa" className="text-sm font-medium">
            Summa (€)
          </label>
          <input
            id="kulu-summa"
            name="amount"
            inputMode="decimal"
            placeholder={isTravel ? "lasketaan" : "129,90"}
            className="mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border border-line bg-paper px-3 text-base"
          />
        </div>
      </div>

      {isTravel ? (
        <p className="mt-2 text-sm text-ink/60">
          {estimate !== null
            ? `${km.replace(".", ",")} km × ${kmRate(year)
                .toFixed(2)
                .replace(".", ",")} €/km = ${estimate.toFixed(2).replace(".", ",")} €.`
            : `Kilometrit riittävät: summa lasketaan vuoden ${year} taksalla.`}
          {isKmRateConfirmed(year)
            ? ""
            : " Vuoden taksaa ei ole vielä vahvistettu, joten käytössä on edellisen vuoden luku."}
        </p>
      ) : null}

      <div className="mt-4">
        <label htmlFor="kulu-kuvaus" className="text-sm font-medium">
          Kuvaus
        </label>
        <input
          id="kulu-kuvaus"
          name="description"
          maxLength={300}
          placeholder="Esimerkiksi: hanan vaihto, LVI-liike"
          className="mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border border-line bg-paper px-3 text-base"
        />
      </div>

      <label className="mt-4 flex min-h-[var(--size-touch)] items-center gap-3">
        <input type="checkbox" name="vatIncluded" defaultChecked className="size-5" />
        <span className="text-sm">Summa sisältää arvonlisäveron</span>
      </label>

      {state.message ? (
        <p role="alert" className="mt-3 text-sm text-coral">
          {state.message}
        </p>
      ) : null}

      <div className="mt-5 flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-6 font-medium text-paper disabled:opacity-60"
        >
          {pending ? "Tallennetaan…" : "Tallenna kulu"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-[var(--size-touch)] items-center px-2 text-sm text-ink/60"
        >
          Ei kuluja
        </button>
      </div>
    </form>
  );
}
