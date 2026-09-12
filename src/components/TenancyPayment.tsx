"use client";

import { useActionState, useState } from "react";
import { payTenancyAction, type BillingActionState } from "@/app/vuokrasuhteet/billing-actions";
import { CONSENT_TEXT } from "@/lib/billing/withdrawal";

const initialState: BillingActionState = {};

/**
 * Vuokrasuhteen maksu ennen allekirjoitusta (CLAUDE.md 5.1).
 *
 * ===========================================================================
 * SUOSTUMUS KYSYTÄÄN VAIN SILLOIN, KUN ON JOTAIN MENETETTÄVÄÄ
 *
 * Kun maksettavaa ei ole — ilmainen ensimmäinen, salkku tai krediitti —
 * peruutusoikeutta ei ole menetettävänä, eikä valintaruutua näytetä. Turha
 * valintaruutu opettaa klikkaamaan läpi lukematta, ja juuri se tekee
 * oikeista suostumuksista arvottomia.
 *
 * HINTA NÄYTETÄÄN, MUTTEI LÄHETETÄ
 *
 * Summa ei ole lomakkeessa. Se lasketaan palvelimella uudelleen; muuten sen
 * voisi vaihtaa selaimen kehitystyökaluilla.
 * ===========================================================================
 */
export function TenancyPayment({
  tenancyId,
  price,
  free,
}: {
  tenancyId: string;
  /** Muotoiltu hinta, tai `null` jos maksettavaa ei ole. */
  price: string | null;
  /** Perustelu hinnalle, näytetään sellaisenaan. */
  free: string;
}) {
  const [state, pay, pending] = useActionState(payTenancyAction, initialState);
  const [consent, setConsent] = useState(false);

  if (state.paid) {
    return (
      <section className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <p className="font-medium">Vuokrasuhde on valmis allekirjoitettavaksi</p>
        <p className="mt-2 text-sm text-ink/70">{state.reason}</p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      <h2 className="font-medium">{price ? "Vuokrasuhteen maksu" : "Tämä vuokrasuhde on maksuton"}</h2>

      <p className="mt-2 text-sm text-ink/70">{free}</p>

      {price ? (
        <p className="mt-3 text-2xl">
          {price}
          <span className="ml-2 text-sm text-ink/60">kertamaksu, sis. ALV 25,5 %</span>
        </p>
      ) : null}

      <form action={pay} className="mt-4">
        <input type="hidden" name="tenancyId" value={tenancyId} />

        {price ? (
          <label className="flex items-start gap-3 rounded-[10px] border border-line p-3 text-sm">
            <input
              type="checkbox"
              name="consent"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 size-5 shrink-0"
            />
            <span>{CONSENT_TEXT}</span>
          </label>
        ) : null}

        {state.message ? (
          <p role="alert" className="mt-3 text-sm text-coral">
            {state.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || (price !== null && !consent)}
          className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
        >
          {pending ? "Avataan…" : price ? `Maksa ${price}` : "Ota käyttöön"}
        </button>
      </form>

      {price ? (
        <p className="mt-3 text-sm text-ink/60">
          Maksaminen tapahtuu Stripen sivulla. Korttitietosi eivät tule Reilusopparille.
          Vuokralainen ei maksa mitään.
        </p>
      ) : null}
    </section>
  );
}
