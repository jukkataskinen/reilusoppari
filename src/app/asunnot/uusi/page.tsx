import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { PropertyForm } from "./PropertyForm";
import { AppShell } from "@/components/AppShell";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = { title: "Lisää asunto" };

export default async function NewPropertyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  return (
    <AppShell>
      <h1 className="text-2xl">Lisää asunto</h1>
      <p className="mt-2 text-ink/70">
        Osoite ja tyyppi riittävät alkuun. Muut tiedot voi täydentää myöhemmin.
      </p>

      <PropertyForm />

      <p className="mt-10 text-sm">
        <Link href="/asunnot" className="underline underline-offset-4">
          {fi.common.cancel}
        </Link>
      </p>
    </AppShell>
  );
}
