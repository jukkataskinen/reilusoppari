"use client";

import { useActionState } from "react";
import {
  sendConversationMessageAction,
  type ContactActionState,
} from "@/app/vuokrasuhteet/contact-actions";
import { MESSAGE_MAX_LENGTH } from "@/lib/certificates/contact";

const initialState: ContactActionState = {};

/**
 * Viestin kirjoitus keskusteluun.
 *
 * Muistutus siitä, kuka viestin näkee, on lomakkeen vieressä eikä ohjesivulla:
 * se on tieto, joka vaikuttaa siihen mitä kirjoitetaan, ja siksi se kuuluu
 * siihen hetkeen, jossa kirjoitetaan.
 */
export function ConversationForm({ conversationId }: { conversationId: string }) {
  const [state, send, pending] = useActionState(sendConversationMessageAction, initialState);

  return (
    <form action={send} className="mt-6">
      <input type="hidden" name="conversationId" value={conversationId} />

      <label htmlFor="viesti" className="block text-sm font-medium">
        Kirjoita viesti
      </label>
      <textarea
        id="viesti"
        name="body"
        rows={4}
        maxLength={MESSAGE_MAX_LENGTH}
        key={state.done ? "lahetetty" : "luonnos"}
        className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
      />
      <p className="mt-1.5 text-sm text-ink/60">
        Enintään {MESSAGE_MAX_LENGTH} merkkiä. Viestin näkee myös se, jota keskustelu koskee.
      </p>

      {state.message ? (
        <p role="alert" className="mt-2 text-sm text-coral">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-3 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
      >
        {pending ? "Lähetetään…" : "Lähetä"}
      </button>
    </form>
  );
}
