"use client";

import { useActionState } from "react";
import { reissueInviteAction, type ReissueState } from "../actions";

const initialState: ReissueState = {};

/**
 * Kutsuttu vuokralainen ja kutsun uudelleenlähetys.
 *
 * Uusi linkki näytetään tässä eikä ohjata minnekään: tunniste ei saa päätyä
 * osoiteriville (ks. `actions.ts`). Vanhan linkin mitätöityminen sanotaan
 * ääneen, koska vuokranantaja on voinut jo lähettää sen.
 */
export function InviteRow({
  tenancyId,
  partyId,
  email,
  joined,
}: {
  tenancyId: string;
  partyId: string;
  email: string;
  joined: boolean;
}) {
  const [state, formAction, pending] = useActionState(reissueInviteAction, initialState);

  return (
    <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4">
      <p className="font-medium">{email}</p>
      <p className="mt-0.5 text-sm text-ink/60">
        {joined ? "Liittynyt" : "Ei ole vielä liittynyt"}
      </p>

      {joined ? null : (
        <form action={formAction} className="mt-3">
          <input type="hidden" name="tenancyId" value={tenancyId} />
          <input type="hidden" name="partyId" value={partyId} />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm disabled:opacity-60"
          >
            {pending ? "Luodaan…" : "Luo uusi kutsulinkki"}
          </button>
          <p className="mt-2 text-sm text-ink/60">
            Uusi linkki mitätöi aiemman. Jos olet jo lähettänyt vanhan, se lakkaa toimimasta.
          </p>
        </form>
      )}

      {state.url ? (
        <div className="mt-3">
          <p className="text-sm text-ink/60">Uusi kutsulinkki — näytetään vain nyt</p>
          <p className="mt-1 break-all rounded-[10px] bg-cloud p-3 font-mono text-sm">
            {state.url}
          </p>
        </div>
      ) : null}

      {state.message ? (
        <p role="alert" className="mt-3 text-sm text-coral">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
