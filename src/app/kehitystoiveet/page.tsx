import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth/session";
import { listFeatureRequests } from "@/lib/db/feature-requests";
import {
  featureLabel,
  formatRequestDate,
  IMPORTANCE_LABEL,
  isFeature,
  isFeatureRequestAdmin,
  REQUEST_STATUS,
  type RequestStatus,
} from "@/lib/feature-requests";

export const metadata: Metadata = { title: "Kehitystoiveet" };

const VIEWS: Record<string, { label: string; statuses: RequestStatus[] }> = {
  avoimet: { label: "Avoimet", statuses: ["uusi", "hyvaksytty", "tyon_alla", "testattavana"] },
  valmiit: { label: "Tehdyt ja hylätyt", statuses: ["valmis", "hylatty"] },
};

const TONE = { sky: "text-sky", moss: "text-moss", ink: "text-ink/60" } as const;

export default async function FeatureRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ nayta?: string; toiminto?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const sp = await searchParams;
  const view = sp.nayta && sp.nayta in VIEWS ? sp.nayta : "avoimet";
  const feature = isFeature(sp.toiminto) ? sp.toiminto : null;
  // Käsittelijä näkee kaikkien toiveet, muut vain omansa (DECISIONS.md 2026-09-27).
  const asAdmin = isFeatureRequestAdmin(user.email);
  const rows = await listFeatureRequests({ userId: user.id, asAdmin }, { statuses: VIEWS[view].statuses, feature });
  const q = (k: string) => `/kehitystoiveet?nayta=${k}${feature ? `&toiminto=${feature}` : ""}`;

  return (
    <AppShell>
      <h1 className="text-2xl">Kehitystoiveet</h1>
      <p className="mt-2 text-ink/70">
        {asAdmin
          ? "Kaikkien käyttäjien toiveet. Kiireellisimmät ensin."
          : "Kerro, mitä toivot Reilusopparilta. Näet täällä omat toiveesi ja niiden tilan."}
      </p>
      <Link
        href={`/kehitystoiveet/uusi${feature ? `?toiminto=${feature}` : ""}`}
        className="mt-5 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 font-medium text-paper"
      >
        Uusi kehitystoive
      </Link>

      <nav className="mt-8 flex gap-2" aria-label="Näytä">
        {Object.entries(VIEWS).map(([k, v]) => (
          <Link
            key={k}
            href={q(k)}
            aria-current={k === view ? "page" : undefined}
            className={
              "rounded-full border px-3 py-1.5 text-sm " +
              (k === view ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink/70")
            }
          >
            {v.label}
          </Link>
        ))}
      </nav>
      {feature ? (
        <p className="mt-3 text-sm text-ink/70">
          Toiminto: {featureLabel(feature)}.{" "}
          <Link href={`/kehitystoiveet?nayta=${view}`} className="underline underline-offset-4">
            Näytä kaikki
          </Link>
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5 text-ink/70">
          {view === "avoimet" ? "Ei avoimia toiveita." : "Ei tehtyjä tai hylättyjä toiveita."}
        </p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {rows.map((r) => {
            const st = REQUEST_STATUS[r.status];
            return (
              <li key={r.id}>
                <Link
                  href={`/kehitystoiveet/${r.id}`}
                  className="block rounded-[var(--radius-panel)] border border-line bg-paper p-4 hover:border-ink/25"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-medium">{r.title}</span>
                    <span className={"shrink-0 text-sm " + TONE[st.tone]}>{st.label}</span>
                  </span>
                  <span className="mt-1 block text-sm text-ink/60">
                    {featureLabel(r.feature)} · {IMPORTANCE_LABEL[r.importance]} · {formatRequestDate(r.createdAt)}
                    {asAdmin && r.authorEmail ? ` · ${r.authorEmail}` : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
