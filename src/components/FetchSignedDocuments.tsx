"use client";

import { useActionState } from "react";
import {
  fetchSignedDocumentsAction,
  type SigningActionState,
} from "@/app/vuokrasuhteet/signing-actions";
import { Form } from "@/components/Form";

const initialState: SigningActionState = {};

/**
 * Valmiin kierroksen asiakirjojen haku eSinetiltä, jos webhook ei tuonut
 * niitä (10.10.2026). Vain vuokranantajalle.
 */
export function FetchSignedDocuments({ tenancyId }: { tenancyId: string }) {
  const [state, formAction, pending] = useActionState(fetchSignedDocumentsAction, initialState);

  return (
    <Form action={formAction} className="mt-4 rounded-[10px] border border-line bg-canvas p-4">
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <p className="text-sm text-ink/70">
        Kaikki ovat allekirjoittaneet, mutta allekirjoitettu asiakirja ei ole vielä tullut
        tänne. Voit hakea sen itse.
      </p>
      {state.message ? (
        <p role={state.sent ? "status" : "alert"} className={"mt-3 text-sm " + (state.sent ? "text-ink/70" : "text-coral")}>
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
      >
        {pending ? "Haetaan…" : "Hae allekirjoitetut asiakirjat"}
      </button>
    </Form>
  );
}
