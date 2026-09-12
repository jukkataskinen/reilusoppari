/**
 * Kululuokat verottajan vuokratulolomakkeen mukaan (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * LUOKAT OVAT VEROTTAJAN, EIVÄT MEIDÄN
 *
 * Nimet ja jaottelu seuraavat vuokratulon veroilmoituslomaketta, jotta
 * vuosilaskelman rivit voi siirtää OmaVeroon ilman tulkintaa. Jos keksisimme
 * omat luokat, jokainen rivi pitäisi kääntää käsin — ja käännösvirhe on
 * veroilmoituksessa kalliimpi kuin muualla.
 *
 * KAKSI LUOKKAA, JOTKA EIVÄT OLE VUOSIKULUJA
 *
 * `rahoitusvastike_rahastoitu` ja `perusparannus` eivät ole vuosikuluja:
 * ensimmäinen lisätään osakkeen hankintamenoon, jälkimmäinen vähennetään
 * poistoina. Ne ovat silti listalla, koska ne on kirjattava jonnekin — ja
 * jos niitä ei olisi, ne kirjattaisiin väärään luokkaan.
 *
 * Siksi jokaisella luokalla on `deductibleAnnually`-tieto, ja laskelma
 * erottelee ne omaksi osiokseen sen sijaan että summaisi ne muiden joukkoon.
 *
 * OHJETEKSTIT OVAT JUKAN
 *
 * `hint` on lyhyt muistutus siitä, mitä luokkaan kuuluu — ei veroneuvontaa.
 * Varsinaiset ohjetekstit kirjoittaa Jukka (`content/tax-guidance.fi.ts`,
 * CLAUDE.md kohta 9.5), ja ne näytetään laskelmassa. Nämä ovat sitä varten,
 * että oikea luokka löytyy kuluja kirjatessa.
 * ===========================================================================
 */

export type ExpenseCategory =
  | "hoitovastike"
  | "rahoitusvastike_tuloutettu"
  | "rahoitusvastike_rahastoitu"
  | "vuosikorjaus"
  | "perusparannus"
  | "kalusteet"
  | "matkat"
  | "vakuutus"
  | "korot"
  | "muu";

export interface CategoryInfo {
  value: ExpenseCategory;
  label: string;
  hint: string;
  /** Vähennetäänkö vuosikuluna? `false` = poistoina tai hankintamenoon. */
  deductibleAnnually: boolean;
}

export const EXPENSE_CATEGORIES: CategoryInfo[] = [
  {
    value: "vuosikorjaus",
    label: "Vuosikorjaus",
    hint: "Asunnon pitäminen entisessä kunnossa: korjaus, huolto, maalaus.",
    deductibleAnnually: true,
  },
  {
    value: "hoitovastike",
    label: "Hoitovastike",
    hint: "Taloyhtiölle maksettu hoitovastike.",
    deductibleAnnually: true,
  },
  {
    value: "rahoitusvastike_tuloutettu",
    label: "Rahoitusvastike (tuloutettu)",
    hint: "Taloyhtiö on tulouttanut vastikkeen kirjanpidossaan.",
    deductibleAnnually: true,
  },
  {
    value: "rahoitusvastike_rahastoitu",
    label: "Rahoitusvastike (rahastoitu)",
    hint: "Ei vuosikulu: lisätään osakkeen hankintamenoon.",
    deductibleAnnually: false,
  },
  {
    value: "perusparannus",
    label: "Perusparannus",
    hint: "Asunnon tason nostaminen. Ei vuosikulu: vähennetään poistoina.",
    deductibleAnnually: false,
  },
  {
    value: "kalusteet",
    label: "Kalusteet ja laitteet",
    hint: "Kodinkoneet ja kalusteet vuokrattuun asuntoon.",
    deductibleAnnually: true,
  },
  {
    value: "matkat",
    label: "Matkakulut",
    hint: "Ajot asunnolle. Kilometrit riittävät, summa lasketaan taksasta.",
    deductibleAnnually: true,
  },
  {
    value: "vakuutus",
    label: "Vakuutus",
    hint: "Vuokrattuun asuntoon kohdistuva vakuutusmaksu.",
    deductibleAnnually: true,
  },
  {
    value: "korot",
    label: "Korot",
    hint: "Ilmoitetaan veroilmoituksessa erikseen, ei vuokratulon kuluna.",
    deductibleAnnually: false,
  },
  {
    value: "muu",
    label: "Muu kulu",
    hint: "Kirjoita kuvaukseen, mistä on kyse.",
    deductibleAnnually: true,
  },
];

const BY_VALUE = new Map(EXPENSE_CATEGORIES.map((category) => [category.value, category]));

export function categoryInfo(value: ExpenseCategory): CategoryInfo {
  const found = BY_VALUE.get(value);
  if (!found) throw new Error(`Tuntematon kululuokka: ${value}`);
  return found;
}

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return BY_VALUE.has(value as ExpenseCategory);
}

/**
 * Kilometrikorvaus vuosittain (CLAUDE.md 5.7).
 *
 * Taksa on verottajan päätös ja muuttuu vuosittain. Se on tässä taulukkona
 * eikä yhtenä lukuna, koska vanhan vuoden kulu on laskettava sen vuoden
 * taksalla — laskelma tehdään usein seuraavana keväänä.
 *
 * Jukka päivittää tämän vuosittain (CLAUDE.md kohta 9.5).
 */
const KM_RATES: Record<number, number> = {
  2025: 0.59,
  2026: 0.61,
};

/** Viimeisin tiedossa oleva taksa, jos vuotta ei ole taulukossa. */
const LATEST_KNOWN_YEAR = Math.max(...Object.keys(KM_RATES).map(Number));

export function kmRate(year: number): number {
  return KM_RATES[year] ?? KM_RATES[LATEST_KNOWN_YEAR];
}

/** Onko vuoden taksa vahvistettu, vai käytetäänkö edellisen vuoden lukua? */
export function isKmRateConfirmed(year: number): boolean {
  return year in KM_RATES;
}

/** Matkakulun summa kilometreistä. Pyöristetään sentteihin. */
export function travelCost(km: number, year: number): number {
  return Math.round(km * kmRate(year) * 100) / 100;
}
