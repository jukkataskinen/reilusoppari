"use client";

import { useActionState } from "react";
import {
  addRoomAction,
  lockInspectionAction,
  markReadyAction,
  type InspectionActionState,
} from "@/app/vuokrasuhteet/inspection-actions";

const initialState: InspectionActionState = {};

/**
 * Katselmuksen ohjauspainikkeet.
 *
 * ===========================================================================
 * LUKITSEMISEN ESTE KERROTAAN, EI PIILOTETA
 *
 * Kun vuokranantaja ei voi vielä lukita, nappi on pois käytöstä ja syy lukee
 * sen vieressä. Piilotettu nappi näyttäisi siltä, ettei ominaisuutta ole
 * olemassa, ja vuokranantaja etsisi sitä turhaan. Näkyvä este kertoo myös
 * sen, mitä sääntö suojaa: vuokralaisen mahdollisuutta lisätä omat kuvansa.
 * ===========================================================================
 */
export function InspectionControls({
  tenancyId,
  kind = "initial",
  isLandlord,
  locked,
  photoCount,
  lockMessage,
  canLock,
  alreadyReady,
  waitUntil,
}: {
  tenancyId: string;
  /** Alku- vai loppukatselmus. Ohjaa toiminnot oikeaan katselmukseen. */
  kind?: "initial" | "final";
  isLandlord: boolean;
  locked: boolean;
  photoCount: number;
  lockMessage: string | null;
  canLock: boolean;
  alreadyReady: boolean;
  waitUntil: string | null;
}) {
  const [readyState, readyAction, readyPending] = useActionState(markReadyAction, initialState);
  const [lockState, lockAction, lockPending] = useActionState(lockInspectionAction, initialState);
  const [roomState, roomAction] = useActionState(addRoomAction, initialState);

  if (locked) return null;

  return (
    <div className="mt-8 flex flex-col gap-6">
      <form action={roomAction} className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <label htmlFor="uusi-huone" className="text-sm font-medium">
          Puuttuuko listalta huone tai tila?
        </label>
        <input type="hidden" name="tenancyId" value={tenancyId} />
        <input type="hidden" name="kind" value={kind} />
        <input
          id="uusi-huone"
          name="room"
          maxLength={60}
          placeholder="Esimerkiksi vaatehuone tai autotalli"
          className="mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border border-line bg-paper px-3 text-base"
        />
        <p className="mt-1.5 text-sm text-ink/60">
          Lisätty tila on samanarvoinen listan huoneiden kanssa, ja se käydään läpi myös
          loppukatselmuksessa.
        </p>
        {roomState.message ? (
          <p role="alert" className="mt-3 text-sm text-coral">
            {roomState.message}
          </p>
        ) : null}
        <button
          type="submit"
          className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
        >
          Kuvaa tämä tila
        </button>
      </form>

      {isLandlord ? (
        <form action={lockAction} className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <input type="hidden" name="tenancyId" value={tenancyId} />
          <input type="hidden" name="kind" value={kind} />
          <p className="font-medium">Lukitse katselmus</p>
          <p className="mt-2 text-sm text-ink/70">
            {kind === "final"
              ? "Lukitus tekee kuvista pöytäkirjan, joka allekirjoitetaan. Sen jälkeen kuvia ei voi lisätä, ja vuorossa ovat arviot ja todistukset."
              : "Lukitus tekee kuvista pöytäkirjan, joka allekirjoitetaan sopimuksen kanssa. Sen jälkeen kuvia ei voi lisätä."}
          </p>

          {lockMessage ? (
            <p className="mt-3 rounded-[10px] border border-line bg-canvas p-3 text-sm text-ink/70">
              {lockMessage}
              {waitUntil ? (
                <>
                  {" "}
                  Aikaisintaan{" "}
                  {new Date(waitUntil).toLocaleString("fi-FI", {
                    day: "numeric",
                    month: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  .
                </>
              ) : null}
            </p>
          ) : null}

          {lockState.message ? (
            <p role="alert" className="mt-3 text-sm text-coral">
              {lockState.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canLock || lockPending}
            className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-6 font-medium text-paper disabled:opacity-50"
          >
            {lockPending ? "Lukitaan…" : "Lukitse katselmus"}
          </button>
        </form>
      ) : (
        <form action={readyAction} className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <input type="hidden" name="tenancyId" value={tenancyId} />
          <input type="hidden" name="kind" value={kind} />
          <p className="font-medium">Oletko valmis?</p>
          <p className="mt-2 text-sm text-ink/70">
            Kun merkitset olevasi valmis, vuokranantaja voi lukita katselmuksen. Siihen asti hän
            ei voi lukita sitä ennen kuin sinulla on ollut vuorokausi aikaa lisätä omat kuvasi.
          </p>

          {alreadyReady || readyState.done ? (
            <p className="mt-3 rounded-[10px] border border-line bg-canvas p-3 text-sm text-ink/70">
              Olet merkinnyt olevasi valmis. Voit silti lisätä kuvia, kunnes katselmus lukitaan.
            </p>
          ) : (
            <button
              type="submit"
              disabled={readyPending || photoCount === 0}
              className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-6 font-medium text-paper disabled:opacity-50"
            >
              {readyPending ? "Merkitään…" : "Olen valmis"}
            </button>
          )}

          {readyState.message ? (
            <p role="alert" className="mt-3 text-sm text-coral">
              {readyState.message}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
