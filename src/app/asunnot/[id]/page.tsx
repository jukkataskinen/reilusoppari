import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getProperty, listCheckpoints } from "@/lib/db/properties";
import { formatAddress } from "@/lib/property/schema";
import { AppShell } from "@/components/AppShell";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = { title: "Asunto" };

const TYPE_LABEL: Record<string, string> = {
  kerrostalo: "Kerrostalo",
  rivitalo: "Rivi- tai paritalo",
  omakotitalo: "Omakotitalo",
  muu: "Muu",
};

const TENURE_LABEL: Record<string, string> = {
  osake: "Asunto-osake",
  kiinteisto: "Kiinteistö",
  muu: "Muu",
};

/**
 * Asunnon näkymä: perustiedot ja katselmuksen oletuskohdat.
 *
 * Toisen käyttäjän asunto antaa 404:n eikä 403:aa: vastaus on sama kuin
 * olemattomalle id:lle, jotta id:n olemassaolo ei paljastu (CLAUDE.md kohta 4).
 */
export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const property = await getProperty(user.id, id);
  if (!property) notFound();

  const checkpoints = await listCheckpoints(user.id, id);

  const rooms: { room: string; items: string[] }[] = [];
  for (const checkpoint of checkpoints) {
    const last = rooms[rooms.length - 1];
    if (last && last.room === checkpoint.room) last.items.push(checkpoint.item);
    else rooms.push({ room: checkpoint.room, items: [checkpoint.item] });
  }

  return (
    <AppShell>
      <h1 className="text-2xl">{property.name ?? formatAddress(property)}</h1>
      {property.name ? <p className="mt-1 text-ink/70">{formatAddress(property)}</p> : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={`/asunnot/${property.id}/vuokrasuhde/uusi`}
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper"
        >
          {fi.tenancy.new}
        </Link>
        {/*
          Verolaskelma on asunnon alla eikä vuokrasuhteen: yhdessä vuodessa voi
          olla kaksi vuokralaista peräkkäin, ja hoitovastike juoksee myös
          tyhjän kuukauden yli.
        */}
        {/*
          Toistuva kulu on asunnon eikä vuokrasuhteen: vastike juoksee myös
          tyhjän kuukauden yli ja vuokralaisen vaihtuessa.
        */}
        <Link
          href={`/asunnot/${property.id}/kulut`}
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
        >
          Kulut
        </Link>
        <Link
          href={`/asunnot/${property.id}/toistuvat-kulut`}
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
        >
          Toistuvat kulut
        </Link>
        <Link
          href={`/asunnot/${property.id}/verolaskelma`}
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
        >
          Verolaskelma
        </Link>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <div>
          <dt className="text-sm text-ink/60">Tyyppi</dt>
          <dd className="mt-0.5">{TYPE_LABEL[property.propertyType]}</dd>
        </div>
        {property.rooms ? (
          <div>
            <dt className="text-sm text-ink/60">Huoneita</dt>
            <dd className="mt-0.5">{property.rooms}</dd>
          </div>
        ) : null}
        {property.areaM2 ? (
          <div>
            <dt className="text-sm text-ink/60">Pinta-ala</dt>
            <dd className="mt-0.5">{property.areaM2} m²</dd>
          </div>
        ) : null}
        {property.tenure ? (
          <div>
            <dt className="text-sm text-ink/60">Hallintamuoto</dt>
            <dd className="mt-0.5">{TENURE_LABEL[property.tenure]}</dd>
          </div>
        ) : null}
        {property.housingCompany ? (
          <div className="col-span-2">
            <dt className="text-sm text-ink/60">Taloyhtiö</dt>
            <dd className="mt-0.5">{property.housingCompany}</dd>
          </div>
        ) : null}
      </dl>

      <section className="mt-10">
        <h2 className="text-lg">Katselmuksen kohdat</h2>
        {/*
          Oletuslista on muistin tueksi eikä rajoite (DECISIONS.md 2026-09-10).
          Tämä on sanottava tässä, ennen kuin kumpikaan osapuoli on nähnyt
          listan katselmuksessa — muuten lista näyttää siltä, että se on
          "oikea" ja omat lisäykset ovat poikkeus.
        */}
        <p className="mt-2 text-ink/70">
          {checkpoints.length} kohtaa. {fi.inspection.listIsAHint}
        </p>

        <div className="mt-5 flex flex-col gap-4">
          {rooms.map((group) => (
            <div
              key={group.room}
              className="rounded-[var(--radius-panel)] border border-line bg-paper p-4"
            >
              <h3 className="font-medium">{group.room}</h3>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink/70">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-10 text-sm">
        <Link href="/asunnot" className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
