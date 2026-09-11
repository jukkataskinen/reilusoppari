"use client";

import { useActionState } from "react";
import { PartyDetailsFields } from "./PartyDetailsFields";
import {
  savePartyDetailsAction,
  saveOwnDetailsAction,
  type PartyFormState,
} from "@/app/party-actions";
import type { PartyDetailsView } from "@/lib/tenancy/party-details";

const initialState: PartyFormState = { errors: {} };

/**
 * Yhden osapuolen tietolomake.
 *
 * Sama komponentti sekä omille perustiedoille että vuokrasuhteen osapuolelle;
 * ero on vain siinä, kumpi palvelinfunktio sitä käsittelee. Kentät tulevat
 * `PartyDetailsFields`-komponentista, joten validointi ja kenttien nimet ovat
 * varmasti samat molemmissa.
 */
export function PartyDetailsForm({
  details,
  tenancyId,
  nameLabel,
  readOnly = false,
}: {
  details: PartyDetailsView;
  /** Puuttuu, kun kyse on omista perustiedoista. */
  tenancyId?: string;
  nameLabel?: string;
  readOnly?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    tenancyId ? savePartyDetailsAction : saveOwnDetailsAction,
    initialState,
  );

  if (readOnly) {
    return (
      <dl className="mt-4 flex flex-col gap-3 text-sm">
        <Row label="Nimi" value={details.name} />
        <Row
          label={details.partyType === "yritys" ? "Y-tunnus" : "Henkilötunnus"}
          value={details.identifierMasked}
        />
        {details.partyType === "yritys" ? (
          <Row label="Allekirjoittaja" value={details.signatoryName} />
        ) : null}
        <Row label="Puhelin" value={details.phone} />
        <Row label="Sähköposti" value={details.email} />
      </dl>
    );
  }

  return (
    <form action={formAction} className="mt-4" noValidate>
      {tenancyId ? (
        <>
          <input type="hidden" name="tenancyId" value={tenancyId} />
          <input type="hidden" name="partyId" value={details.partyId} />
        </>
      ) : null}

      {state.message ? (
        <p role="alert" className="mb-4 rounded-[10px] border border-coral bg-paper p-3 text-sm">
          {state.message}
        </p>
      ) : null}

      {state.saved ? (
        <p className="mb-4 rounded-[10px] border border-line bg-paper p-3 text-sm">Tallennettu.</p>
      ) : null}

      <PartyDetailsFields details={details} errors={state.errors} nameLabel={nameLabel} />

      <button
        type="submit"
        disabled={pending}
        className="mt-6 inline-flex min-h-[var(--size-touch)] items-center justify-center rounded-full bg-ink px-6 font-medium text-paper disabled:opacity-60"
      >
        {pending ? "Tallennetaan…" : "Tallenna tiedot"}
      </button>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  // Tyhjää riviä ei näytetä: "—" näyttäisi siltä, että tieto on tarkoituksella
  // jätetty pois, vaikka se on vain vielä täyttämättä.
  if (!value) return null;

  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 text-ink/60">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
