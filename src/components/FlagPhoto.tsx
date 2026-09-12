"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  flagPhotoAction,
  type InspectionActionState,
} from "@/app/vuokrasuhteet/inspection-actions";

const initialState: InspectionActionState = {};

/**
 * "Ei kuulu tähän" -merkintä.
 *
 * ===========================================================================
 * KUVA EI POISTU, EIKÄ MERKINTÄ OLE MIELIPIDE TOISEN KUVASTA
 *
 * Kuvaa ei voi poistaa kumpikaan osapuoli. Se on koko katselmuksen arvon
 * ehto: jos kuvan voisi poistaa, pöytäkirja kertoisi vain sen, mitä
 * poistamatta jättänyt halusi sen kertovan.
 *
 * Merkintä on tarkoitettu selviin virheisiin — väärä huone, epäonnistunut
 * laukaisu, vahingossa otettu kuva. Se näkyy molemmille ja se tulee
 * pöytäkirjaan kuvan viereen, joten sitä ei voi käyttää toisen havainnon
 * hiljentämiseen: lukija näkee sekä kuvan että merkinnän ja päättää itse.
 *
 * Siksi lomake on suljettuna oletuksena ja avautuu erikseen. Se on
 * tarkoituksella hieman hankalampi kuin kuvan ottaminen.
 * ===========================================================================
 */
export function FlagPhoto({
  tenancyId,
  photoId,
  disabled = false,
}: {
  tenancyId: string;
  photoId: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(flagPhotoAction, initialState);

  if (disabled) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-sm text-ink/50 underline underline-offset-4"
      >
        Merkitse, ettei tämä kuulu tähän
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-3 rounded-[10px] border border-line p-3">
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <input type="hidden" name="photoId" value={photoId} />

      <p className="text-sm text-ink/70">
        Kuva ei poistu. Merkintä näkyy toiselle osapuolelle ja tulee pöytäkirjaan tämän kuvan
        viereen.
      </p>

      <label htmlFor={`syy-${photoId}`} className="sr-only">
        Syy
      </label>
      <input
        id={`syy-${photoId}`}
        name="reason"
        maxLength={200}
        placeholder="Esimerkiksi: väärä huone"
        className="mt-2 min-h-[var(--size-touch)] w-full rounded-[10px] border border-line bg-paper px-3 text-base"
      />

      {state.message ? (
        <p role="alert" className="mt-2 text-sm text-coral">
          {state.message}
        </p>
      ) : null}

      <div className="mt-3 flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm disabled:opacity-60"
        >
          {pending ? "Merkitään…" : "Merkitse"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-[var(--size-touch)] items-center px-2 text-sm text-ink/60"
        >
          Peruuta
        </button>
      </div>
    </form>
  );
}
