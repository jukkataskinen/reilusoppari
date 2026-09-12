import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenancy } from "@/lib/db/tenancies";
import { listRentPeriods } from "@/lib/db/rent";
import { shouldOfferGuidance } from "@/lib/rent/confirmation";
import { AppShell } from "@/components/AppShell";
import { RentPeriodCard } from "@/components/RentPeriodCard";
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
 * OHJE MAKSUVAIKEUKSISTA NÄYTETÄÄN VUOKRALAISELLE
 *
 * Kahden peräkkäisen "Ei vielä" jälkeen näytetään ohje ja linkki neuvontaan —
 * eikä muuta. Ei muistutuksia, ei perintää, ei merkintää mihinkään
 * rekisteriin. Ohje on vuokralaiselle, koska hän sitä tarvitsee; se ei ole
 * vuokranantajalle tarkoitettu työkalu painostaa.
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

  const offerGuidance =
    !isLandlord &&
    shouldOfferGuidance(
      periods.map((period) => ({ dueDate: period.dueDate, confirmation: period.confirmation })),
    );

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

      {offerGuidance ? (
        <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <p className="font-medium">Jos vuokranmaksu on vaikeaa</p>
          <p className="mt-2 text-sm text-ink/70">
            Kahtena kuukautena peräkkäin vuokraa ei ole merkitty saapuneeksi. Apua kannattaa
            hakea ajoissa ja se on maksutonta: talous- ja velkaneuvonta auttaa maksusuunnitelman
            tekemisessä, ja asumisen tukia voi hakea takautuvasti.
          </p>
          <p className="mt-3 text-sm">
            <Link
              href="https://oikeus.fi/fi/index/esitteet/talous-javelkaneuvonta.html"
              className="underline underline-offset-4"
            >
              Talous- ja velkaneuvonta
            </Link>
          </p>
          <p className="mt-3 text-sm text-ink/60">
            Tämä teksti näkyy vain sinulle. Reilusoppari ei peri saatavia eikä välitä tietoa
            maksuista minnekään.
          </p>
        </div>
      ) : null}

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
