import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenancy, getTenancyProperty } from "@/lib/db/tenancies";
import { getInspectionOverview } from "@/lib/db/inspections";
import { inspectionRooms, mergeRooms, PHOTO_GUIDANCE, roomSlug } from "@/lib/inspection/rooms";
import { lockAvailableAt } from "@/lib/inspection/lock";
import { AppShell } from "@/components/AppShell";
import { InspectionControls } from "@/components/InspectionControls";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Alkukatselmus",
  robots: { index: false, follow: false },
};

/**
 * Alkukatselmus: huoneluettelo (CLAUDE.md 5.3).
 *
 * ===========================================================================
 * HUONE ON RAKENNE, EI TARKISTUSLISTA
 *
 * Sivu ei näytä, montako kohtaa on "tekemättä", eikä huoneita voi merkitä
 * valmiiksi. Kumpaakin varten pitäisi tietää, mikä on valmista — eikä sitä
 * tiedä kukaan muu kuin kuvaaja itse (Jukan linjaus 2026-09-11).
 *
 * Kuvamäärä näkyy, koska se on tosiasia. Se ei ole tavoite eikä vaatimus.
 * ===========================================================================
 */
export default async function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const tenancy = await getTenancy(user.id, id);
  if (!tenancy) notFound();

  const [overview, property] = await Promise.all([
    getInspectionOverview(user.id, id),
    getTenancyProperty(user.id, id),
  ]);

  const rooms = mergeRooms(
    inspectionRooms(property?.propertyType ?? "kerrostalo", property?.rooms ?? null),
    overview.photos.map((photo) => photo.room ?? ""),
  );

  const countByRoom = new Map<string, number>();
  for (const photo of overview.photos) {
    const key = photo.room ?? "";
    countByRoom.set(key, (countByRoom.get(key) ?? 0) + 1);
  }

  const locked = overview.inspection.status !== "open";
  const waitUntil = lockAvailableAt(overview.lockState);

  return (
    <AppShell>
      <h1 className="text-2xl">Alkukatselmus</h1>
      <p className="mt-2 text-ink/70">{PHOTO_GUIDANCE}</p>

      {locked ? (
        <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <p className="font-medium">Katselmus on lukittu</p>
          <p className="mt-2 text-sm text-ink/70">
            Kuvia ei voi enää lisätä. Uudet havainnot kirjataan huoltokirjaan, jossa ne pysyvät
            erillään siitä, millainen asunto oli vuokrasuhteen alkaessa.
          </p>
          <Link
            href={`/vuokrasuhteet/${id}/katselmus/poytakirja`}
            className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
          >
            Avaa pöytäkirja
          </Link>
        </div>
      ) : (
        <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <p className="text-sm text-ink/70">
            Kuvatkaa asunto kumpikin omalta osaltanne. Toisen kuvat näkyvät sinulle heti, ja
            molempien kuvat tulevat samaan pöytäkirjaan samanarvoisina. Kuvaa ei voi poistaa
            jälkeenpäin kumpikaan — se on se, mikä tekee pöytäkirjasta käyttökelpoisen, jos
            asunnon kunnosta tulee myöhemmin erimielisyyttä.
          </p>
        </div>
      )}

      <ul className="mt-6 flex flex-col gap-2">
        {rooms.map((room) => {
          const count = countByRoom.get(room.name) ?? 0;
          return (
            <li key={room.name}>
              <Link
                href={`/vuokrasuhteet/${id}/katselmus/${roomSlug(room.name)}`}
                className="flex min-h-[var(--size-touch)] items-center justify-between gap-4 rounded-[var(--radius-panel)] border border-line bg-paper px-5 py-3"
              >
                <span className="font-medium">{room.name}</span>
                <span className="shrink-0 text-sm text-ink/60">
                  {count === 0 ? "ei kuvia" : count === 1 ? "1 kuva" : `${count} kuvaa`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <InspectionControls
        tenancyId={id}
        isLandlord={overview.isLandlord}
        locked={locked}
        photoCount={overview.photos.length}
        lockMessage={overview.lock.allowed ? null : overview.lock.message}
        canLock={overview.lock.allowed}
        alreadyReady={overview.lockState.tenantReadyAt !== null}
        waitUntil={waitUntil ? waitUntil.toISOString() : null}
      />

      <p className="mt-10 text-sm">
        <Link href={`/vuokrasuhteet/${id}`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
