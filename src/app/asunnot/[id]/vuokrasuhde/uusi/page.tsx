import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getProperty } from "@/lib/db/properties";
import { formatAddress } from "@/lib/property/schema";
import { TenancyForm } from "./TenancyForm";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = { title: fi.tenancy.new };

export default async function NewTenancyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const property = await getProperty(user.id, id);
  if (!property) notFound();

  return (
    <main className="mx-auto min-h-dvh max-w-[var(--container-content)] px-6 py-10">
      <h1 className="text-2xl">{fi.tenancy.new}</h1>
      <p className="mt-2 text-ink/70">{property.name ?? formatAddress(property)}</p>

      <TenancyForm propertyId={property.id} />

      <p className="mt-10 text-sm">
        <Link href={`/asunnot/${property.id}`} className="underline underline-offset-4">
          {fi.common.cancel}
        </Link>
      </p>
    </main>
  );
}
