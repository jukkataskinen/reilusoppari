import type { StatusTone } from "@/lib/property/status";

/*
  Väri näkyy pisteenä ja vaaleana taustana, teksti on aina ink-tummaa:
  amber ja sky eivät riitä kontrastiltaan pienen tekstin väriksi
  (globals.css), joten sana luetaan aina tummana.
*/
const DOT: Record<StatusTone, string> = {
  moss: "bg-moss",
  amber: "bg-amber",
  sky: "bg-sky",
  gray: "bg-ink/40",
  coral: "bg-coral",
};

const BADGE: Record<StatusTone, string> = {
  moss: "border-moss/40 bg-moss/10",
  amber: "border-amber/50 bg-amber/15",
  sky: "border-sky/40 bg-sky/10",
  gray: "border-line bg-cloud",
  coral: "border-coral/50 bg-coral/15",
};

/** Kortin vasen värireuna samalla sävyllä kuin merkki. */
export const CARD_ACCENT: Record<StatusTone, string> = {
  moss: "border-l-4 border-l-moss",
  amber: "border-l-4 border-l-amber",
  sky: "border-l-4 border-l-sky",
  gray: "border-l-4 border-l-ink/25",
  coral: "border-l-4 border-l-coral",
};

export function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium text-ink ${BADGE[tone]}`}
    >
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  );
}
