"use client";

import { useActionState, useState } from "react";
import {
  createEntryAction,
  type MaintenanceActionState,
} from "@/app/vuokrasuhteet/maintenance-actions";
import type { MaintenanceKind } from "@/lib/db/maintenance";

const initialState: MaintenanceActionState = {};

const KINDS: Array<{ value: MaintenanceKind; label: string; hint: string }> = [
  { value: "defect", label: "Vika", hint: "Jokin on rikki tai ei toimi." },
  { value: "repair", label: "Korjaus", hint: "Jokin on korjattu tai huollettu." },
  { value: "note", label: "Merkintä", hint: "Muu asia, joka on hyvä muistaa." },
];

/**
 * Uusi huoltokirjan merkintä.
 *
 * ===========================================================================
 * KUVAT LISÄTÄÄN VASTA TALLENNUKSEN JÄLKEEN
 *
 * Merkintä tallennetaan ensin, ja kuvat liitetään sen sivulla. Syy on
 * käytännöllinen: kuvan lähetys kestää, ja jos se epäonnistuisi kesken
 * lomakkeen, myös kirjoitettu teksti katoaisi. Näin teksti on tallessa heti,
 * ja kuvan voi yrittää uudelleen rauhassa.
 *
 * Vian voi ilmoittaa kumpi tahansa osapuoli. Kenttä "korjaus" on käytännössä
 * vuokranantajan, mutta sitä ei rajata: vuokralainen voi korjata itse
 * pikkuasian ja kirjata sen.
 * ===========================================================================
 */
export function MaintenanceForm({ tenancyId }: { tenancyId: string }) {
  const [state, formAction, pending] = useActionState(createEntryAction, initialState);
  const [kind, setKind] = useState<MaintenanceKind>("defect");

  return (
    <form
      action={formAction}
      className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5"
    >
      <input type="hidden" name="tenancyId" value={tenancyId} />

      <p className="font-medium">Uusi merkintä</p>

      <fieldset className="mt-4 border-0 p-0">
        <legend className="sr-only">Merkinnän laji</legend>
        <div className="flex gap-2">
          {KINDS.map((option) => (
            <label
              key={option.value}
              className={
                "flex min-h-[var(--size-touch)] flex-1 cursor-pointer items-center justify-center rounded-full border px-3 text-sm " +
                (kind === option.value ? "border-ink bg-ink text-paper" : "border-line bg-paper")
              }
            >
              <input
                type="radio"
                name="kind"
                value={option.value}
                defaultChecked={option.value === "defect"}
                onChange={() => setKind(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-sm text-ink/60">
          {KINDS.find((option) => option.value === kind)?.hint}
        </p>
      </fieldset>

      <div className="mt-4">
        <label htmlFor="merkinta-otsikko" className="text-sm font-medium">
          Otsikko
        </label>
        <input
          id="merkinta-otsikko"
          name="title"
          maxLength={120}
          required
          placeholder="Esimerkiksi: keittiön hana vuotaa"
          className="mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border border-line bg-paper px-3 text-base"
        />
      </div>

      <div className="mt-4">
        <label htmlFor="merkinta-kuvaus" className="text-sm font-medium">
          Kuvaus (vapaaehtoinen)
        </label>
        <textarea
          id="merkinta-kuvaus"
          name="body"
          rows={3}
          maxLength={2000}
          placeholder="Milloin huomasit, miten se ilmenee"
          className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
        />
        <p className="mt-1.5 text-sm text-ink/60">
          Kuvat lisätään tallennuksen jälkeen merkinnän omalla sivulla.
        </p>
      </div>

      {state.message ? (
        <p role="alert" className="mt-3 text-sm text-coral">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-5 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-6 font-medium text-paper disabled:opacity-60"
      >
        {pending ? "Tallennetaan…" : "Tallenna merkintä"}
      </button>
    </form>
  );
}
