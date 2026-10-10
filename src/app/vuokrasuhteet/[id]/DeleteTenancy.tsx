"use client";

import { useActionState, useState } from "react";
import { deleteTenancyAction, type DeleteTenancyState } from "../actions";
import { Form } from "@/components/Form";

const initialState: DeleteTenancyState = {};

/**
 * Vuokrasuhdeluonnoksen poisto vahvistuksella.
 *
 * Kun poisto ei ole mahdollinen, nappia ei näytetä vaan syy kerrotaan
 * suoraan (`blockedReason`). Piilotettu nappi ilman selitystä jättäisi
 * vuokranantajan arvailemaan, missä poisto on.
 */
export function DeleteTenancy({
  tenancyId,
  blockedReason,
}: {
  tenancyId: string;
  blockedReason: string | null;
}) {
  const [state, formAction, pending] = useActionState(deleteTenancyAction, initialState);
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="mt-10 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      <h2 className="text-lg">Poista vuokrasuhde</h2>

      {blockedReason ? (
        <p className="mt-2 text-sm text-ink/70">{blockedReason}</p>
      ) : confirming ? (
        <Form action={formAction} className="mt-3">
          <input type="hidden" name="tenancyId" value={tenancyId} />
          <input type="hidden" name="confirm" value="yes" />
          <p className="text-sm">
            Poistetaanko vuokrasuhde kokonaan? Sopimusluonnos, kutsut ja katselmuksen kuvat
            poistuvat, eikä niitä saa takaisin. Asunto säilyy.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-coral px-5 text-sm font-medium text-coral disabled:opacity-60"
            >
              {pending ? "Poistetaan…" : "Kyllä, poista vuokrasuhde"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
            >
              Peruuta
            </button>
          </div>
        </Form>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink/70">
            Vuokrasuhteen voi poistaa, koska kukaan ei ole vielä liittynyt eikä mitään ole
            allekirjoitettu.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-3 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
          >
            Poista vuokrasuhde
          </button>
        </>
      )}

      {state.message ? (
        <p role="alert" className="mt-3 text-sm text-coral">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
