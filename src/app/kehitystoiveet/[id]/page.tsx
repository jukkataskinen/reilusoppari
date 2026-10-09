import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth/session";
import { getFeatureRequest } from "@/lib/db/feature-requests";
import { featureLabel, formatRequestDate, IMPORTANCE_LABEL, isFeatureRequestAdmin, REQUEST_STATUS } from "@/lib/feature-requests";
import { helpTopic } from "@/lib/help/topics";
import { DevSuggestionAdminPanel } from "../FeatureRequestForms";

export const metadata: Metadata = { title: "Kehitystoive" };

export default async function FeatureRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kiitos?: string; tallennettu?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const asAdmin = isFeatureRequestAdmin(user.email);
  // Toisen käyttäjän toive näkyy samana 404:nä kuin puuttuva.
  const r = await getFeatureRequest({ userId: user.id, asAdmin }, id);
  if (!r) notFound();
  const topic = helpTopic(r.feature);
  const st = REQUEST_STATUS[r.status];

  return (
    <AppShell>
      {sp.kiitos ? (
        <p role="status" className="mb-5 rounded-[10px] border border-moss/40 bg-paper p-3 text-sm">
          Kiitos. Toive on tallennettu, ja näet vastauksen tältä sivulta.
        </p>
      ) : null}
      {sp.tallennettu ? (
        <p role="status" className="mb-5 rounded-[10px] border border-moss/40 bg-paper p-3 text-sm">
          Tila tallennettu.
        </p>
      ) : null}

      <p className="text-sm text-ink/60">{st.label}</p>
      <h1 className="mt-1 text-2xl">{r.title}</h1>

      <div className="mt-5 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <p className="whitespace-pre-line leading-relaxed">{r.description}</p>
        <dl className="mt-5 grid gap-2 border-t border-line pt-4 text-sm">
          <div className="flex gap-2">
            <dt className="text-ink/60">Toiminto:</dt>
            <dd>
              {topic ? (
                <Link href={`/ohjeet/${topic.slug}`} className="text-sky underline-offset-4 hover:underline">
                  {topic.title}
                </Link>
              ) : (
                featureLabel(r.feature)
              )}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink/60">Tärkeys:</dt>
            <dd>{IMPORTANCE_LABEL[r.importance]}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink/60">Jätetty:</dt>
            <dd>
              {formatRequestDate(r.createdAt)}
              {asAdmin && r.authorEmail ? `, ${r.authorEmail}` : ""}
            </dd>
          </div>
          {r.pagePath ? (
            <div className="flex gap-2">
              <dt className="text-ink/60">Sivu:</dt>
              <dd className="break-all">
                <Link href={r.pagePath} className="text-sky underline-offset-4 hover:underline">
                  {r.pagePath}
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      <section className="mt-8">
        <h2 className="text-lg">Vastaus</h2>
        <div className="mt-3 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          {r.response ? (
            <p className="whitespace-pre-line">{r.response}</p>
          ) : (
            <p className="text-sm text-ink/60">Toivetta ei ole vielä käsitelty.</p>
          )}
          {r.handledAt ? <p className="mt-2 text-xs text-ink/55">Käsitelty {formatRequestDate(r.handledAt)}</p> : null}
        </div>
      </section>

      {asAdmin && r.status !== "valmis" && r.status !== "hylatty" ? (
        <section className="mt-8">
          <h2 className="text-lg">Käsittely</h2>
          {r.githubIssueNumber ? (
            <p className="mt-2 text-sm text-ink/60">
              GitHub-issue #{r.githubIssueNumber}
              {r.approvedDescription ? " · kuvaus muokattu hyväksynnässä" : ""}
            </p>
          ) : null}
          <div className="mt-3 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
            <DevSuggestionAdminPanel requestId={r.id} status={r.status} description={r.description} />
          </div>
        </section>
      ) : null}

      <p className="mt-10 text-sm">
        <Link href="/kehitystoiveet" className="underline underline-offset-4">
          Kaikki toiveet
        </Link>
      </p>
    </AppShell>
  );
}
