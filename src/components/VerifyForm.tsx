"use client";

import { useActionState } from "react";
import { verifyAction, type VerifyState } from "@/app/todistus/verify-actions";

const initialState: VerifyState = {};

/**
 * Tiivisteen tarkistuslomake.
 *
 * Vastaus kertoo vain sen, onko asiakirja sinetöity ja milloin. Se ei kerro
 * kenestä todistus on eikä mitä siinä lukee: tarkistus on aitouden
 * tarkistus, ei tapa lukea toisen asiakirjoja tiivisteen perusteella.
 */
export function VerifyForm() {
  const [state, formAction, pending] = useActionState(verifyAction, initialState);

  return (
    <form action={formAction} className="mt-6">
      <label htmlFor="tiiviste" className="text-sm font-medium">
        Asiakirjan tiiviste (SHA-256)
      </label>
      <input
        id="tiiviste"
        name="sha256"
        spellCheck={false}
        autoComplete="off"
        placeholder="64 merkkiä"
        className="mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border border-line bg-paper px-3 font-mono text-sm"
      />

      {state.message ? (
        <p role="alert" className="mt-3 text-sm text-coral">
          {state.message}
        </p>
      ) : null}

      {state.result ? (
        <div className="mt-4 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          {state.result.found ? (
            <>
              <p className="font-medium">Asiakirja on aito</p>
              <p className="mt-2 text-sm text-ink/70">
                {state.result.name}
                {state.result.sealedAt ? ` · sinetöity ${state.result.sealedAt}` : ""}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Tätä tiivistettä ei löytynyt</p>
              <p className="mt-2 text-sm text-ink/70">
                Asiakirjaa ei ole sinetöity Reilusopparissa, tai sitä on muutettu sinetöinnin
                jälkeen. Tarkista, että kopioit tiivisteen kokonaan.
              </p>
            </>
          )}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-6 font-medium text-paper disabled:opacity-60"
      >
        {pending ? "Tarkistetaan…" : "Tarkista"}
      </button>
    </form>
  );
}
