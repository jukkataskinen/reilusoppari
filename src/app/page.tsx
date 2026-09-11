import { fi } from "@/i18n/fi";

/**
 * Väliaikainen aloitussivu. Korvataan vaiheessa 0, kun Auth0-kirjautuminen ja
 * asuntonäkymä ovat valmiit (PLAN.md vaihe 0).
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[var(--container-content)] flex-col justify-center px-6 py-12">
      <h1 className="text-3xl">{fi.app.name}</h1>
      <p className="mt-3 text-ink/70">{fi.app.tagline}</p>
      <p className="mt-8 rounded-[var(--radius-panel)] border border-line bg-paper p-5 text-sm text-ink/70">
        Sovellus on rakenteilla. Julkinen sivusto on osoitteessa{" "}
        <a href="https://www.reilusoppari.fi" className="underline underline-offset-4">
          reilusoppari.fi
        </a>
        .
      </p>
    </main>
  );
}
