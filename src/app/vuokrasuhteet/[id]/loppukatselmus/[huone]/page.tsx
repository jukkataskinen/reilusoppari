import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenancy, getTenancyProperty } from "@/lib/db/tenancies";
import { getInspectionOverview, photoUrl } from "@/lib/db/inspections";
import {
  findRoomBySlug,
  inspectionRooms,
  mergeRooms,
  normalizeRoomName,
  roomSlug,
} from "@/lib/inspection/rooms";
import { AppShell } from "@/components/AppShell";
import { InspectionRoomView } from "@/components/InspectionRoomView";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Loppukatselmus",
  robots: { index: false, follow: false },
};

/**
 * Loppukatselmuksen yhden tilan näkymä (CLAUDE.md 5.8).
 *
 * ===========================================================================
 * ALKUKUVAT OVAT MUKANA, JOTTA ON MIHIN VERRATA
 *
 * Sama näkymä kuin alkukatselmuksessa, mutta alkukatselmuksen kuvat näkyvät
 * alla. Ilman niitä loppukatselmus olisi vain toinen kuvaussessio, eikä
 * kukaan muistaisi, miltä lattia näytti kolme vuotta sitten.
 *
 * Alkukuvia ei voi muuttaa eikä merkitä: ne on lukittu ja allekirjoitettu.
 * ===========================================================================
 */
export default async function FinalRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; huone: string }>;
  searchParams: Promise<{ nimi?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id, huone } = await params;
  const { nimi } = await searchParams;

  if (!(await getTenancy(user.id, id))) notFound();

  const [final, initial, property] = await Promise.all([
    getInspectionOverview(user.id, id, "final"),
    getInspectionOverview(user.id, id, "initial"),
    getTenancyProperty(user.id, id),
  ]);

  const rooms = mergeRooms(
    inspectionRooms(property?.propertyType ?? "kerrostalo", property?.rooms ?? null),
    [
      ...initial.photos.map((photo) => photo.room ?? ""),
      ...final.photos.map((photo) => photo.room ?? ""),
    ],
  );

  const known = findRoomBySlug(rooms, huone);
  const proposed = nimi ? normalizeRoomName(nimi) : null;
  const room =
    known ?? (proposed && roomSlug(proposed) === huone ? { name: proposed, hints: [] } : null);

  if (!room) notFound();

  const [photos, previousPhotos] = await Promise.all([
    Promise.all(
      final.photos
        .filter((photo) => photo.room === room.name)
        .map(async (photo) => ({ ...photo, url: await photoUrl(photo.storagePath) })),
    ),
    Promise.all(
      initial.photos
        .filter((photo) => photo.room === room.name)
        .map(async (photo) => ({ ...photo, url: await photoUrl(photo.storagePath) })),
    ),
  ]);

  return (
    <AppShell>
      <h1 className="text-2xl">{room.name}</h1>

      <InspectionRoomView
        roomName={room.name}
        hints={room.hints}
        photos={photos}
        previousPhotos={previousPhotos}
        tenancyId={id}
        endpoint={`/vuokrasuhteet/${id}/loppukatselmus/kuva`}
        locked={final.inspection.status !== "open"}
        lockedMessage="Loppukatselmus on lukittu, joten kuvia ei voi enää lisätä."
      />

      <p className="mt-10 text-sm">
        <Link
          href={`/vuokrasuhteet/${id}/loppukatselmus`}
          className="underline underline-offset-4"
        >
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
