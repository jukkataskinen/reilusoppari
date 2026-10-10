"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  sendInspectionForSigningAction,
  type SigningActionState,
} from "@/app/vuokrasuhteet/signing-actions";
import { Form } from "@/components/Form";

const initialState: SigningActionState = {};

/**
 * Alkukatselmuksen pöytäkirjan lähetys omana kierroksenaan
 * (Jukan päätös 10.10.2026).
 *
 * Sopimus on jo lähetetty. Kun katselmus on lukittu, vuokranantaja lähettää
 * pöytäkirjan samoille allekirjoittajille. Este kerrotaan napin vieressä eikä
 * nappia piiloteta, kuten sopimuksen lähetyksessä.
 */
export function InspectionSigning({
  tenancyId,
  ready,
  message,
  showInspectionLink,
}: {
  tenancyId: string;
  ready: boolean;
  message: string | null;
  /** Näytetäänkö linkki katselmukseen (kun lukitus puuttuu). */
  showInspectionLink: boolean;
}) {
  const [state, formAction, pending] = useActionState(sendInspectionForSigningAction, initialState);

  return (
    <Form action={formAction} className="mt-4 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      <input type="hidden" name="tenancyId" value={tenancyId} />

      <p className="text-sm text-ink/70">
        Pöytäkirja allekirjoitetaan omana kierroksenaan samalla tavalla kuin sopimus. Siitä ei
        makseta erikseen.
      </p>

      {message ? (
        <div className="mt-4 rounded-[10px] border border-line bg-canvas p-3 text-sm text-ink/70">
          <p>{message}</p>
          {showInspectionLink ? (
            <Link
              href={`/vuokrasuhteet/${tenancyId}/katselmus`}
              className="mt-3 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line bg-paper px-5 text-sm"
            >
              Avaa alkukatselmus
            </Link>
          ) : null}
        </div>
      ) : null}

      {state.message ? (
        <p role="alert" className="mt-4 text-sm text-coral">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!ready || pending}
        className="mt-5 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-6 font-medium text-paper disabled:opacity-50"
      >
        {pending ? "Lähetetään…" : "Lähetä pöytäkirja allekirjoitettavaksi"}
      </button>
    </Form>
  );
}
