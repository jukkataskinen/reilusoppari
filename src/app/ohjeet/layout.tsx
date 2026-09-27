import Link from "next/link";
import { Brand } from "@/components/Brand";

/**
 * Ohjeet ovat julkisia: ne auttavat myös ennen kirjautumista, esimerkiksi
 * vuokralaista, joka on saanut kutsulinkin. Sivuilla ei ole kenenkään tietoja.
 *
 * Oma kehys eikä `AppShell`: ohje avautuu sovelluksesta uuteen välilehteen,
 * eikä sovelluksen navigaatio kuulu sinne.
 */
export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-5">
          <Link href="/ohjeet" aria-label="Ohjeiden etusivu">
            <Brand />
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/ohjeet" className="rounded-full px-3 py-2 text-ink/70 hover:text-ink">
              Ohjeet
            </Link>
            <Link href="/" className="rounded-full bg-ink px-4 py-2 font-medium text-paper hover:bg-ink-strong">
              Sovellukseen
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">{children}</main>
      <footer className="border-t border-line bg-cloud">
        <div className="mx-auto max-w-3xl px-5 py-5 text-sm text-ink/50">Reilua asumista. Yhdessä.</div>
      </footer>
    </div>
  );
}
