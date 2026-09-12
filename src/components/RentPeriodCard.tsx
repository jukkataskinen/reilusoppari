"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  commentOnRentAction,
  confirmRentAction,
  type RentActionState,
} from "@/app/vuokrasuhteet/rent-actions";
import {
  editClosesAt,
  formatPeriodMonth,
  STATUS_LABEL,
  STATUS_SENTENCE,
  type ConfirmationStatus,
} from "@/lib/rent/confirmation";
import type { RentPeriodRow } from "@/lib/db/rent";

const initialState: RentActionState = {};

function euro(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const [whole, cents] = rounded.toFixed(rounded % 1 === 0 ? 0 : 2).split(".");
  return cents ? `${whole},${cents} €` : `${whole} €`;
}

function päivä(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${Number(day)}.${Number(month)}.${year}`;
}

/**
 * Yksi vuokrakausi: kuittaus tai kuittausnapit.
 *
 * ===========================================================================
 * KOLME NAPPIA, EI VALIKKOA
 *
 * Kuittaus tehdään puhelimella, usein ilmoituksen päältä, ja siihen saa
 * kulua sekunti. Valikko vaatisi kaksi kosketusta ja päätöksen siitä, mitä
 * vaihtoehtoja on olemassa — napit kertovat sen itse.
 *
 * "Osittain" avaa summakentän vasta valittaessa. Näkyvä kenttä houkuttelisi
 * täyttämään sen myös silloin, kun merkintä on "Kyllä".
 * ===========================================================================
 */
export function RentPeriodCard({
  tenancyId,
  period,
  isLandlord,
}: {
  tenancyId: string;
  period: RentPeriodRow;
  isLandlord: boolean;
}) {
  const [status, setStatus] = useState<ConfirmationStatus | null>(
    period.confirmation?.status ?? null,
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmRentAction,
    initialState,
  );
  const [commentState, commentAction, commentPending] = useActionState(
    commentOnRentAction,
    initialState,
  );

  const confirmation = period.confirmation;
  const canConfirm = isLandlord && period.editable;

  return (
    <li className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-medium">{formatPeriodMonth(period.periodMonth)}</h2>
        <p className="text-sm text-ink/60">
          {euro(period.amount)} · eräpäivä {päivä(period.dueDate)}
        </p>
      </div>

      {confirmation ? (
        <p className="mt-3 text-sm">
          {isLandlord ? (
            <>
              Merkintäsi: <span className="font-medium">{STATUS_LABEL[confirmation.status]}</span>
              {confirmation.amountPaid !== null ? ` · ${euro(confirmation.amountPaid)}` : ""}
            </>
          ) : (
            <>
              {STATUS_SENTENCE[confirmation.status]}
              {confirmation.amountPaid !== null
                ? ` Saapuneeksi merkitty ${euro(confirmation.amountPaid)}.`
                : ""}
            </>
          )}
        </p>
      ) : (
        <p className="mt-3 text-sm text-ink/60">
          {isLandlord ? "Kuittaamatta." : "Vuokranantaja ei ole vielä kuitannut tätä kuukautta."}
        </p>
      )}

      {canConfirm ? (
        <form action={confirmAction} className="mt-4">
          <input type="hidden" name="tenancyId" value={tenancyId} />
          <input type="hidden" name="periodId" value={period.id} />

          <fieldset className="border-0 p-0">
            <legend className="sr-only">
              Tuliko {formatPeriodMonth(period.periodMonth)} vuokra?
            </legend>
            <div className="flex gap-2">
              {(["paid", "not_yet", "partial"] as const).map((value) => (
                <label
                  key={value}
                  className={
                    "flex min-h-[var(--size-touch)] flex-1 cursor-pointer items-center justify-center rounded-full border px-3 text-sm " +
                    (status === value ? "border-ink bg-ink text-paper" : "border-line bg-paper")
                  }
                >
                  <input
                    type="radio"
                    name="status"
                    value={value}
                    defaultChecked={confirmation?.status === value}
                    onChange={() => setStatus(value)}
                    className="sr-only"
                  />
                  {STATUS_LABEL[value]}
                </label>
              ))}
            </div>
          </fieldset>

          {status === "partial" ? (
            <div className="mt-3">
              <label htmlFor={`summa-${period.id}`} className="text-sm">
                Paljonko tuli?
              </label>
              <input
                id={`summa-${period.id}`}
                name="amountPaid"
                inputMode="decimal"
                defaultValue={
                  confirmation?.amountPaid !== null && confirmation?.amountPaid !== undefined
                    ? String(confirmation.amountPaid)
                    : ""
                }
                placeholder="400"
                className="mt-1.5 min-h-[var(--size-touch)] w-[10rem] rounded-[10px] border border-line bg-paper px-3 text-base"
              />
            </div>
          ) : null}

          {confirmState.message ? (
            <p role="alert" className="mt-3 text-sm text-coral">
              {confirmState.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={confirmPending || status === null}
            className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-50"
          >
            {confirmPending ? "Tallennetaan…" : confirmation ? "Muuta merkintää" : "Kuittaa"}
          </button>

          {confirmation ? (
            <p className="mt-2 text-sm text-ink/60">
              Merkintää voi muuttaa {päivä(editClosesAt(confirmation.confirmedAt).toISOString())}{" "}
              asti.
            </p>
          ) : null}
        </form>
      ) : null}

      {isLandlord && confirmation && !period.editable ? (
        <p className="mt-3 text-sm text-ink/60">
          Merkintä on lukittu: sitä on voinut muuttaa 30 päivän ajan kuittauksesta.
        </p>
      ) : null}

      {period.tenantComment ? (
        <div className="mt-4 rounded-[10px] border border-line bg-canvas p-3">
          <p className="text-sm text-ink/60">Vuokralaisen kommentti</p>
          <p className="mt-1 text-sm">{period.tenantComment}</p>
        </div>
      ) : null}

      {!isLandlord && confirmation && !period.tenantComment ? (
        <form action={commentAction} className="mt-4">
          <input type="hidden" name="tenancyId" value={tenancyId} />
          <input type="hidden" name="periodId" value={period.id} />

          <label htmlFor={`kommentti-${period.id}`} className="text-sm">
            Haluatko kommentoida?
          </label>
          <textarea
            id={`kommentti-${period.id}`}
            name="comment"
            rows={2}
            maxLength={300}
            placeholder="Esimerkiksi: maksoin 4. päivä, viite saattoi puuttua"
            className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
          />

          {commentState.message ? (
            <p role="alert" className="mt-2 text-sm text-coral">
              {commentState.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={commentPending}
            className="mt-3 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm disabled:opacity-60"
          >
            {commentPending ? "Lähetetään…" : "Lähetä kommentti"}
          </button>
        </form>
      ) : null}
    </li>
  );
}
