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
  title: "Loppukatselmus",
  robots: { index: false, follow: false },
};

/**
 * Loppukatselmus (CLAUDE.md 5.8).
 *
 * ===========================================================================
 * SAMAT TILAT KUIN ALUSSA, SAMASSA JÄRJESTYKSESSÄ
 *
 * Tilaluettelo on sama kuin alkukatselmuksessa ja täydennettynä niillä
 * tiloilla, joita jompikumpi kuvasi silloin. Järjestys on sama, jotta tilat
 * voi käydä läpi pari kerrallaan ilman etsimistä.
 *
 * Kuvamäärä näkyy kahtena lukuna: nyt otetut ja alussa otetut. Jälkimmäinen
 * kertoo, mistä tiloista vertailukuvaa ylipäätään on.
 * ===========================================================================
 */
export default async function FinalInspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const tenancy = await getTenancy(user.id, id);
  if (!tenancy) notFound();

  const [final, initial, property] = await Promise.all([
    getInspectionOverview(user.id, id, "final"),
    getInspectionOverview(user.id, id, "initial"),
    getTenancyProperty(user.id, id),
  ]);

  // Tilaluettelo alkukatselmuksesta: siellä ovat myös itse lisätyt tilat.
  const rooms = mergeRooms(
    inspectionRooms(property?.propertyType ?? "kerrostalo", property?.rooms ?? null),
    [
      ...initial.photos.map((photo) => photo.room ?? ""),
      ...final.photos.map((photo) => photo.room ?? ""),
    ],
  );

  const countIn = (photos: typeof final.photos, room: string) =>
    photos.filter((photo) => photo.room === room).length;

  const locked = final.inspection.status !== "open";
  const waitUntil = lockAvailableAt(final.lockState);

  return (
    <AppShell>
      <h1 className="text-2xl">Loppukatselmus</h1>
      <p className="mt-2 text-ink/70">{PHOTO_GUIDANCE}</p>

      {locked ? (
        <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <p className="font-medium">Loppukatselmus on lukittu</p>
          <p className="mt-2 text-sm text-ink/70">
            Kuvia ei voi enää lisätä. Pöytäkirja allekirjoitetaan, ja sen jälkeen kumpikin antaa
            toisestaan arvion ja saa oman vuokratodistuksensa.
          </p>
          <Link
            href={`/vuokrasuhteet/${id}/loppukatselmus/poytakirja`}
            className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
          >
            Avaa pöytäkirja
          </Link>
        </div>
      ) : (
        <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <p className="text-sm text-ink/70">
            Samat tilat kuin vuokrasuhteen alussa. Jokaisen tilan kohdalla näet alkukatselmuksen
            kuvat, joten kuntoa voi verrata suoraan. Tavanomainen kuluminen ei ole vahinko — se
            on osa asumista.
          </p>
        </div>
      )}

      <ul className="mt-6 flex flex-col gap-2">
        {rooms.map((room) => {
          const now = countIn(final.photos, room.name);
          const then = countIn(initial.photos, room.name);

          return (
            <li key={room.name}>
              <Link
                href={`/vuokrasuhteet/${id}/loppukatselmus/${roomSlug(room.name)}`}
                className="flex min-h-[var(--size-touch)] items-center justify-between gap-4 rounded-[var(--radius-panel)] border border-line bg-paper px-5 py-3"
              >
                <span className="font-medium">{room.name}</span>
                <span className="shrink-0 text-sm text-ink/60">
                  {now === 0 ? "ei kuvia" : `${now} nyt`}
                  {then > 0 ? ` · ${then} alussa` : ""}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <InspectionControls
        tenancyId={id}
        kind="final"
        isLandlord={final.isLandlord}
        locked={locked}
        photoCount={final.photos.length}
        lockMessage={final.lock.allowed ? null : final.lock.message}
        canLock={final.lock.allowed}
        alreadyReady={final.lockState.tenantReadyAt !== null}
        waitUntil={waitUntil ? waitUntil.toISOString() : null}
      />

      <p className="mt-10 text-sm">
        <Link href={`/vuokrasuhteet/${id}/paattyminen`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
