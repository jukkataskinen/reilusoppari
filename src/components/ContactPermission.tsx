"use client";

import { useActionState, useState } from "react";
import {
  setContactPermissionAction,
  type ContactActionState,
} from "@/app/vuokrasuhteet/contact-actions";

const initialState: ContactActionState = {};

/**
 * Yhteydenottolupa todistuksessa (CLAUDE.md 5.10).
 *
 * ===========================================================================
 * KAKSI ERI NÄKYMÄÄ SAMASTA ASIASTA
 *
 * Todistuksen ANTAJA näkee valintaruudun: lupa koskee hänen omaa
 * tavoitettavuuttaan, ja vain hän voi antaa tai perua sen.
 *
 * Todistuksen OMISTAJA näkee luvan tilan muttei voi muuttaa sitä. Hänen on
 * tiedettävä se ennen kuin hän jakaa todistuksen — hänen on tiedettävä, mitä
 * hän jakaa.
 *
 * PERUMINEN SULKEE AVOIMET KESKUSTELUT
 *
 * Mutta ei poista viestejä: ne jäävät näkyviin myös sille, jota keskustelu
 * koskee. Poisto olisi tiedon vieminen häneltä.
 * ===========================================================================
 */
export function ContactPermission({
  tenancyId,
  certificateId,
  /** Voiko kirjautunut käyttäjä muuttaa lupaa (onko hän todistuksen antaja)? */
  canChange,
  allowed,
  revokedAt,
  openedCount,
  maxMessages,
}: {
  tenancyId: string;
  certificateId: string;
  canChange: boolean;
  allowed: boolean;
  revokedAt: string | null;
  openedCount: number;
  maxMessages: number;
}) {
  const [state, save, pending] = useActionState(setContactPermissionAction, initialState);
  const [checked, setChecked] = useState(allowed);

  if (!canChange) {
    return (
      <div className="mt-5 rounded-[10px] border border-line bg-canvas p-4">
        <p className="text-sm text-ink/60">Yhteydenotto</p>
        <p className="mt-1 text-sm">
          {allowed
            ? "Todistuksen antaja on sallinut, että häneltä voi kysyä lisää tästä " +
              "vuokrasuhteesta. Jakolinkin avaaja näkee ”Kysy lisää” -napin, ja " +
              "näet keskustelut kokonaisuudessaan."
            : "Todistuksen antaja ei ole sallinut yhteydenottoa. Jakolinkki näyttää vain " +
              "todistuksen."}
        </p>
      </div>
    );
  }

  return (
    <form action={save} className="mt-5 rounded-[10px] border border-line p-4">
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <input type="hidden" name="certificateId" value={certificateId} />

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="allowed"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-0.5 size-5 shrink-0"
        />
        <span>
          <span className="font-medium">Saa ottaa minuun yhteyttä tästä vuokrasuhteesta</span>
          <span className="mt-1 block text-ink/70">
            Todistuksen saaja näkee jakolinkissä napin, josta voi kysyä lisää. Keskustelu
            käydään tässä palvelussa, kysyjän on tunnistauduttava, eikä kummankaan
            yhteystietoja näytetä toiselle. Se, jota keskustelu koskee, näkee sen
            kokonaisuudessaan. Voit perua luvan milloin tahansa.
          </span>
        </span>
      </label>

      {revokedAt ? (
        <p className="mt-3 text-sm text-ink/60">
          Lupa on peruttu, ja avoimet keskustelut on suljettu uusilta viesteiltä.
        </p>
      ) : allowed ? (
        <p className="mt-3 text-sm text-ink/60">
          Keskusteluja avattu {openedCount}/{maxMessages}.
        </p>
      ) : null}

      {state.message ? (
        <p role="alert" className="mt-2 text-sm text-coral">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || checked === allowed}
        className="mt-3 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm disabled:opacity-60"
      >
        {pending ? "Tallennetaan…" : checked ? "Salli yhteydenotto" : "Peru lupa"}
      </button>
    </form>
  );
}
