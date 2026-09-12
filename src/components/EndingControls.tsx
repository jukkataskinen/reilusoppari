"use client";

import { useActionState, useState } from "react";
import {
  recordDepositAction,
  recordNoticeAction,
  type EndingActionState,
} from "@/app/vuokrasuhteet/ending-actions";

const initialState: EndingActionState = {};

function päivä(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${Number(day)}.${Number(month)}.${year}`;
}

/**
 * Irtisanominen ja vakuuden palautus.
 *
 * ===========================================================================
 * PÄÄTTYMISPÄIVÄ NÄYTETÄÄN ENNEN KUIN MITÄÄN KIRJATAAN
 *
 * Irtisanomisaika ei ala irtisanomispäivästä vaan sen kalenterikuukauden
 * viimeisestä päivästä (AHVL 481/1995). Se on kohta, jonka ihmiset laskevat
 * väärin, ja väärä käsitys päättymispäivästä johtaa siihen, että muutto
 * suunnitellaan väärälle viikolle.
 *
 * Siksi päivämäärä lasketaan ja näytetään ennen vahvistusta, ja vahvistus
 * vaatii erillisen napin painalluksen — irtisanominen ei ole toiminto, joka
 * saa tapahtua vahingossa.
 * ===========================================================================
 */
export function EndingControls({
  tenancyId,
  isLandlord,
  canGiveNotice,
  blockedMessage,
  endsAt,
  months,
  depositAmount,
  depositReturnedAt,
}: {
  tenancyId: string;
  isLandlord: boolean;
  canGiveNotice: boolean;
  blockedMessage: string | null;
  /** Laskettu päättymispäivä, jos irtisanominen on mahdollinen. */
  endsAt: string | null;
  months: number | null;
  depositAmount: number | null;
  depositReturnedAt: string | null;
}) {
  const [noticeState, noticeAction, noticePending] = useActionState(
    recordNoticeAction,
    initialState,
  );
  const [depositState, depositAction, depositPending] = useActionState(
    recordDepositAction,
    initialState,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mt-6 flex flex-col gap-6">
      {canGiveNotice ? (
        <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <p className="font-medium">Irtisano vuokrasuhde</p>
          <p className="mt-2 text-sm text-ink/70">
            Irtisanomisaika on {months} {months === 1 ? "kuukausi" : "kuukautta"}, ja se lasketaan
            tämän kuukauden viimeisestä päivästä. Vuokrasuhde päättyisi{" "}
            <span className="font-medium">{endsAt ? päivä(endsAt) : ""}</span>.
          </p>
          <p className="mt-2 text-sm text-ink/60">
            Ennen päättymistä tehdään loppukatselmus samoista tiloista kuin alussa, ja molemmat
            saavat oman vuokratodistuksensa.
          </p>

          {noticeState.message ? (
            <p role="alert" className="mt-3 text-sm text-coral">
              {noticeState.message}
            </p>
          ) : null}

          {confirmOpen ? (
            <form action={noticeAction} className="mt-4">
              <input type="hidden" name="tenancyId" value={tenancyId} />
              <p className="text-sm">
                Kirjataanko irtisanominen? Toinen osapuoli saa siitä heti tiedon, eikä merkintää
                voi perua sovelluksessa.
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  type="submit"
                  disabled={noticePending}
                  className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
                >
                  {noticePending ? "Kirjataan…" : "Kyllä, irtisano"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="inline-flex min-h-[var(--size-touch)] items-center px-2 text-sm text-ink/60"
                >
                  Peruuta
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
            >
              Irtisano
            </button>
          )}
        </div>
      ) : blockedMessage ? (
        <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <p className="font-medium">Irtisanominen</p>
          <p className="mt-2 text-sm text-ink/70">{blockedMessage}</p>
        </div>
      ) : null}

      {isLandlord && !depositReturnedAt && depositAmount ? (
        <form
          action={depositAction}
          className="rounded-[var(--radius-panel)] border border-line bg-paper p-5"
        >
          <input type="hidden" name="tenancyId" value={tenancyId} />

          <p className="font-medium">Vakuuden palautus</p>
          <p className="mt-2 text-sm text-ink/70">
            Vakuus on {depositAmount} €. Kirjaa päivä ja summa, kun olet palauttanut sen.
            Vuokralainen näkee merkinnän, ja se tulee vuokratodistukseen.
          </p>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row">
            <div className="sm:w-[11rem]">
              <label htmlFor="vakuus-paiva" className="text-sm font-medium">
                Päivä
              </label>
              <input
                id="vakuus-paiva"
                name="date"
                type="date"
                defaultValue={today}
                className="mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border border-line bg-paper px-3 text-base"
              />
            </div>
            <div className="sm:w-[10rem]">
              <label htmlFor="vakuus-summa" className="text-sm font-medium">
                Summa (€)
              </label>
              <input
                id="vakuus-summa"
                name="amount"
                inputMode="decimal"
                defaultValue={String(depositAmount)}
                className="mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border border-line bg-paper px-3 text-base"
              />
            </div>
          </div>

          <p className="mt-2 text-sm text-ink/60">
            Jos palautat vähemmän kuin vakuus, kerro syy huoltokirjassa. Silloin perusteet ovat
            samassa paikassa kuin havainnot, joihin ne nojaavat.
          </p>

          {depositState.message ? (
            <p role="alert" className="mt-3 text-sm text-coral">
              {depositState.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={depositPending}
            className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
          >
            {depositPending ? "Kirjataan…" : "Kirjaa palautus"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
