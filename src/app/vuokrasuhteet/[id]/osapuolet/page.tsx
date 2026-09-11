import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenancy } from "@/lib/db/tenancies";
import { listPartyDetails } from "@/lib/tenancy/party-details";
import { PartyDetailsForm } from "@/components/PartyDetailsForm";
import { AppShell } from "@/components/AppShell";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Osapuolten tiedot",
  robots: { index: false, follow: false },
};

/**
 * Sopimuksen osapuolet ja heidän tunnistetietonsa.
 *
 * ===========================================================================
 * KUKA MUOKKAA MITÄKIN
 *
 * Vuokranantaja saa täyttää myös vuokralaisen tiedot: sopimus kirjoitetaan
 * käytännössä valmiiksi ennen kuin vuokralainen on edes kirjautunut.
 *
 * Vuokralainen näkee molempien tiedot mutta muokkaa vain omiaan. Hän näkee
 * siis myös sen, mitä vuokranantaja on hänestä kirjannut — se on sama
 * periaate kuin kuittauksissa ja huoltokirjassa: kummastakaan osapuolesta ei
 * kerätä tietoa hänen tietämättään.
 *
 * Tunnukset näkyvät peitettyinä (131052-***T). Kokonaisena ne ovat vain
 * sopimuksessa, joka on molempien nähtävissä ja allekirjoitettavissa.
 * ===========================================================================
 */
export default async function PartiesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const tenancy = await getTenancy(user.id, id);
  if (!tenancy) notFound();

  const isLandlord = tenancy.landlordUserId === user.id;
  const parties = await listPartyDetails(user.id, id);

  const tenants = parties.filter((party) => party.role === "tenant");

  return (
    <AppShell>
      <h1 className="text-2xl">Osapuolten tiedot</h1>
      <p className="mt-2 text-ink/70">
        Nämä tiedot tulostuvat sopimukseen. Tunnus tarvitaan, jotta osapuolet ovat
        yksiselitteisesti yksilöitävissä, jos sopimuksesta tulee myöhemmin erimielisyyttä.
      </p>

      {parties
        .filter((party) => party.role === "landlord")
        .map((party) => (
          <Section
            key={party.partyId}
            title="Vuokranantaja"
            editable={isLandlord}
            party={party}
            tenancyId={id}
          />
        ))}

      {tenants.map((party, index) => (
        <Section
          key={party.partyId}
          title={tenants.length > 1 ? `Vuokralainen ${index + 1}` : "Vuokralainen"}
          editable={isLandlord || party.isSelf}
          party={party}
          tenancyId={id}
        />
      ))}

      <p className="mt-8 text-sm text-ink/60">
        Henkilötunnus tallennetaan salattuna eikä näy kokonaisena missään näkymässä. Sen näkevät
        vain tämän vuokrasuhteen osapuolet.{" "}
        <Link
            href="https://www.reilusoppari.fi/tietosuoja"
            className="underline underline-offset-4"
          >
          Tietosuojaseloste
        </Link>
      </p>

      <p className="mt-10 text-sm">
        <Link href={`/vuokrasuhteet/${id}`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}

function Section({
  title,
  party,
  tenancyId,
  editable,
}: {
  title: string;
  party: Awaited<ReturnType<typeof listPartyDetails>>[number];
  tenancyId: string;
  editable: boolean;
}) {
  return (
    <section className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      <h2 className="font-medium">{title}</h2>
      {party.isSelf ? <p className="mt-1 text-sm text-ink/60">Sinä</p> : null}

      <PartyDetailsForm details={party} tenancyId={tenancyId} readOnly={!editable} />

      {editable ? null : (
        <p className="mt-4 text-sm text-ink/60">
          Näitä tietoja muokkaa toinen osapuoli. Jos jokin on väärin, kerro hänelle.
        </p>
      )}
    </section>
  );
}
