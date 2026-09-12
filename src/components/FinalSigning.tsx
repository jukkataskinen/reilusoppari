"use client";

import { useActionState } from "react";
import {
  sendFinalForSigningAction,
  type SigningActionState,
} from "@/app/vuokrasuhteet/signing-actions";

const initialState: SigningActionState = {};

const SIGNER_STATUS: Record<string, string> = {
  pending: "Ei ole vielä avannut",
  opened: "On avannut pöytäkirjan",
  identified: "On tunnistautunut",
  signed: "On allekirjoittanut",
  declined: "On kieltäytynyt",
};

/**
 * Loppukatselmuksen pöytäkirjan allekirjoitus (CLAUDE.md 5.8).
 *
 * ===========================================================================
 * ARVIOT VASTA ALLEKIRJOITUKSEN JÄLKEEN
 *
 * Sivulla sanotaan ääneen, mitä allekirjoituksesta seuraa: vuokrasuhde
 * päättyy ja vasta sitten kumpikin antaa toisestaan arvion.
 *
 * Järjestys ei ole tekninen yksityiskohta. Arvio ennen allekirjoitusta olisi
 * painostuskeino — "allekirjoita, niin saat hyvän arvion". Allekirjoituksen
 * jälkeen kumpikaan ei voi enää muuttaa toisen tilannetta.
 * ===========================================================================
 */
export function FinalSigning({
  tenancyId,
  isLandlord,
  locked,
  signers,
}: {
  tenancyId: string;
  isLandlord: boolean;
  locked: boolean;
  /** Kierroksen allekirjoittajat, tai `null` jos kierrosta ei ole lähetetty. */
  signers: Array<{ id: string; name: string; roleLabel: string | null; status: string }> | null;
}) {
  const [state, formAction, pending] = useActionState(sendFinalForSigningAction, initialState);

  if (signers) {
    return (
      <div className="mt-4 rounded-[10px] border border-line bg-canvas p-4">
        <p className="text-sm font-medium">Pöytäkirja on allekirjoitettavana</p>
        <ul className="mt-3 flex flex-col gap-2">
          {signers.map((signer) => (
            <li key={signer.id} className="flex items-baseline justify-between gap-4 text-sm">
              <span>
                {signer.name}
                {signer.roleLabel ? <span className="text-ink/60"> · {signer.roleLabel}</span> : null}
              </span>
              <span className="shrink-0 text-ink/60">
                {SIGNER_STATUS[signer.status] ?? signer.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!locked) return null;

  if (!isLandlord) {
    return (
      <p className="mt-4 text-sm text-ink/60">
        Vuokranantaja lähettää pöytäkirjan allekirjoitettavaksi. Saat oman linkkisi
        sähköpostiisi.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="tenancyId" value={tenancyId} />

      <p className="text-sm text-ink/70">
        Allekirjoituksen jälkeen vuokrasuhde on päättynyt, ja kumpikin antaa toisestaan arvion.
        Arviota ei voi antaa ennen allekirjoitusta.
      </p>

      {state.message ? (
        <p role="alert" className="mt-2 text-sm text-coral">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
      >
        {pending ? "Lähetetään…" : "Lähetä pöytäkirja allekirjoitettavaksi"}
      </button>
    </form>
  );
}
