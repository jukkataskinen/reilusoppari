import Link from "next/link";
import type { Metadata } from "next";
import { HELP_GROUPS, HELP_TOPICS } from "@/lib/help/topics";

export const metadata: Metadata = { title: "Ohjeet" };

// CSP:n nonce syntyy pyynnöllä (middleware), joten sivu renderöidään
// pyynnöllä eikä käännösvaiheessa. Muuten Next.js:n skriptit estyisivät.
export const dynamic = "force-dynamic";

export default function HelpHome() {
  return (
    <>
      <p className="text-sm font-medium text-sky">Ohjeet</p>
      <h1 className="mt-1 text-3xl">Näin Reilusoppari toimii</h1>
      <p className="mt-3 text-lg text-ink/75">
        Reilusoppari on vuokranantajan ja vuokralaisen yhteinen työkalu. Sopimus, kuvat, vuokranmaksut ja huollot
        ovat samassa paikassa ja samoina molemmille.
      </p>
      <div className="mt-6 grid gap-3 rounded-[var(--radius-panel)] border border-line bg-paper p-5 text-sm sm:grid-cols-2">
        <div>
          <p className="font-medium">Vuokranantaja</p>
          <p className="mt-1 text-ink/70">Lisää asunnon, luo vuokrasuhteen ja kutsuu vuokralaisen.</p>
        </div>
        <div>
          <p className="font-medium">Vuokralainen</p>
          <p className="mt-1 text-ink/70">Liittyy kutsulinkistä. Vuokralainen ei maksa mitään.</p>
        </div>
      </div>

      {HELP_GROUPS.map((group) => {
        const topics = HELP_TOPICS.filter((t) => t.group === group);
        if (!topics.length) return null;
        return (
          <section key={group} className="mt-10">
            <h2 className="text-xl">{group}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {topics.map((t) => (
                <Link
                  key={t.slug}
                  href={`/ohjeet/${t.slug}`}
                  className="flex flex-col rounded-[var(--radius-panel)] border border-line bg-paper p-4 hover:border-ink/25"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-medium">{t.title}</span>
                    {t.upcoming ? (
                      <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-ink/60">
                        Tulossa
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 text-sm text-ink/70">{t.summary}</span>
                  {t.roles ? <span className="mt-2 text-xs text-ink/50">{ROLE_TEXT[t.roles]}</span> : null}
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

const ROLE_TEXT = {
  landlord: "Vuokranantajalle",
  tenant: "Vuokralaiselle",
  both: "Molemmille",
} as const;
