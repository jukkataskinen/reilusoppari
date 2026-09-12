/**
 * Vakuuden palautusehdotus loppupöytäkirjaan (CLAUDE.md 5.8).
 *
 * ===========================================================================
 * KULUT EIVÄT SAA NÄKYÄ VUOKRALAISELLE — EIVÄT MYÖSKÄÄN TÄÄLLÄ
 *
 * Loppupöytäkirjan allekirjoittavat molemmat osapuolet, joten se on
 * vuokralaiselle näkyvä asiakirja. Kulut ja kuitit ovat vuokranantajan
 * kirjanpitoa (`db/expenses.ts`), ja ne on rajattu asunnon omistajuuden
 * kautta koko sovelluksessa.
 *
 * Siksi ehdotuksen perusteet tulevat HUOLTOKIRJASTA eivätkä kuluista:
 * avoimet vikailmoitukset ovat molempien näkemää tietoa, korjausten hinnat
 * eivät ole. Summan liittäminen tähän vuotaisi kulutiedon reittiä, jota
 * kukaan ei tarkista.
 *
 * LÄHTÖKOHTA ON TÄYSI PALAUTUS
 *
 * Palvelu ei ehdota vähennystä. Se ei voi tietää, kuuluuko avoin vika
 * vuokralaisen vastuulle vai normaaliin kulumiseen — se on osapuolten
 * sovittava, ja tarvittaessa tuomioistuimen ratkaistava.
 *
 * Mitä pöytäkirja tekee, on koota se, mikä on kirjattu: vakuuden määrä,
 * avoimet vikailmoitukset ja niiden ajankohdat. Se antaa keskustelulle
 * yhteisen pohjan. Automaattinen vähennysehdotus olisi puolueenotto, jota
 * ei ole mihinkään perustettu.
 * ===========================================================================
 */

export interface DepositGround {
  /** Vikailmoituksen otsikko sellaisena kuin se kirjattiin. */
  title: string;
  /** Milloin se kirjattiin, `YYYY-MM-DD`. */
  reportedAt: string;
  /** Kumpi osapuoli kirjasi. */
  reportedByRole: "landlord" | "tenant";
}

export interface DepositProposal {
  /** Sovittu vakuus euroina. `null`, jos vakuutta ei ole. */
  amount: number | null;
  /** Avoimet huoltokirjan merkinnät päättymishetkellä. */
  grounds: DepositGround[];
  /**
   * Onko palautukselle esitetty huomautettavaa?
   *
   * `false` tarkoittaa, että huoltokirjassa ei ole avoimia merkintöjä —
   * ei sitä, että vakuus olisi palautettava. Palautuksesta sovitaan
   * osapuolten kesken.
   */
  hasOpenItems: boolean;
}

export interface DepositEntry {
  kind: "defect" | "repair" | "note";
  title: string;
  createdAt: string;
  authorRole: "landlord" | "tenant";
  resolvedAt: string | null;
  cancelledAt: string | null;
}

/**
 * Kokoaa ehdotuksen huoltokirjan merkinnöistä.
 *
 * Mukaan tulevat vain AVOIMET VIAT: korjattu vika ei ole peruste, eikä
 * peruttu ilmoitus ole vika lainkaan. Muistiinpanot jätetään pois, koska ne
 * eivät väitä mitään korjattavaa olevan.
 */
export function depositProposal(
  depositAmount: number | null,
  entries: DepositEntry[],
): DepositProposal {
  const grounds = entries
    .filter(
      (entry) =>
        entry.kind === "defect" && entry.resolvedAt === null && entry.cancelledAt === null,
    )
    .map((entry) => ({
      title: entry.title,
      reportedAt: entry.createdAt.slice(0, 10),
      reportedByRole: entry.authorRole,
    }))
    // Vanhin ensin: järjestys kertoo, mikä on ollut auki pisimpään.
    .sort((a, b) => a.reportedAt.localeCompare(b.reportedAt));

  return {
    amount: depositAmount,
    grounds,
    hasOpenItems: grounds.length > 0,
  };
}

/**
 * Pöytäkirjaan tuleva teksti tilanteen mukaan.
 *
 * Sanamuodot ovat juridisesti merkityksellisiä ja Jukan tarkistettavia
 * (CLAUDE.md kohta 9.4). Ne ovat täällä yhdessä paikassa eivätkä asiakirjan
 * sisällä juuri siksi, että ne on helppo löytää ja korjata.
 */
export const DEPOSIT_TEXTS = {
  otsikko: "Vakuuden palautus",

  eiVakuutta:
    "Tästä vuokrasuhteesta ei ole sovittu vakuutta, joten palautettavaa ei ole.",

  eiAvoimia:
    "Huoltokirjassa ei ole avoimia vikailmoituksia. Lähtökohta on, että vakuus " +
    "palautetaan kokonaisuudessaan.",

  avoimia:
    "Huoltokirjassa on avoimia vikailmoituksia, jotka on lueteltu alla. Ne ovat " +
    "molempien osapuolten kirjaamia havaintoja, eivät sellaisenaan peruste " +
    "vähennykselle: osapuolet sopivat, kuuluuko kukin kohta vuokralaisen " +
    "vastuulle vai tavanomaiseen kulumiseen. Lähtökohta on täysi palautus.",

  palautusAika:
    "Vakuus palautetaan ilman aiheetonta viivytystä sen jälkeen, kun tämä " +
    "pöytäkirja on allekirjoitettu ja mahdollisista vähennyksistä on sovittu.",
} as const;

/** Mikä teksti tähän tilanteeseen kuuluu. */
export function depositText(proposal: DepositProposal): string {
  if (proposal.amount === null || proposal.amount <= 0) return DEPOSIT_TEXTS.eiVakuutta;
  return proposal.hasOpenItems ? DEPOSIT_TEXTS.avoimia : DEPOSIT_TEXTS.eiAvoimia;
}
