"use client";

import { useActionState } from "react";
import { sendForSigningAction, type SigningActionState } from "@/app/vuokrasuhteet/signing-actions";

const initialState: SigningActionState = {};

/**
 * Asiakirjojen lähetys allekirjoitettavaksi.
 *
 * Este kerrotaan, ei piiloteta: kun jokin puuttuu, nappi on pois käytöstä ja
 * puuttuvat kohdat lukevat sen vieressä. Piilotettu nappi näyttäisi siltä,
 * ettei ominaisuutta ole olemassa.
 */
export function SendForSigning({
  tenancyId,
  ready,
  message,
  missing,
}: {
  tenancyId: string;
  ready: boolean;
  message: string | null;
  missing: string[];
}) {
  const [state, formAction, pending] = useActionState(sendForSigningAction, initialState);

  return (
    <form action={formAction} className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      <input type="hidden" name="tenancyId" value={tenancyId} />

      <p className="font-medium">Lähetä allekirjoitettavaksi</p>
      <p className="mt-2 text-sm text-ink/70">
        Molemmat osapuolet saavat oman linkkinsä sähköpostiinsa. Allekirjoitus tehdään
        pankkitunnuksilla tai mobiilivarmenteella.
      </p>

      {message ? (
        <div className="mt-4 rounded-[10px] border border-line bg-canvas p-3 text-sm text-ink/70">
          <p>{message}</p>
          {missing.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {missing.map((item) => (
                <li key={item}>· {item}</li>
              ))}
            </ul>
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
        {pending ? "Lähetetään…" : "Lähetä allekirjoitettavaksi"}
      </button>
    </form>
  );
}
