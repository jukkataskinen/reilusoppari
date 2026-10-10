"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PROCESSING_SLOW, type PaymentReturnView } from "@/lib/billing/return-state";

/** Kuinka usein ja kuinka kauan käsittelyä odotetaan ennen kuin luovutetaan. */
const POLL_MS = 3_000;
const POLL_LIMIT_MS = 60_000;

/**
 * Ilmoitus Stripen maksusivulta palatessa (`lib/billing/return-state.ts`).
 *
 * Käsittelytilassa sivu päivitetään itse muutaman sekunnin välein, kunnes
 * webhookin kirjaus näkyy. Minuutin jälkeen lopetetaan ja kerrotaan, ettei
 * maksua tarvitse tehdä uudelleen — loputon päivitys kuluttaisi puhelimen
 * akkua ja näyttäisi jumittuneelta.
 */
export function PaymentReturnNotice({
  view,
  children,
}: {
  view: PaymentReturnView;
  /** Seuraava askel maksun jälkeen, esimerkiksi Sinetöi laskelma -nappi. */
  children?: ReactNode;
}) {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);
  const processing = view.kind === "processing";

  useEffect(() => {
    if (!processing) return;

    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started >= POLL_LIMIT_MS) {
        window.clearInterval(timer);
        setGaveUp(true);
        return;
      }
      router.refresh();
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [processing, router]);

  if (view.kind === "none") return null;

  const tone =
    view.kind === "cancelled"
      ? "border-line bg-paper"
      : view.kind === "processing"
        ? "border-amber bg-paper"
        : "border-moss bg-paper";

  return (
    <section
      role="status"
      aria-live="polite"
      className={`mt-6 rounded-[var(--radius-panel)] border p-5 ${tone}`}
    >
      <p className="font-medium">{view.title}</p>
      {processing ? (
        <p className="mt-2 text-sm text-ink/70">{gaveUp ? PROCESSING_SLOW : view.body}</p>
      ) : view.body ? (
        <p className="mt-2 text-sm text-ink/70">{view.body}</p>
      ) : null}
      {view.kind === "paid" ? children : null}
    </section>
  );
}
