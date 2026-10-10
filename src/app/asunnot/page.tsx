import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { listProperties } from "@/lib/db/properties";
import { formatAddress } from "@/lib/property/schema";
import { listPropertyTenancies } from "@/lib/db/tenancy-summaries";
import { propertyStatus, propertyStatusView } from "@/lib/property/status";
import { AppShell } from "@/components/AppShell";
import { CARD_ACCENT, StatusBadge } from "@/components/StatusBadge";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = { title: fi.nav.properties };

const TYPE_LABEL: Record<string, string> = {
  kerrostalo: "Kerrostalo",
  rivitalo: "Rivi- tai paritalo",
  omakotitalo: "Omakotitalo",
  muu: "Muu",
};

/**
 * Asuntolista (CLAUDE.md 5.1).
 *
 * Suojaus tehdään tässä eikä middlewaressa, koska osa sovelluksen reiteistä
 * on tarkoituksella julkisia (kutsulinkki, todistuksen jakolinkki).
 */
export default async function PropertiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const properties = await listProperties(user.id);
  // Kaikkien asuntojen vuokrasuhteet kerralla, ei asunto kerrallaan.
  const tenancies = await listPropertyTenancies(
    user.id,
    properties.map((property) => property.id),
  );

  return (
    <AppShell>
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl">{fi.nav.properties}</h1>
        <Link
          href="/asunnot/uusi"
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper"
        >
          Lisää asunto
        </Link>
      </div>

      {/*
        Kuitin kuvaus on tassa nakyvissa, koska kuitti on kadessa kaupan
        ovella eika silloin muisteta minka asunnon alta kuvaus loytyy.
      */}
      {properties.length > 0 ? (
        <Link
          href="/kuitti"
          className="mt-6 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
        >
          Kuvaa kuitti
        </Link>
      ) : null}

      {properties.length === 0 ? (
        <div className="mt-8 rounded-[var(--radius-panel)] border border-line bg-paper p-6">
          <p className="font-medium">Ei vielä asuntoja</p>
          <p className="mt-2 text-ink/70">
            Lisää ensimmäinen asunto, niin voit luoda sille vuokrasuhteen. Asunnolle
            syntyy samalla valmis lista katselmuksen kohdista.
          </p>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {properties.map((property) => {
            const view = propertyStatusView(
              property.id,
              propertyStatus(tenancies.get(property.id) ?? []),
            );
            return (
              <li
                key={property.id}
                className={`relative flex flex-col rounded-[var(--radius-panel)] border border-line bg-paper p-4 ${CARD_ACCENT[view.tone]}`}
              >
                {/*
                  Koko kortti avaa asunnon (linkin ::after peittää kortin), ja
                  vuokrasuhteen linkki on sen päällä omana kosketuskohteenaan.
                  Linkkejä ei voi sijoittaa sisäkkäin.
                */}
                <Link
                  href={"/asunnot/" + property.id}
                  className="font-medium after:absolute after:inset-0 after:rounded-[var(--radius-panel)] after:content-['']"
                >
                  {property.name ?? formatAddress(property)}
                </Link>
                {property.name ? (
                  <span className="mt-0.5 text-sm text-ink/70">{formatAddress(property)}</span>
                ) : null}
                <span className="mt-2 text-sm text-ink/60">
                  {TYPE_LABEL[property.propertyType]}
                  {property.rooms ? " · " + property.rooms + " h" : ""}
                  {property.areaM2 ? " · " + property.areaM2 + " m²" : ""}
                </span>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
                  {view.detail ? <span className="text-sm text-ink/70">{view.detail}</span> : null}
                </div>
                {view.note ? <p className="mt-2 text-sm text-ink/70">{view.note}</p> : null}
                <Link
                  href={view.href}
                  className="relative z-10 mt-2 inline-flex min-h-[var(--size-touch)] items-center self-start text-sm font-medium underline underline-offset-4"
                >
                  {view.linkLabel}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
