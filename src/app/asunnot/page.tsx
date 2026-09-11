import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { listProperties } from "@/lib/db/properties";
import { formatAddress } from "@/lib/property/schema";
import { AppShell } from "@/components/AppShell";
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
          {properties.map((property) => (
            <li key={property.id}>
              <Link
                href={"/asunnot/" + property.id}
                className="flex min-h-[var(--size-touch)] flex-col rounded-[var(--radius-panel)] border border-line bg-paper p-4"
              >
                <span className="font-medium">{property.name ?? formatAddress(property)}</span>
                {property.name ? (
                  <span className="mt-0.5 text-sm text-ink/70">{formatAddress(property)}</span>
                ) : null}
                <span className="mt-2 text-sm text-ink/60">
                  {TYPE_LABEL[property.propertyType]}
                  {property.rooms ? " · " + property.rooms + " h" : ""}
                  {property.areaM2 ? " · " + property.areaM2 + " m²" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-sm">
        <Link href="/" className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
