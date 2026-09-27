"use client";

import { useActionState, useId } from "react";
import {
  createFeatureRequestAction,
  updateFeatureRequestAction,
  type FeatureRequestFormState,
} from "./actions";

/**
 * Kehitystoiveen lomakkeet. Sama rakenne kuin muissa lomakkeissa: yksi
 * sarake, kosketuskohteet 44 px ja virhe kentän vieressä
 * `aria-describedby`-yhteydellä.
 */

const initialState: FeatureRequestFormState = { errors: {} };

const control = (error?: string) =>
  "mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border bg-paper px-3 text-base " +
  (error ? "border-coral" : "border-line");

function Message({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-[10px] border border-coral bg-paper p-3 text-sm">
      {text}
    </p>
  );
}

function FieldError({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-coral">
      {text}
    </p>
  );
}

export function NewFeatureRequestForm({
  options,
  importances,
  defaultFeature,
  pagePath,
}: {
  options: { value: string; label: string; group: string }[];
  importances: { value: string; label: string }[];
  defaultFeature: string;
  pagePath: string;
}) {
  const [state, formAction, pending] = useActionState(createFeatureRequestAction, initialState);
  const p = useId();
  const groups = [...new Set(options.map((o) => o.group))];
  const describedBy = (name: string) => (state.errors[name] ? `${p}-${name}-virhe` : undefined);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-5" noValidate>
      <Message text={state.message} />
      <input type="hidden" name="pagePath" value={pagePath} />

      <div>
        <label htmlFor={`${p}-feature`} className="text-sm font-medium">
          Mitä toimintoa toive koskee?
        </label>
        <select
          id={`${p}-feature`}
          name="feature"
          defaultValue={defaultFeature}
          required
          aria-invalid={state.errors.feature ? true : undefined}
          aria-describedby={describedBy("feature")}
          className={control(state.errors.feature)}
        >
          <option value="" disabled>
            Valitse toiminto
          </option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {options
                .filter((o) => o.group === g)
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <p className="mt-1.5 text-sm text-ink/60">
          Valitse lähin. Jos kyse on kokonaan uudesta asiasta, valitse Uusi toiminto tai muu asia.
        </p>
        <FieldError id={`${p}-feature-virhe`} text={state.errors.feature} />
      </div>

      <div>
        <label htmlFor={`${p}-title`} className="text-sm font-medium">
          Otsikko
        </label>
        <input
          id={`${p}-title`}
          name="title"
          maxLength={200}
          required
          placeholder="Esimerkiksi: Muistutus vuokran eräpäivästä"
          aria-invalid={state.errors.title ? true : undefined}
          aria-describedby={describedBy("title")}
          className={control(state.errors.title)}
        />
        <FieldError id={`${p}-title-virhe`} text={state.errors.title} />
      </div>

      <div>
        <label htmlFor={`${p}-description`} className="text-sm font-medium">
          Mitä toivot ja miksi?
        </label>
        <textarea
          id={`${p}-description`}
          name="description"
          rows={6}
          maxLength={5000}
          required
          aria-invalid={state.errors.description ? true : undefined}
          aria-describedby={describedBy("description")}
          className={control(state.errors.description) + " py-2"}
        />
        <p className="mt-1.5 text-sm text-ink/60">
          Kerro, mitä yritit tehdä ja mikä oli hankalaa. Älä kirjoita henkilötunnuksia tai muiden ihmisten tietoja.
        </p>
        <FieldError id={`${p}-description-virhe`} text={state.errors.description} />
      </div>

      <div>
        <label htmlFor={`${p}-importance`} className="text-sm font-medium">
          Kuinka tärkeä asia on sinulle?
        </label>
        <select id={`${p}-importance`} name="importance" defaultValue="nice" className={control(state.errors.importance)}>
          {importances.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
        <FieldError id={`${p}-importance-virhe`} text={state.errors.importance} />
      </div>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="min-h-[var(--size-touch)] rounded-full bg-ink px-6 font-medium text-paper disabled:opacity-60"
        >
          {pending ? "Lähetetään…" : "Lähetä toive"}
        </button>
      </div>
    </form>
  );
}

export function HandleFeatureRequestForm({
  requestId,
  statuses,
  status,
  response,
}: {
  requestId: string;
  statuses: { value: string; label: string }[];
  status: string;
  response: string;
}) {
  const [state, formAction, pending] = useActionState(updateFeatureRequestAction, initialState);
  const p = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Message text={state.message} />
      <input type="hidden" name="requestId" value={requestId} />
      <div>
        <label htmlFor={`${p}-status`} className="text-sm font-medium">
          Tila
        </label>
        <select id={`${p}-status`} name="status" defaultValue={status} className={control(state.errors.status)}>
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <FieldError id={`${p}-status-virhe`} text={state.errors.status} />
      </div>
      <div>
        <label htmlFor={`${p}-response`} className="text-sm font-medium">
          Vastaus jättäjälle
        </label>
        <textarea
          id={`${p}-response`}
          name="response"
          rows={4}
          maxLength={5000}
          defaultValue={response}
          className={control(state.errors.response) + " py-2"}
        />
        <FieldError id={`${p}-response-virhe`} text={state.errors.response} />
      </div>
      <div>
        <button
          type="submit"
          disabled={pending}
          className="min-h-[var(--size-touch)] rounded-full border border-line bg-paper px-6 font-medium disabled:opacity-60"
        >
          {pending ? "Tallennetaan…" : "Tallenna"}
        </button>
      </div>
    </form>
  );
}
