/**
 * Verolaskelman ohjetekstit (CLAUDE.md 5.7, kohta 9.5).
 *
 * ===========================================================================
 * NÄMÄ TEKSTIT OVAT JUKAN VASTUULLA
 *
 * Jukka on kirjanpitäjä; minä en ole. Nämä ovat lähtökohta, jonka hän
 * tarkistaa ja kirjoittaa omalla äänellään ennen julkaisua. Tekstit
 * näytetään laskelmassa luokan vieressä, ja ne voivat vaikuttaa siihen,
 * mihin kohtaan ihminen kirjaa kulunsa — siksi ne eivät saa jäädä
 * kehittäjän arvaukseksi.
 *
 * MIKÄ TÄSSÄ EI OLE VERONEUVONTAA
 *
 * Laskelma on yhteenveto käyttäjän omista kirjauksista. Se ei ole
 * veroilmoitus eikä neuvo siitä, mitä saa vähentää — se kertoo, mitä on
 * kirjattu ja mihin luokkaan. Jokaisessa näkymässä lukee sama varaus, ja
 * `DISCLAIMER` on sen ainoa lähde, jotta se ei pääse erkanemaan.
 * ===========================================================================
 */

import type { ExpenseCategory } from "@/lib/expenses/categories";

/** Toistuu jokaisessa laskelmanäkymässä ja asiakirjassa. */
export const DISCLAIMER =
  "Tämä on yhteenveto omista kirjauksistasi, ei veroneuvontaa.";

/** Laskelman lopussa näytettävä pidempi huomautus. */
export const CLOSING_NOTE =
  "Reilusoppari ei lähetä veroilmoitusta eikä tarkista, ovatko kirjaukset " +
  "oikein. Luvut on tarkoitettu siirrettäviksi OmaVeron vuokratulolomakkeelle " +
  "sellaisinaan, mutta vastuu ilmoituksesta on sinulla.";

export interface CategoryGuidance {
  /** Lyhyt ohje luokan vieressä. */
  short: string;
  /** Pidempi huomautus, jos luokkaan liittyy tavallinen väärinkäsitys. */
  note?: string;
}

export const CATEGORY_GUIDANCE: Record<ExpenseCategory, CategoryGuidance> = {
  hoitovastike: {
    short: "Taloyhtiölle maksettu hoitovastike vuokrausajalta.",
  },
  rahoitusvastike_tuloutettu: {
    short: "Rahoitusvastike, jonka taloyhtiö on tulouttanut kirjanpidossaan.",
    note:
      "Tuloutettu ja rahastoitu rahoitusvastike käsitellään eri tavoin. Taloyhtiön " +
      "isännöitsijä kertoo kumpi on kyseessä.",
  },
  rahoitusvastike_rahastoitu: {
    short: "Rahastoitu rahoitusvastike ei ole vuosikulu.",
    note:
      "Rahastoitu vastike lisätään osakkeen hankintamenoon, ja se vaikuttaa vasta " +
      "myyntivoittoa laskettaessa. Siksi se on tässä laskelmassa erikseen eikä " +
      "vuosikulujen summassa.",
  },
  vuosikorjaus: {
    short: "Asunnon pitäminen entisessä kunnossa.",
    note:
      "Raja perusparannukseen ei ole aina selvä: korjaus palauttaa entisen tason, " +
      "perusparannus nostaa sitä.",
  },
  perusparannus: {
    short: "Asunnon tason nostaminen. Ei vuosikulu.",
    note:
      "Perusparannus vähennetään poistoina useamman vuoden aikana, joten se on " +
      "tässä laskelmassa erikseen eikä vuosikulujen summassa.",
  },
  kalusteet: {
    short: "Kodinkoneet ja kalusteet vuokrattuun asuntoon.",
  },
  matkat: {
    short: "Ajot vuokrattuun asuntoon.",
    note:
      "Summa lasketaan kilometreistä verottajan vuosittaisella taksalla. Matkan " +
      "syy on hyvä kirjata kuvaukseen.",
  },
  vakuutus: {
    short: "Vuokrattuun asuntoon kohdistuva vakuutusmaksu.",
  },
  korot: {
    short: "Lainan korot ilmoitetaan veroilmoituksessa erikseen.",
    note:
      "Korot eivät ole vuokratulon kulu vaan oma kohtansa veroilmoituksessa. " +
      "Siksi ne ovat tässä laskelmassa erikseen.",
  },
  muu: {
    short: "Muu vuokraukseen liittyvä kulu.",
  },
};
