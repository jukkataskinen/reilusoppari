import { describe, expect, it } from "vitest";
import {
  DEPOSIT_TEXTS,
  depositProposal,
  depositText,
  type DepositEntry,
} from "@/lib/tenancy/deposit";

/**
 * Vakuuden palautusehdotus.
 *
 * ===========================================================================
 * KAKSI VÄITETTÄ, JOTKA EIVÄT SAA RIKKOUTUA
 *
 * 1. Perusteet tulevat huoltokirjasta eivätkä kuluista. Loppupöytäkirjan
 *    allekirjoittavat molemmat, ja kulut ovat vuokranantajan kirjanpitoa.
 * 2. Palvelu ei ehdota vähennystä. Se ei voi tietää, kuuluuko avoin vika
 *    vuokralaisen vastuulle vai normaaliin kulumiseen.
 * ===========================================================================
 */

const VIKA: DepositEntry = {
  kind: "defect",
  title: "Keittiön hana vuotaa",
  createdAt: "2026-05-10T08:00:00.000Z",
  authorRole: "tenant",
  resolvedAt: null,
  cancelledAt: null,
};

describe("perusteiden kokoaminen", () => {
  it("ottaa mukaan avoimen vian", () => {
    const ehdotus = depositProposal(1700, [VIKA]);

    expect(ehdotus.hasOpenItems).toBe(true);
    expect(ehdotus.grounds).toHaveLength(1);
    expect(ehdotus.grounds[0].title).toBe("Keittiön hana vuotaa");
    expect(ehdotus.grounds[0].reportedAt).toBe("2026-05-10");
  });

  it("jättää pois korjatun vian", () => {
    // Korjattu vika ei ole peruste: se on hoidettu.
    const ehdotus = depositProposal(1700, [
      { ...VIKA, resolvedAt: "2026-05-20T08:00:00.000Z" },
    ]);

    expect(ehdotus.grounds).toHaveLength(0);
    expect(ehdotus.hasOpenItems).toBe(false);
  });

  it("jättää pois perutun ilmoituksen", () => {
    // Peruttu ilmoitus ei ole vika lainkaan.
    const ehdotus = depositProposal(1700, [
      { ...VIKA, cancelledAt: "2026-05-12T08:00:00.000Z" },
    ]);

    expect(ehdotus.grounds).toHaveLength(0);
  });

  it("jättää pois korjaukset ja muistiinpanot", () => {
    /*
      Muistiinpano ei väitä mitään korjattavaa olevan, ja korjausmerkintä on
      kirjaus tehdystä työstä. Kumpikaan ei ole avoin vika.
    */
    const ehdotus = depositProposal(1700, [
      { ...VIKA, kind: "repair", title: "Hana vaihdettu" },
      { ...VIKA, kind: "note", title: "Postilaatikon avain kahtena kappaleena" },
    ]);

    expect(ehdotus.grounds).toHaveLength(0);
  });

  it("ottaa mukaan molempien osapuolten kirjaamat viat", () => {
    /*
      Vuokranantajan kirjaama vika on yhtä lailla avoin kuin vuokralaisen.
      Vain toisen osapuolen huomioiminen tekisi pöytäkirjasta yksipuolisen.
    */
    const ehdotus = depositProposal(1700, [
      { ...VIKA, authorRole: "tenant", title: "Vuokralaisen havainto" },
      { ...VIKA, authorRole: "landlord", title: "Vuokranantajan havainto" },
    ]);

    expect(ehdotus.grounds).toHaveLength(2);
    expect(ehdotus.grounds.map((g) => g.reportedByRole).sort()).toEqual([
      "landlord",
      "tenant",
    ]);
  });

  it("järjestää vanhin ensin", () => {
    // Järjestys kertoo, mikä on ollut auki pisimpään.
    const ehdotus = depositProposal(1700, [
      { ...VIKA, title: "Uudempi", createdAt: "2026-08-01T08:00:00.000Z" },
      { ...VIKA, title: "Vanhempi", createdAt: "2026-02-01T08:00:00.000Z" },
    ]);

    expect(ehdotus.grounds.map((g) => g.title)).toEqual(["Vanhempi", "Uudempi"]);
  });

  it("ei sisällä summia eikä kulutietoja", () => {
    /*
      Tämä on koko tiedoston tärkein väite. Loppupöytäkirjan allekirjoittavat
      molemmat, ja kulut ovat vuokranantajan kirjanpitoa. Jos rakenteeseen
      lisättäisiin kenttä korjauksen hinnalle, kulutieto vuotaisi reittiä,
      jota kukaan ei tarkista.
    */
    const ehdotus = depositProposal(1700, [VIKA]);

    expect(Object.keys(ehdotus.grounds[0]).sort()).toEqual([
      "reportedAt",
      "reportedByRole",
      "title",
    ]);
  });
});

describe("pöytäkirjan teksti", () => {
  it("kertoo täydestä palautuksesta, kun avoimia ei ole", () => {
    const teksti = depositText(depositProposal(1700, []));

    expect(teksti).toBe(DEPOSIT_TEXTS.eiAvoimia);
    expect(teksti).toContain("kokonaisuudessaan");
  });

  it("EI ehdota vähennystä, vaikka avoimia olisi", () => {
    /*
      Palvelu ei voi tietää, kuuluuko avoin vika vuokralaisen vastuulle vai
      normaaliin kulumiseen. Automaattinen vähennysehdotus olisi
      puolueenotto, jota ei ole mihinkään perustettu.
    */
    const teksti = depositText(depositProposal(1700, [VIKA]));

    expect(teksti).toBe(DEPOSIT_TEXTS.avoimia);
    expect(teksti).toContain("Lähtökohta on täysi palautus");
    expect(teksti).toContain("eivät sellaisenaan peruste");
  });

  it("kertoo, jos vakuutta ei ole sovittu", () => {
    expect(depositText(depositProposal(null, [VIKA]))).toBe(DEPOSIT_TEXTS.eiVakuutta);
    expect(depositText(depositProposal(0, []))).toBe(DEPOSIT_TEXTS.eiVakuutta);
  });
});
