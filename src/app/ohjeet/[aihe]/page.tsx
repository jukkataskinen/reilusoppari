import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { helpTopic, sectionId } from "@/lib/help/topics";

// Ks. ohjeiden etusivu: nonce vaatii renderöinnin pyynnöllä.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ aihe: string }> }): Promise<Metadata> {
  const t = helpTopic((await params).aihe);
  return { title: t ? `Ohje: ${t.title}` : "Ohjeet" };
}

const ROLE_TEXT = {
  landlord: "Vuokranantajalle",
  tenant: "Vuokralaiselle",
  both: "Vuokranantajalle ja vuokralaiselle",
} as const;

export default async function HelpTopicPage({ params }: { params: Promise<{ aihe: string }> }) {
  const t = helpTopic((await params).aihe);
  if (!t) notFound();
  const related = (t.related ?? []).map(helpTopic).filter((r) => r !== null);

  return (
    <article>
      <Link href="/ohjeet" className="text-sm text-sky underline-offset-4 hover:underline">
        Kaikki ohjeet
      </Link>
      <p className="mt-5 text-sm text-ink/55">
        {t.group}
        {t.roles ? ` · ${ROLE_TEXT[t.roles]}` : ""}
      </p>
      <h1 className="mt-1 text-3xl">{t.title}</h1>
      {t.upcoming ? (
        <p className="mt-3 inline-block rounded-full border border-line bg-paper px-3 py-1 text-sm text-ink/70">
          Kehitteillä. Kaikki tästä ei vielä toimi.
        </p>
      ) : null}
      <p className="mt-3 text-lg text-ink/75">{t.summary}</p>

      <ul className="mt-6 grid gap-2 rounded-[var(--radius-panel)] border border-line bg-paper p-5 text-sm">
        {t.highlights.map((h) => (
          <li key={h} className="flex gap-2">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-moss" />
            <span>{h}</span>
          </li>
        ))}
      </ul>

      {t.sections.map((s) => (
        <section key={s.title} id={sectionId(s.title)} className="mt-10 scroll-mt-6">
          <h2 className="text-xl">{s.title}</h2>
          {s.text ? <p className="mt-3 leading-relaxed text-ink/80">{s.text}</p> : null}
          {s.steps ? (
            <ol className="mt-4 grid gap-3">
              {s.steps.map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-paper">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          ) : null}
          {s.bullets ? (
            <ul className="mt-4 grid gap-2">
              {s.bullets.map((b) => (
                <li key={b} className="flex gap-2 leading-relaxed">
                  <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-sky" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      {t.tips?.length ? (
        <section className="mt-10 rounded-[var(--radius-panel)] border border-sky/25 bg-sky/5 p-5">
          <h2 className="text-lg">Hyvä tietää</h2>
          <ul className="mt-3 grid gap-2 text-sm">
            {t.tips.map((tip) => (
              <li key={tip} className="leading-relaxed">
                {tip}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {t.appPath ? (
          <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4">
            <p className="text-sm text-ink/60">Sovelluksessa</p>
            <Link href={t.appPath} className="mt-1 block font-medium text-sky hover:underline">
              Avaa {t.appLabel}
            </Link>
          </div>
        ) : null}
        {t.slug !== "kehitystoiveet" ? (
          <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-4">
            <p className="text-sm text-ink/60">Puuttuuko jotain?</p>
            <Link href={`/kehitystoiveet/uusi?toiminto=${t.slug}`} className="mt-1 block font-medium text-sky hover:underline">
              Anna kehitystoive
            </Link>
          </div>
        ) : null}
      </div>

      {related.length ? (
        <div className="mt-6">
          <p className="text-sm text-ink/60">Katso myös</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {related.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/ohjeet/${r.slug}`}
                  className="inline-block rounded-full border border-line bg-paper px-3 py-1 text-sm hover:border-ink/25"
                >
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
