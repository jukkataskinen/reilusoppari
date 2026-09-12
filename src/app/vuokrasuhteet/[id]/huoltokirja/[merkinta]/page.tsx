import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenancy } from "@/lib/db/tenancies";
import { getMaintenanceEntry, KIND_LABEL } from "@/lib/db/maintenance";
import { photoUrl } from "@/lib/db/inspections";
import { AppShell } from "@/components/AppShell";
import { PhotoCapture } from "@/components/PhotoCapture";
import { MaintenanceEntryActions } from "@/components/MaintenanceEntryActions";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Huoltokirjan merkintä",
  robots: { index: false, follow: false },
};

function hetki(iso: string): string {
  return new Date(iso).toLocaleString("fi-FI", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Yksi huoltokirjan merkintä kuvineen ja keskusteluineen (CLAUDE.md 5.6).
 *
 * Keskustelu on aikajärjestyksessä ja näkyy molemmille kokonaan. Peruttu
 * merkintä näytetään yliviivattuna: se on korjattu pois, mutta se on ollut
 * olemassa, ja loppukatselmuksessa se voi olla merkityksellistä.
 */
export default async function EntryPage({
  params,
}: {
  params: Promise<{ id: string; merkinta: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id, merkinta } = await params;
  const tenancy = await getTenancy(user.id, id);
  if (!tenancy) notFound();

  const entry = await getMaintenanceEntry(user.id, id, merkinta);
  if (!entry) notFound();

  const isLandlord = tenancy.landlordUserId === user.id;

  const photos = await Promise.all(
    entry.photos.map(async (photo) => ({ ...photo, url: await photoUrl(photo.storagePath) })),
  );

  return (
    <AppShell>
      <p className="text-sm text-ink/60">{KIND_LABEL[entry.kind]}</p>
      <h1 className={"mt-1 text-2xl " + (entry.cancelledAt ? "text-ink/50 line-through" : "")}>
        {entry.title}
      </h1>

      <p className="mt-2 text-sm text-ink/60">
        {entry.authorName ??
          (entry.authorRole === "landlord" ? "Vuokranantaja" : "Vuokralainen")}{" "}
        · {hetki(entry.createdAt)}
      </p>

      {entry.body ? <p className="mt-4 whitespace-pre-line">{entry.body}</p> : null}

      {entry.cancelledAt ? (
        <p className="mt-4 rounded-[var(--radius-panel)] border border-line bg-paper p-4 text-sm text-ink/70">
          Merkintä on peruttu {hetki(entry.cancelledAt)}
          {entry.cancelledByName ? ` (${entry.cancelledByName})` : ""}. Se jää huoltokirjaan,
          koska merkintöjä ei poisteta. Syy on keskustelussa alla.
        </p>
      ) : entry.resolvedAt ? (
        <p className="mt-4 rounded-[var(--radius-panel)] border border-line bg-paper p-4 text-sm text-ink/70">
          Merkitty korjatuksi {hetki(entry.resolvedAt)}
          {entry.resolvedByName ? ` (${entry.resolvedByName})` : ""}.
        </p>
      ) : null}

      {entry.cancelledAt ? null : (
        <PhotoCapture
          endpoint={`/vuokrasuhteet/${id}/huoltokirja/${merkinta}/kuva`}
          label="Lisää kuva"
        />
      )}

      {photos.length > 0 ? (
        <div className="mt-6 flex flex-col gap-6">
          {photos.map((photo) => (
            <figure
              key={photo.id}
              className="rounded-[var(--radius-panel)] border border-line bg-paper p-3"
            >
              {photo.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- Signed URL vanhenee tunnissa, joten Next-optimointi ei sovi.
                <img src={photo.url} alt={photo.note ?? entry.title} className="w-full rounded-[10px]" />
              ) : (
                <p className="p-4 text-sm text-ink/60">Kuvaa ei juuri nyt saada näkyviin.</p>
              )}
              <figcaption className="mt-3 px-1 pb-1">
                {photo.note ? <p className="text-sm">{photo.note}</p> : null}
                <p className="mt-1 text-sm text-ink/60">{hetki(photo.takenAtServer)}</p>
                <p className="mt-0.5 font-mono text-xs text-ink/40">
                  {photo.sha256.slice(0, 16)}…
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      {entry.comments.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-medium">Keskustelu</h2>
          <ul className="mt-4 flex flex-col gap-4">
            {entry.comments.map((comment) => (
              <li key={comment.id}>
                <p className="text-sm text-ink/60">
                  {comment.authorName ??
                    (comment.authorRole === "landlord" ? "Vuokranantaja" : "Vuokralainen")}
                  {comment.isSelf ? " (sinä)" : ""} · {hetki(comment.createdAt)}
                </p>
                <p className="mt-1">{comment.body}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <MaintenanceEntryActions
        tenancyId={id}
        entryId={merkinta}
        isLandlord={isLandlord}
        isAuthor={entry.isSelf}
        resolved={entry.resolvedAt !== null}
        cancelled={entry.cancelledAt !== null}
      />

      <p className="mt-10 text-sm">
        <Link href={`/vuokrasuhteet/${id}/huoltokirja`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
