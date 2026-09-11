"use client";

import { useActionState, useId, useState } from "react";
import { saveContractAction, type ContractFormState } from "@/app/vuokrasuhteet/contract-actions";
import type { ContractTerms } from "@/lib/tenancy/contract-schema";

const initialState: ContractFormState = { errors: {} };

/**
 * Sopimuksen ehdot.
 *
 * Valintaruuduissa oletukset ovat ne, jotka eivät yllätä vuokralaista
 * (`contract-schema.ts`). Vuokranantaja muuttaa ne tietoisesti.
 */
export function ContractForm({
  tenancyId,
  terms,
  tenantCount,
}: {
  tenancyId: string;
  terms: ContractTerms;
  tenantCount: number;
}) {
  const [state, formAction, pending] = useActionState(saveContractAction, initialState);
  const [hasMinimumTerm, setHasMinimumTerm] = useState(terms.minimumTermMonths !== null);
  const [waterIncluded, setWaterIncluded] = useState(terms.waterIncluded);
  const prefix = useId();

  const field = (name: string) => {
    const id = `${prefix}-${name}`;
    const error = state.errors[name];
    return {
      id,
      name,
      "aria-invalid": error ? true : undefined,
      className:
        "mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border bg-paper px-3 text-base " +
        (error ? "border-coral" : "border-line"),
    };
  };

  const FieldError = ({ name }: { name: string }) => {
    const error = state.errors[name];
    return error ? <p className="mt-1.5 text-sm text-coral">{error}</p> : null;
  };

  const Toggle = ({
    name,
    label,
    hint,
    defaultChecked,
  }: {
    name: string;
    label: string;
    hint?: string;
    defaultChecked: boolean;
  }) => (
    <div>
      <label className="flex min-h-[var(--size-touch)] items-center gap-3">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-5" />
        <span className="text-sm">{label}</span>
      </label>
      {hint ? <p className="ml-8 text-sm text-ink/60">{hint}</p> : null}
    </div>
  );

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-6" noValidate>
      <input type="hidden" name="tenancyId" value={tenancyId} />

      {state.message ? (
        <p role="alert" className="rounded-[10px] border border-coral bg-paper p-3 text-sm">
          {state.message}
        </p>
      ) : null}

      {state.saved ? (
        <p className="rounded-[10px] border border-line bg-paper p-3 text-sm">
          Tallennettu. Esikatselu päivittyi.
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-4 border-0 p-0">
        <legend className="text-sm font-medium">Osapuolten nimet sopimuksessa</legend>
        <p className="text-sm text-ink/60">
          Nimet tulevat asiakirjaan sellaisinaan. Allekirjoituksen yhteydessä ne tarkistetaan
          vahvasta tunnistautumisesta.
        </p>

        <div>
          <label htmlFor={`${prefix}-landlordName`} className="text-sm">
            Sinun nimesi
          </label>
          <input {...field("landlordName")} defaultValue={terms.landlordName ?? ""} required />
          <FieldError name="landlordName" />
        </div>

        {Array.from({ length: Math.max(tenantCount, terms.tenantNames.length, 1) }, (_, index) => (
          <div key={index}>
            <label htmlFor={`${prefix}-tenantName${index}`} className="text-sm">
              {index === 0 ? "Vuokralainen" : "Toinen vuokralainen"}
            </label>
            <input
              {...field(`tenantName${index}`)}
              defaultValue={terms.tenantNames[index] ?? ""}
              required={index === 0}
            />
          </div>
        ))}
      </fieldset>

      <div className="flex gap-4">
        <div className="w-[9rem]">
          <label htmlFor={`${prefix}-noticePeriodMonths`} className="text-sm font-medium">
            Irtisanomisaika
          </label>
          <input
            {...field("noticePeriodMonths")}
            inputMode="numeric"
            defaultValue={String(terms.noticePeriodMonths)}
          />
          <p className="mt-1.5 text-sm text-ink/60">kuukautta</p>
          <FieldError name="noticePeriodMonths" />
        </div>
        <div className="flex-1">
          <label htmlFor={`${prefix}-depositDueDate`} className="text-sm font-medium">
            Vakuus maksettava
          </label>
          <input
            {...field("depositDueDate")}
            type="date"
            defaultValue={terms.depositDueDate ?? ""}
          />
          <FieldError name="depositDueDate" />
        </div>
      </div>

      <div className="flex gap-4">
        <div className="w-[9rem]">
          <label htmlFor={`${prefix}-keysCount`} className="text-sm font-medium">
            Avaimia
          </label>
          <input
            {...field("keysCount")}
            inputMode="numeric"
            defaultValue={terms.keysCount === null ? "" : String(terms.keysCount)}
            placeholder="3"
          />
          <FieldError name="keysCount" />
        </div>
      </div>

      {/*
        Toistaiseksi voimassa, mutta ei heti irtisanottavissa. Yleinen
        järjestely, jolle ei ollut aiemmin paikkaa lomakkeella.
      */}
      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="text-sm font-medium">Sitoutumisaika</legend>
        <label className="flex min-h-[var(--size-touch)] items-center gap-3">
          <input
            type="checkbox"
            name="hasMinimumTerm"
            defaultChecked={terms.minimumTermMonths !== null}
            onChange={(event) => setHasMinimumTerm(event.target.checked)}
            className="size-5"
          />
          <span className="text-sm">Sopimusta ei voi irtisanoa heti</span>
        </label>

        {hasMinimumTerm ? (
          <div className="ml-8 w-[10rem]">
            <label htmlFor={`${prefix}-minimumTermMonths`} className="text-sm">
              Kuukautta alusta
            </label>
            <input
              {...field("minimumTermMonths")}
              inputMode="numeric"
              defaultValue={String(terms.minimumTermMonths ?? 12)}
            />
            <FieldError name="minimumTermMonths" />
          </div>
        ) : null}

        <p className="ml-8 text-sm text-ink/60">
          Sopimus on silti toistaiseksi voimassa — se vain jatkuu normaalisti tämän ajan
          jälkeen. Eri asia kuin määräaikainen sopimus, joka päättyy sovittuna päivänä.
        </p>
      </fieldset>

      <div>
        <label htmlFor={`${prefix}-rentIncreaseTerm`} className="text-sm font-medium">
          Vuokrankorotusehto
        </label>
        <input
          {...field("rentIncreaseTerm")}
          defaultValue={terms.rentIncreaseTerm ?? ""}
          placeholder="elinkustannusindeksin mukaan kerran vuodessa"
        />
        <p className="mt-1.5 text-sm text-ink/60">
          Jätä tyhjäksi, jos vuokrankorotuksesta ei sovita erikseen.
        </p>
        <FieldError name="rentIncreaseTerm" />
      </div>

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="text-sm font-medium">Asunnon käyttö</legend>
        <Toggle name="smokingAllowed" label="Tupakointi sallittu" defaultChecked={terms.smokingAllowed} />
        <Toggle name="petsAllowed" label="Lemmikit sallittu" defaultChecked={terms.petsAllowed} />
      </fieldset>

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="text-sm font-medium">Vuokraan sisältyy</legend>

        <label className="flex min-h-[var(--size-touch)] items-center gap-3">
          <input
            type="checkbox"
            name="waterIncluded"
            defaultChecked={terms.waterIncluded}
            onChange={(event) => setWaterIncluded(event.target.checked)}
            className="size-5"
          />
          <span className="text-sm">Vesi</span>
        </label>

        {waterIncluded ? null : (
          <div className="ml-8 flex flex-col gap-2">
            <div className="w-[10rem]">
              <label htmlFor={`${prefix}-waterChargeEur`} className="text-sm">
                Vesimaksu (€/kk)
              </label>
              <input
                {...field("waterChargeEur")}
                inputMode="decimal"
                defaultValue={terms.waterChargeEur === null ? "" : String(terms.waterChargeEur)}
                placeholder="25"
              />
              <p className="mt-1.5 text-sm text-ink/60">
                Tyhjänä: vesi maksetaan käytön mukaan.
              </p>
              <FieldError name="waterChargeEur" />
            </div>
            <Toggle
              name="waterChargePerPerson"
              label="Vesimaksu on henkilöä kohden"
              defaultChecked={terms.waterChargePerPerson}
            />
          </div>
        )}

        <Toggle
          name="electricityIncluded"
          label="Sähkö"
          hint="Jos sähkö ei sisälly, vuokralainen tekee oman sähkösopimuksensa."
          defaultChecked={terms.electricityIncluded}
        />
        <Toggle
          name="broadbandIncluded"
          label="Laajakaista"
          defaultChecked={terms.broadbandIncluded}
        />
        <Toggle
          name="furnished"
          label="Asunto vuokrataan kalustettuna"
          defaultChecked={terms.furnished}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="text-sm font-medium">Vakuutus</legend>
        <Toggle
          name="insuranceRequired"
          label="Vuokralaisella on oltava kotivakuutus"
          hint="Vastuuvakuutuksella. Suojaa myös vuokralaista itseään."
          defaultChecked={terms.insuranceRequired}
        />
      </fieldset>

      <div>
        <label htmlFor={`${prefix}-otherTerms`} className="text-sm font-medium">
          Muut ehdot
        </label>
        <textarea
          {...field("otherTerms")}
          defaultValue={terms.otherTerms ?? ""}
          rows={4}
          className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
        />
        <p className="mt-1.5 text-sm text-ink/60">
          Esimerkiksi autopaikka, säilytystila tai muu erikseen sovittu asia.
        </p>
        <FieldError name="otherTerms" />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[var(--size-touch)] items-center justify-center rounded-full bg-ink px-6 font-medium text-paper disabled:opacity-60"
      >
        {pending ? "Tallennetaan…" : "Tallenna ehdot"}
      </button>
    </form>
  );
}
