import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { listTenancies } from "@/lib/db/tenancies";
import { getProperty } from "@/lib/db/properties";
import { formatAddress } from "@/lib/property/schema";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = { title: fi.nav.tenancies };

const STATUS_LABEL = fi.tenancyStatus;

export default async function TenanciesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancies = await listTenancies(user.id);

  /*
    Osoite haetaan jokaiselle erikseen `getProperty`llä, joka rajaa
    omistajaan. Vuokralainen ei omista asuntoa, joten hänelle osoite jää
    tässä näkymässä hakematta — se näkyy vuokrasuhteen omalla sivulla.
  */
  const rows = await Promise.all(
    tenancies.map(async (tenancy) => ({
      tenancy,
      property: await getProperty(user.id, tenancy.propertyId),
    })),
  );

  return (
    <main className="mx-auto min-h-dvh max-w-[var(--container-content)] px-6 py-10">
      <h1 className="text-2xl">{fi.nav.tenancies}</h1>

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
          {rows.map(({ tenancy, property }) => (
            <li key={tenancy.id}>
              <Link
                href={`/vuokrasuhteet/${tenancy.id}`}
                className="flex min-h-[var(--size-touch)] flex-col rounded-[var(--radius-panel)] border border-line bg-paper p-4"
              >
                <span className="font-medium">
                  {property ? formatAddress(property) : "Vuokrasuhde"}
                </span>
                <span className="mt-1 text-sm text-ink/60">
                  {STATUS_LABEL[tenancy.status]}
                  {tenancy.rentAmount ? ` · ${tenancy.rentAmount} €/kk` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-sm">
        <Link href="/" className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </main>
  );
}
