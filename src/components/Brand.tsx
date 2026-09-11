/**
 * Reilusopparin merkki ja sanamerkki.
 *
 * Sama merkki kuin asiakirjoissa (`src/documents/decorations.tsx`) ja
 * sivustolla: yksi koti, kaksi yhtä suurta neliötä. Neliöt ovat
 * tarkoituksella samankokoiset — kumpikaan osapuoli ei ole toista suurempi.
 *
 * Tämä on React-komponentti eikä `public/`-tiedosto, jotta väri seuraa
 * ympäröivää tekstiä ja koko skaalautuu paikan mukaan.
 */

export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M12 44 L50 14 L88 44 L88 86 L12 86 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={7}
        strokeLinejoin="round"
      />
      <rect x={26} y={52} width={20} height={20} rx={4} fill="var(--color-sky)" />
      <rect x={54} y={52} width={20} height={20} rx={4} fill="var(--color-coral)" />
    </svg>
  );
}

/** Merkki ja nimi vierekkäin. */
export function Brand({ size = 22 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2 text-ink">
      <LogoMark size={size} />
      <span className="font-extrabold tracking-tight">Reilusoppari</span>
    </span>
  );
}
