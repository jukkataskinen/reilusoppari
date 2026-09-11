"use client";

import { useActionState } from "react";
import { applyOwnDefaultsAction, type PartyFormState } from "@/app/party-actions";

const initialState: PartyFormState = { errors: {} };

/**
 * "Täytä omista tiedoistani".
 *
 * Perustiedot kopioituvat automaattisesti vain vuokrasuhdetta luotaessa.
 * Tämä nappi on sitä varten, että ne saa myös jälkikäteen: vuokrasuhde on
 * voitu luoda ennen kuin perustiedot oli täytetty.
 *
 * Oma lomakkeensa eikä nappi osapuolilomakkeen sisällä: sisäkkäiset lomakkeet
 * eivät ole sallittuja HTML:ssä, ja selain tiputtaisi toisen hiljaa.
 */
export function ApplyOwnDefaults({
  tenancyId,
  partyId,
}: {
  tenancyId: string;
  partyId: string;
}) {
  const [state, formAction, pending] = useActionState(applyOwnDefaultsAction, initialState);

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <input type="hidden" name="partyId" value={partyId} />

      {state.message ? (
        <p role="alert" className="mb-3 rounded-[10px] border border-coral bg-paper p-3 text-sm">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm disabled:opacity-60"
      >
        {pending ? "Kopioidaan…" : "Täytä omista tiedoistani"}
      </button>
    </form>
  );
}
