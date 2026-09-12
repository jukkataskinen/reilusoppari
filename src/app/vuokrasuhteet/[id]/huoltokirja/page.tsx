import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenancy } from "@/lib/db/tenancies";
import { KIND_LABEL, listMaintenanceEntries } from "@/lib/db/maintenance";
import { AppShell } from "@/components/AppShell";
import { MaintenanceForm } from "@/components/MaintenanceForm";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Huoltokirja",
  robots: { index: false, follow: false },
};

function päivä(iso: string): string {
  return new Date(iso).toLocaleDateString("fi-FI", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

/**
 * Huoltokirja (CLAUDE.md 5.6).
 *
 * ===========================================================================
 * YHTEINEN KIRJA, EI ILMOITUSLAATIKKO
 *
 * Kumpi tahansa kirjaa, kumpikin näkee kaiken. Huoltokirja on se, johon
 * loppukatselmuksessa nojataan: milloin vika ilmoitettiin, milloin se
 * korjattiin, ja mitä siitä sanottiin matkan varrella.
 *
 * Siksi merkintää ei poisteta. Virheellisen voi perua, ja peruminen näkyy —
 * merkintä jää listaan ja syy jää kommenttina sen viereen.
 * ===========================================================================
 */
export default async function MaintenancePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  if (!(await getTenancy(user.id, id))) notFound();

  const entries = await listMaintenanceEntries(user.id, id);
  const open = entries.filter(
    (entry) => entry.kind === "defect" && !entry.resolvedAt && !entry.cancelledAt,
  );

  return (
    <AppShell>
      <h1 className="text-2xl">Huoltokirja</h1>
      <p className="mt-2 text-ink/70">
        Viat, korjaukset ja muut merkinnät samassa paikassa. Kumpi tahansa teistä voi kirjata, ja
        molemmat näkevät kaiken.
      </p>

      {open.length > 0 ? (
        <p className="mt-4 text-sm text-ink/60">
          {open.length === 1 ? "Yksi vika on avoinna." : `${open.length} vikaa on avoinna.`}
        </p>
      ) : null}

      <MaintenanceForm tenancyId={id} />

      {entries.length === 0 ? (
        <p className="mt-8 text-sm text-ink/60">
          Huoltokirja on vielä tyhjä. Se on hyvä merkki.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link
                href={`/vuokrasuhteet/${id}/huoltokirja/${entry.id}`}
                className="block rounded-[var(--radius-panel)] border border-line bg-paper p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p
                    className={
                      "font-medium " + (entry.cancelledAt ? "text-ink/50 line-through" : "")
                    }
                  >
                    {entry.title}
                  </p>
                  <p className="text-sm text-ink/60">
                    {KIND_LABEL[entry.kind]} · {päivä(entry.createdAt)}
                  </p>
                </div>

                <p className="mt-1 text-sm text-ink/60">
                  {entry.authorName ??
                    (entry.authorRole === "landlord" ? "Vuokranantaja" : "Vuokralainen")}
                  {entry.photos.length > 0
                    ? ` · ${entry.photos.length} ${entry.photos.length === 1 ? "kuva" : "kuvaa"}`
                    : ""}
                  {entry.comments.length > 0
                    ? ` · ${entry.comments.length} ${
                        entry.comments.length === 1 ? "kommentti" : "kommenttia"
                      }`
                    : ""}
                </p>

                {entry.cancelledAt ? (
                  <p className="mt-2 text-sm text-ink/60">Peruttu {päivä(entry.cancelledAt)}</p>
                ) : entry.resolvedAt ? (
                  <p className="mt-2 text-sm text-ink/70">Korjattu {päivä(entry.resolvedAt)}</p>
                ) : entry.kind === "defect" ? (
                  <p className="mt-2 text-sm text-coral">Avoinna</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-sm">
        <Link href={`/vuokrasuhteet/${id}`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
