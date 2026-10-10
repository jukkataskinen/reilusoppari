import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { listTenancyRows } from "@/lib/db/tenancy-summaries";
import { ACTION_REQUIRED_LABEL, TENANCY_GROUP_TONE, tenancyGroup } from "@/lib/property/status";
import { AppShell } from "@/components/AppShell";
import { CARD_ACCENT, StatusBadge } from "@/components/StatusBadge";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = { title: fi.nav.tenancies };

const STATUS_LABEL = fi.tenancyStatus;

export default async function TenanciesPage({
  searchParams,
}: {
  searchParams: Promise<{ poistettu?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  /*
    Osoite, alkukatselmuksen tila ja järjestys haetaan kerralla
    (`listTenancyRows`). Osoite näkyy vain vuokranantajalle: vuokralainen ei
    omista asuntoa, ja hän näkee osoitteen vuokrasuhteen omalla sivulla.
  */
  const rows = await listTenancyRows(user.id);
  const deleted = (await searchParams).poistettu === "1";

  return (
    <AppShell>
      <h1 className="text-2xl">{fi.nav.tenancies}</h1>

      {deleted ? (
        <p role="status" className="mt-4 rounded-[10px] bg-cloud p-3 text-sm">
          Vuokrasuhde poistettu.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="mt-8 rounded-[var(--radius-panel)] border border-line bg-paper p-6">
          <p className="font-medium">Ei vielä vuokrasuhteita</p>
          <p className="mt-2 text-ink/70">
            Vuokrasuhde luodaan asunnon sivulta. Ensimmäinen on ilmainen.
          </p>
          <Link href="/asunnot" className="mt-4 inline-block underline underline-offset-4">
            {fi.nav.properties}
          </Link>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {rows.map(({ tenancy, address, actionRequired }) => {
            // Coral vain, kun jokin vaatii toimia; muuten vaiheen väri.
            const tone = actionRequired ? "coral" : TENANCY_GROUP_TONE[tenancyGroup(tenancy.status)];
            return (
              <li key={tenancy.id}>
                <Link
                  href={`/vuokrasuhteet/${tenancy.id}`}
                  className={`flex min-h-[var(--size-touch)] flex-col rounded-[var(--radius-panel)] border border-line bg-paper p-4 ${CARD_ACCENT[tone]}`}
                >
                  <span className="font-medium">{address ?? "Vuokrasuhde"}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-2">
                    {actionRequired ? (
                      <StatusBadge tone="coral">{ACTION_REQUIRED_LABEL}</StatusBadge>
                    ) : null}
                    <StatusBadge tone={TENANCY_GROUP_TONE[tenancyGroup(tenancy.status)]}>
                      {STATUS_LABEL[tenancy.status]}
                    </StatusBadge>
                    {tenancy.rentAmount ? (
                      <span className="text-sm text-ink/60">{tenancy.rentAmount} €/kk</span>
                    ) : null}
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
