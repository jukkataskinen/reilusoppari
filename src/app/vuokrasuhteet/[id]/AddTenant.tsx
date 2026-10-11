"use client";

import { useActionState, useId, useState } from "react";
import { addTenantAction, type InviteRowState } from "../actions";
import { Form } from "@/components/Form";

const initialState: InviteRowState = {};

/**
 * Vuokralaisen lisääminen jälkikäteen (PLAN.md "Kutsun korjaus", Jukan
 * havainto 10.10.2026) — esimerkiksi kutsun poiston jälkeen vapautuneelle
 * paikalle. Näytetään vain, kun vuokrasuhteessa on tilaa (alle kaksi
 * vuokralaista) ja sopimusta ei ole vielä lähetetty allekirjoitettavaksi.
 */
export function AddTenant({ tenancyId }: { tenancyId: string }) {
  const [state, formAction, pending] = useActionState(addTenantAction, initialState);
  const [open, setOpen] = useState(false);
  const prefix = useId();

  if (state.issued) {
    return (
      <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4" role="status">
        <p className="text-sm font-medium break-all">
          {state.issued.emailSent
            ? `Kutsu lähetetty osoitteeseen ${state.issued.email}.`
            : `Sähköpostia ei voitu lähettää osoitteeseen ${state.issued.email}. Lähetä alla oleva linkki vuokralaiselle itse.`}
        </p>
        <p className="mt-2 text-sm text-ink/60">Uusi kutsulinkki — näytetään vain nyt</p>
        <p className="mt-1 break-all rounded-[10px] bg-cloud p-3 font-mono text-sm">
          {state.issued.url}
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
      >
        Lisää vuokralainen
      </button>
    );
  }

  return (
    <Form action={formAction} className="rounded-[var(--radius-panel)] border border-line bg-paper p-4">
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <p className="font-medium">Lisää vuokralainen</p>
      <div className="mt-3 flex flex-col gap-3">
        <div>
          <label htmlFor={`${prefix}-name`} className="text-sm">
            Vuokralaisen nimi
          </label>
          <input
            id={`${prefix}-name`}
            name="name"
            type="text"
            autoComplete="off"
            required
            aria-invalid={state.errors?.name ? true : undefined}
            aria-describedby={state.errors?.name ? `${prefix}-name-virhe` : undefined}
            className={
              "mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border bg-paper px-3 text-base " +
              (state.errors?.name ? "border-coral" : "border-line")
            }
          />
          {state.errors?.name ? (
            <p id={`${prefix}-name-virhe`} className="mt-1.5 text-sm text-coral">
              {state.errors.name}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor={`${prefix}-email`} className="text-sm">
            Vuokralaisen sähköposti
          </label>
          <input
            id={`${prefix}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            aria-invalid={state.errors?.email ? true : undefined}
            aria-describedby={state.errors?.email ? `${prefix}-email-virhe` : undefined}
            className={
              "mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border bg-paper px-3 text-base " +
              (state.errors?.email ? "border-coral" : "border-line")
            }
          />
          {state.errors?.email ? (
            <p id={`${prefix}-email-virhe`} className="mt-1.5 text-sm text-coral">
              {state.errors.email}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
        >
          {pending ? "Lähetetään…" : "Lähetä kutsu"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
        >
          Peruuta
        </button>
      </div>
      {state.message ? (
        <p role="alert" className="mt-3 text-sm text-coral">
          {state.message}
        </p>
      ) : null}
    </Form>
  );
}
