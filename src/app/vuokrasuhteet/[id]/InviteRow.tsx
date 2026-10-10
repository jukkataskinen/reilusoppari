"use client";

import { useActionState, useId, useState } from "react";
import {
  changeInviteEmailAction,
  removeInviteAction,
  resendInviteAction,
  type InviteRowState,
} from "../actions";
import { Form } from "@/components/Form";

const initialState: InviteRowState = {};

const SECONDARY =
  "inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm disabled:opacity-60";

/**
 * Kutsuttu vuokralainen ja kutsun hallinta (Jukan havainto 10.10.2026).
 *
 * Vuokranantaja voi liittymättömälle vuokralaiselle
 * - lähettää kutsun uudelleen samaan osoitteeseen,
 * - korjata sähköpostiosoitteen (kutsu lähtee uuteen osoitteeseen),
 * - poistaa kutsun vahvistuksen jälkeen.
 *
 * Liittyneelle ei näytetä mitään näistä: hän hallitsee omaa tiliään.
 *
 * Poikkeus: jos vuokralaisen paikalle on liittynyt vuokranantaja itse
 * (`selfJoined`, kutsu omaan osoitteeseen vahingossa), paikka on korjattava.
 * Silloin näytetään selitys sekä Korjaa sähköposti ja Poista kutsu, mutta
 * ei uudelleenlähetystä: se lähtisi taas omaan osoitteeseen.
 *
 * Uusi linkki näytetään tässä eikä ohjata minnekään: tunniste ei saa päätyä
 * osoiteriville (ks. `actions.ts`). Vanhan linkin mitätöityminen sanotaan
 * ääneen, koska vuokranantaja on voinut jo lähettää sen.
 */
export function InviteRow({
  tenancyId,
  partyId,
  email,
  joined,
  selfJoined = false,
  editable,
}: {
  tenancyId: string;
  partyId: string;
  email: string;
  joined: boolean;
  /** Vuokranantaja on liittynyt vuokralaisen paikalle omalla tilillään. */
  selfJoined?: boolean;
  /** Voiko osoitetta vielä korjata ja kutsun poistaa (ennen allekirjoitusta). */
  editable: boolean;
}) {
  const [resendState, resendAction, resendPending] = useActionState(
    resendInviteAction,
    initialState,
  );
  const [changeState, changeAction, changePending] = useActionState(
    changeInviteEmailAction,
    initialState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeInviteAction,
    initialState,
  );
  const [mode, setMode] = useState<"none" | "change" | "remove">("none");
  const prefix = useId();

  // Uusin onnistunut kutsu: sähköpostin korjaus menee uudelleenlähetyksen
  // edelle, koska se muuttaa osoitteen, jota rivi näyttää.
  const issued = changeState.issued ?? resendState.issued;
  const emailError = changeState.errors?.email;

  if (removeState.removed) {
    return (
      <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4" role="status">
        <p className="font-medium">Kutsu poistettu</p>
        <p className="mt-1 text-sm text-ink/60">Vanha kutsulinkki ei enää toimi.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4">
      <p className="font-medium break-all">{issued?.email ?? email}</p>
      <p className="mt-0.5 text-sm text-ink/60">
        {joined ? "Liittynyt" : "Ei ole vielä liittynyt"}
      </p>

      {selfJoined && !issued ? (
        <p className="mt-3 rounded-[10px] bg-cloud p-3 text-sm">
          Olet liittynyt omaan vuokrasuhteeseesi vuokralaisena. Korjaa vuokralaisen sähköposti,
          niin kutsu lähtee oikealle henkilölle.
          {editable
            ? null
            : " Sopimus on jo lähetetty allekirjoitettavaksi, joten korjaus ei onnistu täältä. Ota yhteyttä tukeen."}
        </p>
      ) : null}

      {joined ? null : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {selfJoined ? null : (
              <Form action={resendAction}>
                <input type="hidden" name="tenancyId" value={tenancyId} />
                <input type="hidden" name="partyId" value={partyId} />
                <button type="submit" disabled={resendPending} className={SECONDARY}>
                  {resendPending ? "Lähetetään…" : "Lähetä kutsu uudelleen"}
                </button>
              </Form>
            )}
            {editable ? (
              <>
                <button
                  type="button"
                  onClick={() => setMode(mode === "change" ? "none" : "change")}
                  aria-expanded={mode === "change"}
                  className={SECONDARY}
                >
                  Korjaa sähköposti
                </button>
                <button
                  type="button"
                  onClick={() => setMode(mode === "remove" ? "none" : "remove")}
                  aria-expanded={mode === "remove"}
                  className={SECONDARY}
                >
                  Poista kutsu
                </button>
              </>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-ink/60">
            Uusi kutsu mitätöi aiemman linkin. Jos olet jo lähettänyt vanhan, se lakkaa toimimasta.
          </p>

          {mode === "change" && editable ? (
            <Form action={changeAction} className="mt-4 flex flex-col gap-3">
              <input type="hidden" name="tenancyId" value={tenancyId} />
              <input type="hidden" name="partyId" value={partyId} />
              <div>
                <label htmlFor={`${prefix}-email`} className="text-sm">
                  Oikea sähköpostiosoite
                </label>
                <input
                  id={`${prefix}-email`}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  required
                  // Oma osoite ei kelpaa, joten sitä ei tarjota valmiiksi.
                  defaultValue={selfJoined && !issued ? "" : (issued?.email ?? email)}
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError ? `${prefix}-email-virhe` : undefined}
                  className={
                    "mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border bg-paper px-3 text-base " +
                    (emailError ? "border-coral" : "border-line")
                  }
                />
                {emailError ? (
                  <p id={`${prefix}-email-virhe`} className="mt-1.5 text-sm text-coral">
                    {emailError}
                  </p>
                ) : null}
                <p className="mt-1.5 text-sm text-ink/60">
                  Kutsu lähtee uuteen osoitteeseen, ja vanha linkki lakkaa toimimasta.
                </p>
              </div>
              <button
                type="submit"
                disabled={changePending}
                className="inline-flex min-h-[var(--size-touch)] items-center self-start rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
              >
                {changePending ? "Tallennetaan…" : "Tallenna ja lähetä kutsu"}
              </button>
            </Form>
          ) : null}

          {mode === "remove" && editable ? (
            <Form action={removeAction} className="mt-4 rounded-[10px] bg-cloud p-4">
              <input type="hidden" name="tenancyId" value={tenancyId} />
              <input type="hidden" name="partyId" value={partyId} />
              <input type="hidden" name="confirm" value="yes" />
              <p className="text-sm">
                Poistetaanko kutsu? Vuokralainen poistuu vuokrasuhteesta, eikä kutsulinkki enää
                toimi.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={removePending}
                  className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-coral px-5 text-sm font-medium text-coral disabled:opacity-60"
                >
                  {removePending ? "Poistetaan…" : "Kyllä, poista kutsu"}
                </button>
                <button type="button" onClick={() => setMode("none")} className={SECONDARY}>
                  Peruuta
                </button>
              </div>
            </Form>
          ) : null}
        </>
      )}

      {issued ? (
        <div className="mt-4" role="status">
          <p className="text-sm font-medium break-all">
            {issued.emailSent
              ? `Kutsu lähetetty osoitteeseen ${issued.email}.`
              : `Sähköpostia ei voitu lähettää osoitteeseen ${issued.email}. Lähetä alla oleva linkki vuokralaiselle itse.`}
          </p>
          <p className="mt-2 text-sm text-ink/60">Uusi kutsulinkki — näytetään vain nyt</p>
          <p className="mt-1 break-all rounded-[10px] bg-cloud p-3 font-mono text-sm">
            {issued.url}
          </p>
        </div>
      ) : null}

      {[resendState.message, changeState.message, removeState.message]
        .filter((message): message is string => Boolean(message))
        .map((message) => (
          <p key={message} role="alert" className="mt-3 text-sm text-coral">
            {message}
          </p>
        ))}
    </div>
  );
}
