"use client";

import { useActionState, useState } from "react";
import {
  cancelAction,
  commentAction,
  resolveAction,
  type MaintenanceActionState,
} from "@/app/vuokrasuhteet/maintenance-actions";

const initialState: MaintenanceActionState = {};

/**
 * Merkinnän kommentointi, korjatuksi merkintä ja peruminen.
 *
 * ===========================================================================
 * KORJATUKSI MERKITSEMINEN EI SULJE KESKUSTELUA
 *
 * Kommenttikenttä jää näkyviin senkin jälkeen, kun vika on merkitty
 * korjatuksi. Vuokralainen voi olla eri mieltä siitä, onko se korjattu — ja
 * juuri se erimielisyys on se, joka loppukatselmuksessa halutaan nähdä.
 *
 * PERUMINEN ON KIRJOITTAJAN, EI TOISEN
 *
 * Vain merkinnän kirjoittaja voi perua sen. Toisen merkinnän peruminen olisi
 * sen hiljentämistä, ja huoltokirjan arvo perustuu siihen, ettei kumpikaan
 * voi pyyhkiä toisen havaintoa.
 * ===========================================================================
 */
export function MaintenanceEntryActions({
  tenancyId,
  entryId,
  isLandlord,
  isAuthor,
  resolved,
  cancelled,
}: {
  tenancyId: string;
  entryId: string;
  isLandlord: boolean;
  isAuthor: boolean;
  resolved: boolean;
  cancelled: boolean;
}) {
  const [commentState, comment, commentPending] = useActionState(commentAction, initialState);
  const [resolveState, resolve, resolvePending] = useActionState(resolveAction, initialState);
  const [cancelState, cancel, cancelPending] = useActionState(cancelAction, initialState);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (cancelled) return null;

  return (
    <div className="mt-8 flex flex-col gap-6">
      <form action={comment} className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <input type="hidden" name="tenancyId" value={tenancyId} />
        <input type="hidden" name="entryId" value={entryId} />

        <label htmlFor="huolto-kommentti" className="font-medium">
          Kommentti
        </label>
        <textarea
          id="huolto-kommentti"
          name="body"
          rows={3}
          maxLength={300}
          placeholder="Esimerkiksi: huoltomies käy torstaina"
          className="mt-2 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
        />
        <p className="mt-1.5 text-sm text-ink/60">
          Enintään 300 merkkiä. Kommentti näkyy toiselle osapuolelle, eikä sitä voi poistaa.
        </p>

        {commentState.message ? (
          <p role="alert" className="mt-2 text-sm text-coral">
            {commentState.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={commentPending}
          className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm disabled:opacity-60"
        >
          {commentPending ? "Lähetetään…" : "Lähetä kommentti"}
        </button>
      </form>

      {isLandlord && !resolved ? (
        <form
          action={resolve}
          className="rounded-[var(--radius-panel)] border border-line bg-paper p-5"
        >
          <input type="hidden" name="tenancyId" value={tenancyId} />
          <input type="hidden" name="entryId" value={entryId} />

          <p className="font-medium">Onko tämä hoidettu?</p>
          <p className="mt-2 text-sm text-ink/70">
            Merkintä jää huoltokirjaan, ja vuokralainen saa tiedon. Hän voi kommentoida, jos on
            eri mieltä.
          </p>

          {resolveState.message ? (
            <p role="alert" className="mt-2 text-sm text-coral">
              {resolveState.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={resolvePending}
            className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
          >
            {resolvePending ? "Merkitään…" : "Merkitse korjatuksi"}
          </button>
        </form>
      ) : null}

      {isAuthor ? (
        <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          {cancelOpen ? (
            <form action={cancel}>
              <input type="hidden" name="tenancyId" value={tenancyId} />
              <input type="hidden" name="entryId" value={entryId} />

              <p className="font-medium">Peru merkintä</p>
              <p className="mt-2 text-sm text-ink/70">
                Merkintä ei poistu. Se jää huoltokirjaan peruttuna, ja syy näkyy toiselle
                osapuolelle.
              </p>

              <label htmlFor="perumisen-syy" className="sr-only">
                Syy
              </label>
              <input
                id="perumisen-syy"
                name="reason"
                maxLength={300}
                placeholder="Esimerkiksi: kirjasin vahingossa väärään vuokrasuhteeseen"
                className="mt-3 min-h-[var(--size-touch)] w-full rounded-[10px] border border-line bg-paper px-3 text-base"
              />

              {cancelState.message ? (
                <p role="alert" className="mt-2 text-sm text-coral">
                  {cancelState.message}
                </p>
              ) : null}

              <div className="mt-4 flex gap-3">
                <button
                  type="submit"
                  disabled={cancelPending}
                  className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm disabled:opacity-60"
                >
                  {cancelPending ? "Perutaan…" : "Peru merkintä"}
                </button>
                <button
                  type="button"
                  onClick={() => setCancelOpen(false)}
                  className="inline-flex min-h-[var(--size-touch)] items-center px-2 text-sm text-ink/60"
                >
                  Älä peru
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="text-sm text-ink/50 underline underline-offset-4"
            >
              Kirjasin tämän vahingossa
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
