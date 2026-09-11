import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getContractTerms } from "@/lib/db/contracts";
import { getTenancy, listParties } from "@/lib/db/tenancies";
import { ContractForm } from "./ContractForm";
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
    listParties(user.id, id),
  ]);

  const tenantCount = parties.filter((party) => party.role === "tenant").length;

  return (
    <main className="mx-auto min-h-dvh max-w-[var(--container-content)] px-6 py-10">
      <h1 className="text-2xl">Vuokrasopimus</h1>
      <p className="mt-2 text-ink/70">
        {isLandlord
          ? "Täytä ehdot ja katso esikatselu. Sopimus allekirjoitetaan vasta alkukatselmuksen jälkeen."
          : "Tämä on sopimusluonnos. Voit lukea sen ennen allekirjoitusta."}
      </p>

      <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <p className="font-medium">Esikatselu</p>
        <p className="mt-2 text-sm text-ink/70">
          Asiakirja avautuu PDF:nä. Se on sama asiakirja, joka allekirjoitetaan.
        </p>
        <a
          href={`/vuokrasuhteet/${id}/sopimus/esikatselu`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
        >
          Avaa esikatselu
        </a>
      </div>

      {isLandlord ? (
        <ContractForm tenancyId={id} terms={terms} tenantCount={tenantCount} />
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
    </main>
  );
}
