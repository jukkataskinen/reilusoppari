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
  PHOTO_GUIDANCE,
  roomSlug,
} from "@/lib/inspection/rooms";
import { AppShell } from "@/components/AppShell";
import { PhotoCapture } from "@/components/PhotoCapture";
import { FlagPhoto } from "@/components/FlagPhoto";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Katselmus",
  robots: { index: false, follow: false },
};

function formatMoment(iso: string): string {
  return new Date(iso).toLocaleString("fi-FI", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Yhden huoneen kuvat ja kameranäkymä (CLAUDE.md 5.3).
 *
 * ===========================================================================
 * MOLEMPIEN KUVAT SAMASSA VIRRASSA
 *
 * Kuvat ovat aikajärjestyksessä eivätkä kuvaajan mukaan ryhmiteltyinä.
 * Ryhmittely tekisi näkymästä kaksi listaa — "minun" ja "hänen" — ja
 * katselmus on yhteinen. Kuvaaja lukee jokaisen kuvan alta.
 *
 * VIHJEET OVAT YHDELLÄ RIVILLÄ
 *
 * Huoneen vihjeet ovat luettelo siitä, mitä tässä huoneessa yleensä
 * kannattaa katsoa. Ne ovat tarkoituksella tekstiä eivätkä ruutuja: mitään
 * ei voi merkitä tehdyksi, eikä mikään tarkista onko niistä kuva.
 * ===========================================================================
 */
export default async function RoomPage({
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

  /*
    Uusi huone ei ole vielä luettelossa: se syntyy vasta ensimmäisestä
    kuvasta. Nimi tulee silloin kyselyparametrista, mutta vain jos se todella
    vastaa polun tunnistetta — muuten osoitteen voisi väärentää näyttämään
    toisen huoneen kuvat toisen huoneen otsikon alla.
  */
  const known = findRoomBySlug(rooms, huone);
  const proposed = nimi ? normalizeRoomName(nimi) : null;
  const room =
    known ??
    (proposed && roomSlug(proposed) === huone ? { name: proposed, hints: [] } : null);

  if (!room) notFound();

  const photos = overview.photos.filter((photo) => photo.room === room.name);
  const locked = overview.inspection.status !== "open";

  const withUrls = await Promise.all(
    photos.map(async (photo) => ({ ...photo, url: await photoUrl(photo.storagePath) })),
  );

  return (
    <AppShell>
      <h1 className="text-2xl">{room.name}</h1>
      <p className="mt-2 text-ink/70">{PHOTO_GUIDANCE}</p>

      {room.hints.length > 0 ? (
        <p className="mt-3 text-sm text-ink/60">
          Tässä huoneessa katsotaan usein: {room.hints.join(", ").toLowerCase()}. Nämä ovat
          vihjeitä, eivät vaatimuksia — kuvaa se, minkä itse katsot tärkeäksi.
        </p>
      ) : null}

      {locked ? (
        <p className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5 text-sm text-ink/70">
          Katselmus on lukittu, joten kuvia ei voi enää lisätä.
        </p>
      ) : (
        <PhotoCapture tenancyId={id} room={room.name} />
      )}

      <div className="mt-8 flex flex-col gap-6">
        {withUrls.length === 0 ? (
          <p className="text-sm text-ink/60">Tästä tilasta ei ole vielä kuvia.</p>
        ) : null}

        {withUrls.map((photo) => (
          <figure key={photo.id} className="rounded-[var(--radius-panel)] border border-line bg-paper p-3">
            {photo.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- Signed URL vanhenee tunnissa, joten Next-optimointi ei sovi.
              <img
                src={photo.url}
                alt={photo.note ?? `Kuva: ${room.name}`}
                className="w-full rounded-[10px]"
              />
            ) : (
              <p className="p-4 text-sm text-ink/60">Kuvaa ei juuri nyt saada näkyviin.</p>
            )}

            <figcaption className="mt-3 px-1 pb-1">
              {photo.note ? <p className="text-sm">{photo.note}</p> : null}
              <p className="mt-1 text-sm text-ink/60">
                {photo.uploaderName ?? (photo.uploaderRole === "landlord" ? "Vuokranantaja" : "Vuokralainen")}
                {" · "}
                {formatMoment(photo.takenAtServer)}
              </p>
              {/*
                Tiiviste näkyy jo tässä, ei vasta pöytäkirjassa. Se on kuvan
                tunniste: sillä voi osoittaa, että tiedosto on sama kuin se,
                joka allekirjoitettiin.
              */}
              <p className="mt-0.5 font-mono text-xs text-ink/40">{photo.sha256.slice(0, 16)}…</p>
              {photo.flagged ? (
                <p className="mt-2 text-sm text-coral">
                  Merkitty kuulumattomaksi{photo.flaggedReason ? `: ${photo.flaggedReason}` : ""}
                </p>
              ) : (
                <FlagPhoto tenancyId={id} photoId={photo.id} disabled={locked} />
              )}
            </figcaption>
          </figure>
        ))}
      </div>

      <p className="mt-10 text-sm">
        <Link href={`/vuokrasuhteet/${id}/katselmus`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
