import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getProperty } from "@/lib/db/properties";
import { getTenancy, listParties } from "@/lib/db/tenancies";
import { formatAddress } from "@/lib/property/schema";
import { EndOfTenancyNotice } from "@/components/EndOfTenancyNotice";
import { InviteRow } from "./InviteRow";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = { title: "Vuokrasuhde" };

function formatDate(value: string | null): string {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${Number(day)}.${Number(month)}.${year}`;
}

export default async function TenancyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const tenancy = await getTenancy(user.id, id);
  if (!tenancy) notFound();

  const isLandlord = tenancy.landlordUserId === user.id;
  const [parties, property] = await Promise.all([
    listParties(user.id, id),
    // Vuokralainen ei omista asuntoa, joten hänelle tämä on `null`.
    getProperty(user.id, tenancy.propertyId),
  ]);

  const tenants = parties.filter((party) => party.role === "tenant");

  return (
    <main className="mx-auto min-h-dvh max-w-[var(--container-content)] px-6 py-10">
      <h1 className="text-2xl">{property ? formatAddress(property) : "Vuokrasuhde"}</h1>
      <p className="mt-2 text-ink/70">{fi.tenancyStatus[tenancy.status]}</p>

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <div>
          <dt className="text-sm text-ink/60">{fi.tenancy.startDate}</dt>
          <dd className="mt-0.5">{formatDate(tenancy.startDate)}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink/60">
            {tenancy.endDate ? fi.tenancy.endDate : "Kesto"}
          </dt>
          <dd className="mt-0.5">
            {tenancy.endDate ? formatDate(tenancy.endDate) : fi.tenancy.openEnded}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink/60">{fi.tenancy.rent}</dt>
          <dd className="mt-0.5">
            {tenancy.rentAmount} €/kk
            {tenancy.rentDueDay ? ` · eräpäivä ${tenancy.rentDueDay}.` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink/60">{fi.tenancy.deposit}</dt>
          <dd className="mt-0.5">{tenancy.depositAmount} €</dd>
        </div>
      </dl>

      <section className="mt-10">
        <h2 className="text-lg">{tenants.length > 1 ? fi.tenancy.tenants : fi.tenancy.tenant}</h2>

        <div className="mt-4 flex flex-col gap-3">
          {tenants.map((party) =>
            isLandlord ? (
              /*
                Kutsulinkin luonti on vain vuokranantajalla. Vuokralaiselle
                toisen osapuolen kutsulinkki olisi pääsy tämän paikalle.
              */
              <InviteRow
                key={party.id}
                tenancyId={tenancy.id}
                partyId={party.id}
                email={party.inviteEmail ?? ""}
                joined={Boolean(party.joinedAt)}
              />
            ) : (
              <div
                key={party.id}
                className="rounded-[var(--radius-panel)] border border-line bg-paper p-4"
              >
                <p className="font-medium">{party.inviteEmail}</p>
                <p className="mt-0.5 text-sm text-ink/60">
                  {party.joinedAt ? "Liittynyt" : "Ei ole vielä liittynyt"}
                </p>
              </div>
            ),
          )}
        </div>
      </section>

      <div className="mt-10">
        <EndOfTenancyNotice />
      </div>

      <p className="mt-10 text-sm">
        <Link href="/vuokrasuhteet" className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </main>
  );
}
