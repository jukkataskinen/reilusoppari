import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getContractTerms } from "@/lib/db/contracts";
import { getTenancy } from "@/lib/db/tenancies";
import { listPartyDetails, missingPartyDetails } from "@/lib/tenancy/party-details";
import { ContractForm } from "./ContractForm";
import { AppShell } from "@/components/AppShell";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = { title: "Vuokrasopimus" };

/**
 * Sopimuslomake ja esikatselu (CLAUDE.md 5.1–5.2).
 *
 * Vuokralainen näkee saman luonnoksen mutta ei muokkaa sitä: hän voi
 * kommentoida, ja vuokranantaja muuttaa ehtoja. Muuten sopimus voisi muuttua
 * sen jälkeen, kun toinen on sen lukenut.
 */
export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const tenancy = await getTenancy(user.id, id);
  if (!tenancy) notFound();

  const isLandlord = tenancy.landlordUserId === user.id;
  const [terms, parties] = await Promise.all([
    getContractTerms(user.id, id),
    listPartyDetails(user.id, id),
  ]);

  const puuttuu = missingPartyDetails(parties);

  return (
    <AppShell>
      <h1 className="text-2xl">Vuokrasopimus</h1>
      <p className="mt-2 text-ink/70">
        {isLandlord
          ? "Täytä ehdot ja katso esikatselu. Sopimus allekirjoitetaan vasta alkukatselmuksen jälkeen."
          : "Tämä on sopimusluonnos. Voit lukea sen ennen allekirjoitusta."}
      </p>

      {/*
        Puute kerrotaan ennen esikatselua, ei sen jälkeen: asiakirjassa se ei
        näy mitenkään, joten esikatselu näyttää valmiilta vaikkei ole.
      */}
      {puuttuu.length > 0 ? (
        <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <p className="font-medium">Osapuolten tiedot ovat kesken</p>
          <p className="mt-2 text-sm text-ink/70">
            Sopimuksesta puuttuu {puuttuu.length === 1 ? "yksi tieto" : `${puuttuu.length} tietoa`}
            . Puuttuva tieto ei näy asiakirjassa mitenkään, joten esikatselu näyttää valmiilta
            vaikkei ole.
          </p>
          <Link
            href={`/vuokrasuhteet/${id}/osapuolet`}
            className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
          >
            {fi.nav.parties}
          </Link>
        </div>
      ) : null}

      <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <p className="font-medium">Esikatselu</p>
        <p className="mt-2 text-sm text-ink/70">
          Asiakirja avautuu PDF:nä. Se on sama asiakirja, joka allekirjoitetaan.
        </p>
        {/*
          Sovelluksen sisäinen linkki eikä uusi välilehti: kotinäytölle
          asennetussa sovelluksessa ei ole takaisin-painiketta, ja suoraan
          PDF:ään vievästä näkymästä ei päässyt pois.
        */}
        <Link
          href={`/vuokrasuhteet/${id}/sopimus/esikatselu`}
          className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
        >
          Avaa esikatselu
        </Link>
      </div>

      {isLandlord ? (
        <ContractForm tenancyId={id} terms={terms} />
      ) : (
        <div className="mt-8 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <p className="font-medium">Haluatko muutoksia?</p>
          <p className="mt-2 text-sm text-ink/70">
            Kerro vuokranantajalle, mitä haluaisit muuttaa. Hän muokkaa sopimusta, ja esikatselu
            päivittyy. Kumpikaan ei allekirjoita ennen kuin alkukatselmus on tehty.
          </p>
        </div>
      )}

      <p className="mt-10 text-sm">
        <Link href={`/vuokrasuhteet/${id}`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
