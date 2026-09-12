"use client";

import { useActionState } from "react";
import { addContractCommentAction, type CommentActionState } from "@/app/vuokrasuhteet/contract-actions";
import type { ContractComment } from "@/lib/db/contracts";

const initialState: CommentActionState = {};

function formatMoment(iso: string): string {
  return new Date(iso).toLocaleString("fi-FI", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Keskustelu sopimusluonnoksesta (CLAUDE.md 5.2).
 *
 * ===========================================================================
 * KESKUSTELU NÄKYY MOLEMMILLE KOKONAAN
 *
 * Vuokralainen ei muokkaa sopimusta. Hän kertoo tässä, mitä haluaisi muuttaa,
 * ja vuokranantaja muokkaa ehtoja — esikatselu päivittyy.
 *
 * Kumpikin saa kommentoida ja kumpikin näkee kaiken. Kommenttia ei voi
 * poistaa: jos voisi, keskustelu kertoisi vain sen, mitä poistamatta
 * jättänyt halusi sen kertovan.
 * ===========================================================================
 */
export function ContractComments({
  tenancyId,
  comments,
  isLandlord,
}: {
  tenancyId: string;
  comments: ContractComment[];
  isLandlord: boolean;
}) {
  const [state, formAction, pending] = useActionState(addContractCommentAction, initialState);

  return (
    <section className="mt-8 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      <h2 className="font-medium">
        {isLandlord ? "Vuokralaisen toiveet" : "Haluatko muutoksia?"}
      </h2>
      <p className="mt-2 text-sm text-ink/70">
        {isLandlord
          ? "Vuokralainen ei muokkaa sopimusta itse. Jos hän ehdottaa muutosta, muuta ehtoja ja esikatselu päivittyy."
          : "Kerro tässä, mitä haluaisit muuttaa. Vuokranantaja muokkaa sopimusta, ja esikatselu päivittyy. Kumpikaan ei allekirjoita ennen kuin alkukatselmus on tehty."}
      </p>

      {comments.length > 0 ? (
        <ul className="mt-5 flex flex-col gap-4">
          {comments.map((comment) => (
            <li key={comment.id}>
              <p className="text-sm text-ink/60">
                {comment.authorName ??
                  (comment.authorRole === "landlord" ? "Vuokranantaja" : "Vuokralainen")}
                {comment.isSelf ? " (sinä)" : ""} · {formatMoment(comment.createdAt)}
              </p>
              <p className="mt-1">{comment.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-sm text-ink/60">Ei vielä kommentteja.</p>
      )}

      <form action={formAction} className="mt-6">
        <input type="hidden" name="tenancyId" value={tenancyId} />

        <label htmlFor="sopimuskommentti" className="sr-only">
          Kommentti
        </label>
        <textarea
          id="sopimuskommentti"
          name="body"
          rows={3}
          maxLength={300}
          placeholder={
            isLandlord ? "Vastaa vuokralaiselle" : "Esimerkiksi: voisiko lemmikit sallia?"
          }
          className="w-full rounded-[10px] border border-line bg-paper p-3 text-base"
        />
        <p className="mt-1.5 text-sm text-ink/60">Enintään 300 merkkiä. Kommenttia ei voi poistaa.</p>

        {state.message ? (
          <p role="alert" className="mt-2 text-sm text-coral">
            {state.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm disabled:opacity-60"
        >
          {pending ? "Lähetetään…" : "Lähetä kommentti"}
        </button>
      </form>
    </section>
  );
}
