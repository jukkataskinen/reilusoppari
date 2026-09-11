"use client";

import { useActionState, useId } from "react";
import { createPropertyAction, type PropertyFormState } from "../actions";
import { fi } from "@/i18n/fi";

/**
 * Asunnon lomake.
 *
 * Mobiili ensin (CLAUDE.md kohta 4): yksi sarake, kosketuskohteet 44 px,
 * `inputMode` jotta puhelimessa aukeaa oikea näppäimistö. Lomake täytetään
 * tyypillisesti sohvalla puhelimella, ei työpöydällä.
 *
 * Virheet näytetään kentän vieressä ja `aria-describedby`-yhteydellä, jotta
 * ruudunlukija lukee ne kentän yhteydessä eikä erillisenä listana.
 */

const initialState: PropertyFormState = { errors: {} };

const TYPE_OPTIONS = [
  { value: "kerrostalo", label: "Kerrostalo" },
  { value: "rivitalo", label: "Rivi- tai paritalo" },
  { value: "omakotitalo", label: "Omakotitalo" },
  { value: "muu", label: "Muu" },
];

const TENURE_OPTIONS = [
  { value: "", label: "Ei valittu" },
  { value: "osake", label: "Asunto-osake" },
  { value: "kiinteisto", label: "Kiinteistö" },
  { value: "muu", label: "Muu" },
];

export function PropertyForm() {
  const [state, formAction, pending] = useActionState(createPropertyAction, initialState);
  const prefix = useId();

  const field = (name: string) => {
    const id = prefix + "-" + name;
    const error = state.errors[name];
    return {
      id,
      name,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? id + "-virhe" : undefined,
      className:
        "mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border bg-paper px-3 text-base " +
        (error ? "border-coral" : "border-line"),
    };
  };

  const FieldError = ({ name }: { name: string }) => {
    const error = state.errors[name];
    if (!error) return null;
    return (
      <p id={prefix + "-" + name + "-virhe"} className="mt-1.5 text-sm text-coral">
        {error}
      </p>
    );
  };

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-5" noValidate>
      {state.message ? (
        <p role="alert" className="rounded-[10px] border border-coral bg-paper p-3 text-sm">
          {state.message}
        </p>
      ) : null}

      <div>
        <label htmlFor={prefix + "-street"} className="text-sm font-medium">
          Katuosoite
        </label>
        <input {...field("street")} autoComplete="street-address" required />
        <FieldError name="street" />
      </div>

      <div className="flex gap-4">
        <div className="w-[9rem]">
          <label htmlFor={prefix + "-postalCode"} className="text-sm font-medium">
            Postinumero
          </label>
          <input
            {...field("postalCode")}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            required
          />
          <FieldError name="postalCode" />
        </div>
        <div className="flex-1">
          <label htmlFor={prefix + "-city"} className="text-sm font-medium">
            Postitoimipaikka
          </label>
          <input {...field("city")} autoComplete="address-level2" required />
          <FieldError name="city" />
        </div>
      </div>

      <div>
        <label htmlFor={prefix + "-propertyType"} className="text-sm font-medium">
          Asunnon tyyppi
        </label>
        <select {...field("propertyType")} defaultValue="kerrostalo">
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FieldError name="propertyType" />
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label htmlFor={prefix + "-rooms"} className="text-sm font-medium">
            Huoneita
          </label>
          <input {...field("rooms")} inputMode="numeric" placeholder="2" />
          {/* Suomalainen huoneluku: keittiötä ei lasketa, 2h+k on kaksi. */}
          <p className="mt-1.5 text-sm text-ink/60">Keittiötä ei lasketa. 2h+k on kaksi.</p>
          <FieldError name="rooms" />
        </div>
        <div className="flex-1">
          <label htmlFor={prefix + "-areaM2"} className="text-sm font-medium">
            Pinta-ala (m²)
          </label>
          <input {...field("areaM2")} inputMode="decimal" placeholder="54,5" />
          <FieldError name="areaM2" />
        </div>
      </div>

      <details className="rounded-[var(--radius-panel)] border border-line bg-paper p-4">
        <summary className="cursor-pointer text-sm font-medium">Lisätiedot</summary>

        <div className="mt-4 flex flex-col gap-5">
          <div>
            <label htmlFor={prefix + "-name"} className="text-sm font-medium">
              Nimi listassa
            </label>
            <input {...field("name")} placeholder="Esim. Testikadun kaksio" />
            <p className="mt-1.5 text-sm text-ink/60">
              Vapaaehtoinen. Auttaa erottamaan asunnot, jos niitä on useita.
            </p>
            <FieldError name="name" />
          </div>

          <div>
            <label htmlFor={prefix + "-housingCompany"} className="text-sm font-medium">
              Taloyhtiö
            </label>
            <input {...field("housingCompany")} />
            <FieldError name="housingCompany" />
          </div>

          <div>
            <label htmlFor={prefix + "-tenure"} className="text-sm font-medium">
              Hallintamuoto
            </label>
            <select {...field("tenure")} defaultValue="">
              {TENURE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <FieldError name="tenure" />
          </div>
        </div>
      </details>

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex min-h-[var(--size-touch)] items-center justify-center rounded-full bg-ink px-6 font-medium text-paper disabled:opacity-60"
      >
        {pending ? "Tallennetaan…" : fi.common.save}
      </button>
    </form>
  );
}
