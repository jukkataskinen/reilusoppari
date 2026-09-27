import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth/session";
import { featureOptions, IMPORTANCE_LABEL, IMPORTANCES, isFeature, safePagePath } from "@/lib/feature-requests";
import { NewFeatureRequestForm } from "../FeatureRequestForms";

export const metadata: Metadata = { title: "Uusi kehitystoive" };

export default async function NewFeatureRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ toiminto?: string; sivu?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const sp = await searchParams;
  // Sivun ohjelinkki täyttää toiminnon ja sivun valmiiksi.
  const feature = isFeature(sp.toiminto) ? sp.toiminto : "";

  return (
    <AppShell>
      <h1 className="text-2xl">Uusi kehitystoive</h1>
      <p className="mt-2 text-ink/70">
        Mikä toimii hankalasti, tai mitä jäit kaipaamaan? Luemme jokaisen toiveen, ja näet vastauksen omista
        toiveistasi.
      </p>

      <NewFeatureRequestForm
        options={featureOptions()}
        importances={IMPORTANCES.map((value) => ({ value, label: IMPORTANCE_LABEL[value] }))}
        defaultFeature={feature}
        pagePath={safePagePath(sp.sivu) ?? ""}
      />

      <p className="mt-10 text-sm">
        <Link href="/kehitystoiveet" className="underline underline-offset-4">
          Omat toiveesi
        </Link>
      </p>
    </AppShell>
  );
}
