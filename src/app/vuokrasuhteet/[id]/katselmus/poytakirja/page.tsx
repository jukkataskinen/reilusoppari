import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenancy } from "@/lib/db/tenancies";
import { getInspectionOverview } from "@/lib/db/inspections";
import { AppShell } from "@/components/AppShell";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Katselmuspöytäkirja",
  robots: { index: false, follow: false },
};

/**
 * Pöytäkirjan esikatselu sovelluksen sisällä.
 *
 * Sama ratkaisu kuin sopimuksessa (DECISIONS.md 2026-09-11): asiakirja
 * näytetään sivulla, jolla on tie takaisin, ja toinen painike tallentaa sen.
 * Kotinäytölle asennetussa sovelluksessa suoraan PDF:ään vievä linkki on
 * umpikuja — siinä näkymässä ei ole sulkemispainiketta.
 */
export default async function ProtocolPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  if (!(await getTenancy(user.id, id))) notFound();

  const overview = await getInspectionOverview(user.id, id);
  const pdf = `/vuokrasuhteet/${id}/katselmus/poytakirja/pdf`;

  if (overview.inspection.status === "open") {
    return (
      <AppShell>
        <h1 className="text-2xl">Katselmuspöytäkirja</h1>
        <p className="mt-3 text-ink/70">
          Pöytäkirja syntyy, kun katselmus lukitaan. Siihen asti kuvat ovat luonnos, jota voi
          vielä täydentää.
        </p>
        <p className="mt-8 text-sm">
          <Link
            href={`/vuokrasuhteet/${id}/katselmus`}
            className="underline underline-offset-4"
          >
            Takaisin katselmukseen
          </Link>
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-2xl">Katselmuspöytäkirja</h1>
      <p className="mt-2 text-ink/70">
        Tämä on sama asiakirja, joka allekirjoitetaan sopimuksen kanssa.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/vuokrasuhteet/${id}/katselmus`}
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper"
        >
          {fi.common.back}
        </Link>
        <a
          href={pdf}
          download="alkukatselmus.pdf"
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
        >
          Tallenna PDF
        </a>
      </div>

      <object
        data={pdf}
        type="application/pdf"
        className="mt-6 h-[78vh] w-full rounded-[var(--radius-panel)] border border-line bg-paper"
      >
        <div className="p-5">
          <p className="font-medium">Selain ei näytä asiakirjaa tässä</p>
          <p className="mt-2 text-sm text-ink/70">
            Tallenna se yllä olevasta painikkeesta ja avaa laitteen omasta tiedostonäkymästä.
          </p>
        </div>
      </object>
    </AppShell>
  );
}
