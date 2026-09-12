import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenancy } from "@/lib/db/tenancies";
import { listRentPeriods } from "@/lib/db/rent";
import { AppShell } from "@/components/AppShell";
import { RentPeriodCard } from "@/components/RentPeriodCard";
import { PushToggle } from "@/components/PushToggle";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Vuokranmaksu",
  robots: { index: false, follow: false },
};

/**
 * Vuokranmaksun historia ja kuittaus (CLAUDE.md 5.5).
 *
 * ===========================================================================
 * SAMA NÄKYMÄ MOLEMMILLE, ERI TOIMINNOT
 *
 * Historia näkyy kummallekin kokonaisuudessaan. Vuokranantaja kuittaa,
 * vuokralainen kommentoi. Kumpikaan ei näe toisesta mitään, mitä toinen ei
 * itse näe — sama periaate kuin katselmuksessa ja sopimuskeskustelussa.
 *
 * Aiemmin tässä oli ohjelaatikko maksuvaikeuksista kahden peräkkäisen
 * "Ei vielä" jälkeen. Jukka poisti sen 2026-09-12: muistutus kuuluu
 * ilmoituksiin, ei sivun laitaan, ja se annetaan hänen määrittelemässään
 * järjestyksessä (ks. DECISIONS.md).
 * ===========================================================================
 */
export default async function RentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const tenancy = await getTenancy(user.id, id);
  if (!tenancy) notFound();

  const isLandlord = tenancy.landlordUserId === user.id;
  const periods = await listRentPeriods(user.id, id);

  return (
    <AppShell>
      <h1 className="text-2xl">Vuokranmaksu</h1>
      <p className="mt-2 text-ink/70">
        {isLandlord
          ? "Merkitse kerran kuussa, tuliko vuokra. Merkintä näkyy vuokralaiselle, ja hän voi kommentoida sitä."
          : "Näet tästä, mitä vuokranantaja on merkinnyt kunkin kuukauden kohdalle. Voit kommentoida merkintää."}
      </p>

      {periods.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <p className="font-medium">Vuokrakausia ei ole vielä</p>
          <p className="mt-2 text-sm text-ink/70">
            Ne syntyvät, kun sopimus on allekirjoitettu. Silloin vuokra ja eräpäivä ovat
            lopulliset.
          </p>
        </div>
      ) : null}

      {/*
        Ilmoituskehotus juuri tässä: vuokranmaksu on se, mistä herätteet
        tulevat, ja kehotus tuntemattomasta palvelusta ensimmäisellä
        kirjautumisella olisi se, joka suljetaan katsomatta.
      */}
      {periods.length > 0 ? <PushToggle /> : null}

      <ul className="mt-6 flex flex-col gap-4">
        {periods.map((period) => (
          <RentPeriodCard
            key={period.id}
            tenancyId={id}
            period={period}
            isLandlord={isLandlord}
          />
        ))}
      </ul>

      <p className="mt-10 text-sm">
        <Link href={`/vuokrasuhteet/${id}`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
