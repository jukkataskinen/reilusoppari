"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { createTenancyAction, type TenancyFormState } from "@/app/vuokrasuhteet/actions";
import { EndOfTenancyNotice } from "@/components/EndOfTenancyNotice";
import { fi } from "@/i18n/fi";

const initialState: TenancyFormState = { errors: {} };

/**
 * Vuokrasuhteen luontilomake.
 *
 * Kaksi vuokralaista on mahdollista mutta ei oletus: toinen kenttäpari
 * avataan vasta pyydettäessä, jottei lomake näytä vaativan kahta.
 */
export function TenancyForm({ propertyId }: { propertyId: string }) {
  const [state, formAction, pending] = useActionState(createTenancyAction, initialState);
  const [twoTenants, setTwoTenants] = useState(false);
  const [fixedTerm, setFixedTerm] = useState(false);
  const prefix = useId();

  const field = (name: string) => {
    const id = `${prefix}-${name}`;
    const error = state.errors[name];
    return {
      id,
      name,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `${id}-virhe` : undefined,
      className:
        "mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border bg-paper px-3 text-base " +
        (error ? "border-coral" : "border-line"),
    };
  };

  const FieldError = ({ name }: { name: string }) => {
    const error = state.errors[name];
    if (!error) return null;
    return (
      <p id={`${prefix}-${name}-virhe`} className="mt-1.5 text-sm text-coral">
        {error}
      </p>
    );
  };

  /*
    Luonnin jälkeen ei ohjata minnekään: kutsulinkit ovat kertaluonteisia
    eivätkä ne saa päätyä osoiteriville (ks. actions.ts). Ne näytetään tässä.
  */
  if (state.created) {
    return <CreatedView state={state.created} />;
  }

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-6" noValidate>
      <input type="hidden" name="propertyId" value={propertyId} />

      {state.message ? (
        <p role="alert" className="rounded-[10px] border border-coral bg-paper p-3 text-sm">
          {state.message}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-4 border-0 p-0">
        <legend className="text-sm font-medium">
          {twoTenants ? fi.tenancy.tenants : fi.tenancy.tenant}
        </legend>

        <div>
          <label htmlFor={`${prefix}-tenantName0`} className="text-sm">
            Nimi
          </label>
          <input {...field("tenantName0")} autoComplete="off" required />
          <FieldError name="tenantName0" />
        </div>

        <div>
          <label htmlFor={`${prefix}-tenantEmail0`} className="text-sm">
            Sähköposti
          </label>
          <input {...field("tenantEmail0")} type="email" inputMode="email" required />
          <p className="mt-1.5 text-sm text-ink/60">
            Kutsu ja kirjautuminen menevät tähän osoitteeseen.
          </p>
          <FieldError name="tenantEmail0" />
        </div>

        {twoTenants ? (
          <>
            <div>
              <label htmlFor={`${prefix}-tenantName1`} className="text-sm">
                Toisen vuokralaisen nimi
              </label>
              <input {...field("tenantName1")} autoComplete="off" />
              <FieldError name="tenantName1" />
            </div>
            <div>
              <label htmlFor={`${prefix}-tenantEmail1`} className="text-sm">
                Toisen vuokralaisen sähköposti
              </label>
              <input {...field("tenantEmail1")} type="email" inputMode="email" />
              <FieldError name="tenantEmail1" />
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setTwoTenants(true)}
            className="self-start text-sm underline underline-offset-4"
          >
            Lisää toinen vuokralainen
          </button>
        )}
        <FieldError name="tenants" />
      </fieldset>

      <div className="flex gap-4">
        <div className="flex-1">
          <label htmlFor={`${prefix}-startDate`} className="text-sm font-medium">
            {fi.tenancy.startDate}
          </label>
          <input {...field("startDate")} type="date" required />
          <FieldError name="startDate" />
        </div>
        <div className="flex-1">
          <label htmlFor={`${prefix}-rentAmount`} className="text-sm font-medium">
            {fi.tenancy.rent} (€/kk)
          </label>
          <input {...field("rentAmount")} inputMode="decimal" placeholder="850" required />
          <FieldError name="rentAmount" />
        </div>
      </div>

      <div className="flex gap-4">
        <div className="w-[9rem]">
          <label htmlFor={`${prefix}-rentDueDay`} className="text-sm font-medium">
            {fi.tenancy.dueDay}
          </label>
          <input {...field("rentDueDay")} inputMode="numeric" placeholder="5" required />
          {/* Eräpäivä 31 taipuu lyhyemmissä kuukausissa (rent-periods.ts). */}
          <p className="mt-1.5 text-sm text-ink/60">Kuukauden päivä</p>
          <FieldError name="rentDueDay" />
        </div>
        <div className="flex-1">
          <label htmlFor={`${prefix}-depositAmount`} className="text-sm font-medium">
            {fi.tenancy.deposit} (€)
          </label>
          <input {...field("depositAmount")} inputMode="decimal" placeholder="1700" required />
          <FieldError name="depositAmount" />
        </div>
      </div>

      <div>
        <label className="flex min-h-[var(--size-touch)] items-center gap-3">
          <input
            type="checkbox"
            checked={fixedTerm}
            onChange={(event) => setFixedTerm(event.target.checked)}
            className="size-5"
          />
          <span className="text-sm">{fi.tenancy.fixedTerm}</span>
        </label>

        {fixedTerm ? (
          <div className="mt-3">
            <label htmlFor={`${prefix}-endDate`} className="text-sm font-medium">
              {fi.tenancy.endDate}
            </label>
            <input {...field("endDate")} type="date" />
            <FieldError name="endDate" />
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink/60">
            Sopimus on voimassa toistaiseksi. Irtisanomisaika sovitaan sopimuslomakkeella.
          </p>
        )}
      </div>

      <EndOfTenancyNotice />

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[var(--size-touch)] items-center justify-center rounded-full bg-ink px-6 font-medium text-paper disabled:opacity-60"
      >
        {pending ? "Luodaan…" : "Luo vuokrasuhde"}
      </button>
    </form>
  );
}

/** Luonnin jälkeinen näkymä: kutsulinkit kerran näytettävinä. */
function CreatedView({ state }: { state: NonNullable<TenancyFormState["created"]> }) {
  return (
    <div className="mt-8 flex flex-col gap-5">
      <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <p className="font-medium">Vuokrasuhde luotu</p>
        <p className="mt-2 text-sm text-ink/70">
          Lähetä kutsulinkki vuokralaiselle. <strong>Linkki näytetään vain nyt</strong> — sitä ei
          voi hakea myöhemmin, mutta uuden voi luoda vuokrasuhteen sivulla.
        </p>
      </div>

      {state.invites.map((invite) => (
        <div
          key={invite.url}
          className="rounded-[var(--radius-panel)] border border-line bg-paper p-5"
        >
          <p className="text-sm text-ink/60">{invite.email}</p>
          <p className="mt-0.5 font-medium">{invite.name}</p>
          <p className="mt-3 break-all rounded-[10px] bg-cloud p-3 font-mono text-sm">
            {invite.url}
          </p>
        </div>
      ))}

      <Link
        href={`/vuokrasuhteet/${state.tenancyId}`}
        className="inline-flex min-h-[var(--size-touch)] items-center justify-center self-start rounded-full bg-ink px-6 font-medium text-paper"
      >
        Vuokrasuhteeseen
      </Link>
    </div>
  );
}
