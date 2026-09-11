import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "./Brand";
import { fi } from "@/i18n/fi";

/**
 * Sovelluksen kehys: ylätunniste ja navigaatio.
 *
 * ===========================================================================
 * PUHELIN ENSIN, JA SE NÄKYY TÄSSÄ
 *
 * Navigaatio on puhelimessa alalaidassa ja työpöydällä ylätunnisteessa.
 * Alanavigaatio on peukalon ulottuvilla — sovellusta käytetään asunnossa
 * seisten, usein yhdellä kädellä — ja se on se kohta, jossa selainsivu alkaa
 * tuntua sovellukselta.
 *
 * `nav={false}` on kutsusivulle: siellä ei ole vielä tiliä eikä mitään mihin
 * navigoida, ja tyhjät välilehdet näyttäisivät rikkinäisiltä.
 * ===========================================================================
 */

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const NAV: NavItem[] = [
  {
    href: "/asunnot",
    label: fi.nav.properties,
    icon: (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 11 L12 4.5 L20 11 L20 20 L4 20 Z"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/vuokrasuhteet",
    label: fi.nav.tenancies,
    icon: (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x={5} y={3.5} width={14} height={17} rx={2.5} stroke="currentColor" strokeWidth={1.7} />
        <path d="M8.5 9 H15.5 M8.5 12.5 H15.5 M8.5 16 H13" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/omat-tiedot",
    label: fi.nav.ownDetails,
    icon: (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx={12} cy={8.5} r={3.5} stroke="currentColor" strokeWidth={1.7} />
        <path
          d="M5 20 C5 16.4 8.1 14.5 12 14.5 C15.9 14.5 19 16.4 19 20"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export function AppShell({
  children,
  nav = true,
  signedIn = true,
}: {
  children: ReactNode;
  nav?: boolean;
  signedIn?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[var(--container-content)] items-center justify-between px-5">
          <Link href="/" className="flex items-center">
            <Brand />
          </Link>

          <div className="flex items-center gap-1">
            {/* Työpöydällä navigaatio on tässä; puhelimessa alalaidassa. */}
            {nav ? (
              <nav className="hidden sm:flex sm:items-center sm:gap-1">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full px-3 py-2 text-sm text-ink/70 hover:text-ink"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            ) : null}

            {signedIn ? (
              <a href="/auth/logout" className="px-3 py-2 text-sm text-ink/60 hover:text-ink">
                Kirjaudu ulos
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[var(--container-content)] flex-1 px-5 py-8">
        {children}
      </main>

      {nav ? (
        <nav
          className="sticky bottom-0 border-t border-line bg-paper/95 backdrop-blur sm:hidden"
          /* Turva-alue: iPhonen alapalkki ei saa peittää kosketuskohteita. */
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto flex max-w-[var(--container-content)]">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-[var(--size-touch)] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-ink/70"
              >
                {item.icon}
                <span className="text-xs">{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>
      ) : null}

      <footer className="border-t border-line bg-cloud">
        <div className="mx-auto max-w-[var(--container-content)] px-5 py-5 text-sm text-ink/50">
          Reilua asumista. Yhdessä.
        </div>
      </footer>
    </div>
  );
}
