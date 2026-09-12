"use client";

import { useState } from "react";

/**
 * Suositteluosoite ja sen kopiointi.
 *
 * Osoite näytetään kokonaan eikä piiloteta napin taakse: puhelimessa
 * `navigator.clipboard` voi olla estetty tai puuttua, ja silloin ainoa tapa
 * saada linkki talteen on lukea se. Nappi on lisä, ei ainoa reitti.
 */
export function CopyReferralLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Kopiointi ei onnistunut. Osoite on silti näkyvissä, joten mitään ei
      // ole menetetty — virheilmoitus olisi tässä pelkkää melua.
    }
  }

  return (
    <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      <p className="text-sm text-ink/60">Oma linkkisi</p>
      <p className="mt-1 break-all font-mono text-sm">{link}</p>

      <button
        type="button"
        onClick={copy}
        className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
      >
        {copied ? "Kopioitu" : "Kopioi linkki"}
      </button>
    </div>
  );
}
