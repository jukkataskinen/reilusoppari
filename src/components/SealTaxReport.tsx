"use client";

import { useActionState } from "react";
import { sealTaxReportAction, type TaxActionState } from "@/app/asunnot/tax-actions";

const initialState: TaxActionState = {};

function päivä(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${Number(day)}.${Number(month)}.${year}`;
}

/**
 * Laskelman esikatselu, sinetöinti ja lataus.
 *
 * ===========================================================================
 * ESIKATSELU ON AINA KÄYTÖSSÄ, SINETÖINTI VASTA KUN ON MITÄ SINETÖIDÄ
 *
 * Tyhjän vuoden sinetöinti tuottaisi asiakirjan, jossa lukee nollia — ja
 * koska sinetti kiinnittää sisällön, se olisi pysyvä asiakirja tyhjästä.
 * Esikatselu sen sijaan saa olla tyhjä: sitä katsotaan juuri silloin, kun
 * mietitään mitä pitäisi kirjata.
 *
 * UUDELLEENSINETÖINTI ON SALLITTU
 *
 * Kirjaus voi puuttua tai olla väärässä luokassa. Korjattu laskelma on
 * parempi kuin väärä, ja vanha korvautuu — kaksi ristiriitaista laskelmaa
 * samalta vuodelta olisi pahempi ongelma kuin yhden korvaaminen. Nappi
 * sanoo sen ääneen, jotta korvaaminen ei tule yllätyksenä.
 * ===========================================================================
 */
export function SealTaxReport({
  propertyId,
  year,
  sealedAt,
  hasContent,
}: {
  propertyId: string;
  year: number;
  sealedAt: string | null;
  hasContent: boolean;
}) {
  const [state, seal, pending] = useActionState(sealTaxReportAction, initialState);

  return (
    <section className="mt-8 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      <h2 className="font-medium">Laskelma paperille</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`/asunnot/${propertyId}/verolaskelma/pdf?vuosi=${year}`}
          download={`verolaskelma-${year}.pdf`}
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
        >
          Tallenna PDF
        </a>

        {sealedAt ? (
          <a
            href={`/asunnot/${propertyId}/verolaskelma/pdf?vuosi=${year}&sinetoity=1`}
            download={`verolaskelma-${year}-sinetoity.pdf`}
            className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
          >
            Tallenna sinetöity
          </a>
        ) : null}
      </div>

      {sealedAt ? (
        <p className="mt-3 text-sm text-ink/70">
          Sinetöity {päivä(sealedAt)}. Sinetöity laskelma on se, jonka voit näyttää
          myöhemmin: sen sisältö ei voi muuttua, vaikka kirjauksia lisäisi.
        </p>
      ) : (
        <p className="mt-3 text-sm text-ink/70">
          Sinetöinti kiinnittää laskelman sisällön. Se kannattaa tehdä silloin, kun luvut on
          siirretty OmaVeroon — silloin sinulla on tallessa juuri se laskelma, jonka mukaan
          ilmoitit.
        </p>
      )}

      {hasContent ? (
        <form action={seal} className="mt-4">
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="year" value={year} />

          {state.message ? (
            <p role="alert" className="mb-2 text-sm text-coral">
              {state.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
          >
            {pending
              ? "Sinetöidään…"
              : sealedAt
                ? "Sinetöi uudelleen ja korvaa vanha"
                : "Sinetöi laskelma"}
          </button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-ink/60">
          Vuodelle ei ole vielä kirjattu tuloja eikä kuluja, joten sinetöitävää ei ole.
        </p>
      )}
    </section>
  );
}
