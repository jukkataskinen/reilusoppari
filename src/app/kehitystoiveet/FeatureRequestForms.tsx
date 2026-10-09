"use client";

import { useActionState, useId } from "react";
import {
  approveFeatureRequestAction,
  confirmWorksAction,
  createFeatureRequestAction,
  rejectFeatureRequestAction,
  requestChangesAction,
  type FeatureRequestFormState,
} from "./actions";
import type { RequestStatus } from "@/lib/feature-requests";
import { Form } from "@/components/Form";

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
    <Form action={formAction} encType="multipart/form-data" className="mt-6 flex flex-col gap-5">
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
          placeholder="esim. Muistutus vuokran eräpäivästä"
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
        <label htmlFor={`${p}-screenshot`} className="text-sm font-medium">
          Kuvakaappaus (vapaaehtoinen)
        </label>
        <input
          id={`${p}-screenshot`}
          name="screenshot"
          type="file"
          accept="image/png,image/jpeg"
          aria-invalid={state.errors.screenshot ? true : undefined}
          aria-describedby={describedBy("screenshot")}
          className={control(state.errors.screenshot) + " py-1.5"}
        />
        <p className="mt-1.5 text-sm text-ink/60">
          Auttaa näkemään, mitä tapahtui. Kuva ei mene koskaan GitHubiin, vain tälle sivulle.
        </p>
        <FieldError id={`${p}-screenshot-virhe`} text={state.errors.screenshot} />
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
    </Form>
  );
}

function SubmitButton({ pending, label, pendingLabel, variant = "primary" }: { pending: boolean; label: string; pendingLabel: string; variant?: "primary" | "secondary" }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        "min-h-[var(--size-touch)] rounded-full px-6 font-medium disabled:opacity-60 " +
        (variant === "primary" ? "bg-ink text-paper" : "border border-line bg-paper")
      }
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function ApproveForm({ requestId, description }: { requestId: string; description: string }) {
  const [state, formAction, pending] = useActionState(approveFeatureRequestAction, initialState);
  const p = useId();
  return (
    <Form action={formAction} className="flex flex-col gap-4">
      <Message text={state.message} />
      <input type="hidden" name="requestId" value={requestId} />
      <div>
        <label htmlFor={`${p}-kuvaus`} className="text-sm font-medium">
          Kuvaus työjonoon (muokkaa, jos tekstissä on henkilötietoja)
        </label>
        <textarea
          id={`${p}-kuvaus`}
          name="approvedDescription"
          rows={5}
          maxLength={5000}
          defaultValue={description}
          className={control(state.errors.approvedDescription) + " py-2"}
        />
        <FieldError id={`${p}-kuvaus-virhe`} text={state.errors.approvedDescription} />
      </div>
      <div>
        <SubmitButton pending={pending} label="Hyväksy" pendingLabel="Hyväksytään…" />
      </div>
    </Form>
  );
}

function RejectForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(rejectFeatureRequestAction, initialState);
  const p = useId();
  return (
    <Form action={formAction} className="flex flex-col gap-4">
      <Message text={state.message} />
      <input type="hidden" name="requestId" value={requestId} />
      <div>
        <label htmlFor={`${p}-vastaus`} className="text-sm font-medium">
          Miksi ehdotusta ei toteuteta?
        </label>
        <textarea
          id={`${p}-vastaus`}
          name="response"
          rows={3}
          maxLength={5000}
          required
          aria-describedby={state.errors.response ? `${p}-vastaus-virhe` : undefined}
          className={control(state.errors.response) + " py-2"}
        />
        <FieldError id={`${p}-vastaus-virhe`} text={state.errors.response} />
      </div>
      <div>
        <SubmitButton pending={pending} label="Hylkää" pendingLabel="Tallennetaan…" variant="secondary" />
      </div>
    </Form>
  );
}

function ConfirmWorksForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(confirmWorksAction, initialState);
  return (
    <Form action={formAction} className="flex flex-col gap-3">
      <Message text={state.message} />
      <input type="hidden" name="requestId" value={requestId} />
      <SubmitButton pending={pending} label="Toimii — ilmoita jättäjälle" pendingLabel="Tallennetaan…" />
    </Form>
  );
}

function RequestChangesForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(requestChangesAction, initialState);
  const p = useId();
  return (
    <Form action={formAction} className="flex flex-col gap-4">
      <Message text={state.message} />
      <input type="hidden" name="requestId" value={requestId} />
      <div>
        <label htmlFor={`${p}-muutos`} className="text-sm font-medium">
          Mitä pitää korjata?
        </label>
        <textarea
          id={`${p}-muutos`}
          name="response"
          rows={3}
          maxLength={5000}
          required
          aria-describedby={state.errors.response ? `${p}-muutos-virhe` : undefined}
          className={control(state.errors.response) + " py-2"}
        />
        <FieldError id={`${p}-muutos-virhe`} text={state.errors.response} />
      </div>
      <div>
        <SubmitButton pending={pending} label="Tarvitsee muutoksen" pendingLabel="Tallennetaan…" variant="secondary" />
      </div>
    </Form>
  );
}

/**
 * Käsittelijän näkymä yhdelle ehdotukselle. Näytettävät toiminnot riippuvat
 * tilasta — ei yleistä tilavalitsinta, koska sallitut siirtymät tulevat
 * tilakoneelta (`lib/dev-suggestions/state-machine.ts`), ei käsittelijän
 * valinnasta.
 */
export function DevSuggestionAdminPanel({ requestId, status, description }: { requestId: string; status: RequestStatus; description: string }) {
  if (status === "uusi") {
    return (
      <div className="grid gap-6">
        <ApproveForm requestId={requestId} description={description} />
        <div className="border-t border-line pt-5">
          <RejectForm requestId={requestId} />
        </div>
      </div>
    );
  }

  if (status === "testattavana") {
    return (
      <div className="grid gap-6">
        <ConfirmWorksForm requestId={requestId} />
        <div className="border-t border-line pt-5">
          <RequestChangesForm requestId={requestId} />
        </div>
        <div className="border-t border-line pt-5">
          <RejectForm requestId={requestId} />
        </div>
      </div>
    );
  }

  if (status === "hyvaksytty" || status === "tyon_alla") {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-ink/60">
          {status === "hyvaksytty" ? "Odottaa, että työ alkaa GitHubissa." : "Työn alla GitHubissa. Odottaa yhdistämistä."}
        </p>
        <RejectForm requestId={requestId} />
      </div>
    );
  }

  return null;
}
