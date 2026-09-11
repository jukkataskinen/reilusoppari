/**
 * Asiakirjojen ulkoasun perusarvot.
 *
 * ===========================================================================
 * LÄHTÖKOHTA: EI VIRANOMAISPAPERIA
 *
 * Jukan linjaus 2026-09-11 (`DECISIONS.md`): asiakirjojen pitää olla
 * "mukavia" — ne eivät saa näyttää viranomaisdokumenteilta, vaikka asiaa
 * ovatkin. Ulkoasu on osa tuotteen lupausta: vuokrasopimus allekirjoitetaan
 * tilanteessa, jossa toinen osapuoli on usein ensi kertaa vuokralla, ja
 * viranomaisen näköinen paperi tekee tilanteesta vastakkainasettelun.
 *
 * KAKSI SÄÄNTÖÄ, JOTKA EIVÄT JOUSTA
 *
 * 1. **Ei korallinpunaista.** Sovelluksen paletissa on `--color-coral`, mutta
 *    asiakirjassa se luetaan varoitukseksi. Asiakirjat ovat sinisen sävyissä.
 * 2. **Sisältö ei kevene.** "Mukava" koskee ulkoasua ja kieltä, ei sisältöä.
 *    Kaikki juridisesti tarpeellinen on mukana — se vain kirjoitetaan
 *    ihmiselle luettavaksi.
 * ===========================================================================
 */

/** Sama paletti kuin sovelluksessa (`globals.css`), pehmennettynä paperille. */
export const colors = {
  ink: "#1b2a41",
  inkSoft: "#5a6b84",
  inkFaint: "#8a99b0",
  sky: "#3d8bff",
  /** Merkin toinen neliö. Kaksi osapuolta, ei kahta väriä — asiakirja pysyy rauhallisena. */
  skySoft: "#8fb9ff",
  /** Paneelien tausta. Riittävän vaalea, että teksti pysyy luettavana tulostettuna. */
  panel: "#eaf1fb",
  panelStrong: "#d8e6f9",
  line: "#dfe6f0",
  paper: "#ffffff",
} as const;

/**
 * Pistekoot. A4:lla 10,5 pt leipäteksti on luettavaa myös silloin, kun
 * asiakirja tulostetaan — ja nämä asiakirjat tulostetaan.
 */
export const type = {
  title: 30,
  subtitle: 13,
  heading: 13,
  body: 10.5,
  small: 9,
  label: 8,
} as const;

export const spacing = {
  page: 42,
  block: 18,
  panel: 14,
  row: 6,
} as const;

export const radius = {
  panel: 10,
  pill: 6,
} as const;

/** Yksi fonttiperhe, kolme leikkausta. Ks. `fonts.ts`. */
export const FONT_FAMILY = "Jakarta";

export const weight = {
  regular: 400 as const,
  medium: 600 as const,
  bold: 700 as const,
};
