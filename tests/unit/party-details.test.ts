import { describe, expect, it } from "vitest";
import {
  missingPartyDetails,
  partyDetailsFormToInput,
  partyDetailsSchema,
  type PartyDetailsView,
} from "@/lib/tenancy/party-details";

/**
 * Osapuolen tietojen luku lomakkeelta.
 *
 * Tunnukset tässä tiedostossa ovat keksittyjä mutta tarkistusmerkiltään
 * oikeita; ne eivät kuulu kenellekään.
 */

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const parse = (values: Record<string, string>) =>
  partyDetailsSchema.safeParse(partyDetailsFormToInput(form(values)));

describe("osapuolen tiedot lomakkeelta", () => {
  it("lukee henkilön tiedot", () => {
    const parsed = parse({
      name: "Maija Meikäläinen",
      partyType: "henkilo",
      personalId: "131052-308T",
      phone: "050 765 4321",
      email: "maija@example.com",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.name).toBe("Maija Meikäläinen");
    expect(parsed.data.personalId).toBe("131052-308T");
    expect(parsed.data.businessId).toBeNull();
  });

  it("lukee yrityksen tiedot ja allekirjoittajan", () => {
    const parsed = parse({
      name: "Kiinteistö Oy Mäkitie",
      partyType: "yritys",
      businessId: "2617416-4",
      signatoryName: "Matti Virtanen",
      email: "matti@example.com",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.businessId).toBe("2617416-4");
    expect(parsed.data.signatoryName).toBe("Matti Virtanen");
  });

  it("vaatii yritykseltä allekirjoittajan", () => {
    // Yritys ei allekirjoita itse. Ilman nimeä sopimuksesta ei kävisi ilmi,
    // kuka sen allekirjoitti.
    const parsed = parse({
      name: "Kiinteistö Oy Mäkitie",
      partyType: "yritys",
      businessId: "2617416-4",
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) => issue.path[0] === "signatoryName")).toBe(true);
  });

  it("ei tallenna toisen tyypin kenttiä", () => {
    // Lomakkeelle jäänyt arvo ei saa tallentua näkymättömissä: yrityksellä ei
    // ole henkilötunnusta eikä henkilöllä y-tunnusta.
    const yritys = parse({
      partyType: "yritys",
      businessId: "2617416-4",
      signatoryName: "Matti Virtanen",
      personalId: "131052-308T",
    });
    expect(yritys.success && yritys.data.personalId).toBeNull();

    const henkilo = parse({
      partyType: "henkilo",
      personalId: "131052-308T",
      businessId: "2617416-4",
      signatoryName: "Joku Muu",
    });
    expect(henkilo.success && henkilo.data.businessId).toBeNull();
    expect(henkilo.success && henkilo.data.signatoryName).toBeNull();
  });

  it("hylkää näppäilyvirheen tunnuksessa", () => {
    // Väärä tunnus jää sinetöityyn sopimukseen pysyvästi.
    expect(parse({ personalId: "131052-308U" }).success).toBe(false);
    expect(parse({ partyType: "yritys", businessId: "2617416-5" }).success).toBe(false);
  });

  it("hylkää rikkinäisen sähköpostin", () => {
    expect(parse({ email: "ei-ole-osoite" }).success).toBe(false);
    expect(parse({ email: "maija@example.com" }).success).toBe(true);
  });

  it("tyhjä lomake kelpaa: luonnos saa olla kesken", () => {
    // Sopimusta kirjoitetaan usein ennen kuin vuokralaisen tiedot ovat
    // tiedossa. Pakollisuus tässä estäisi sen.
    expect(parse({}).success).toBe(true);
  });

  it("tyhjä tunnuskenttä ei tarkoita poistamista", () => {
    // Muuten puhelinnumeron muutos pyyhkisi tunnuksen mennessään.
    const parsed = parse({ phone: "050 765 4321" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.personalId).toBeNull();
    expect(parsed.data.clearPersonalId).toBe(false);
  });

  it("poistaminen on oma valintansa", () => {
    const parsed = parse({ clearPersonalId: "on" });
    expect(parsed.success && parsed.data.clearPersonalId).toBe(true);
  });
});

describe("mitä sopimuksesta puuttuu", () => {
  const valmis = (yli: Partial<PartyDetailsView> = {}): PartyDetailsView => ({
    partyId: "p",
    role: "tenant",
    position: 0,
    name: "Maija Meikäläinen",
    partyType: "henkilo",
    identifierMasked: "131052-***T",
    businessId: null,
    signatoryName: null,
    phone: null,
    email: null,
    bankAccount: null,
    isSelf: false,
    ...yli,
  });

  const vuokranantaja = valmis({
    role: "landlord",
    name: "Matti Virtanen",
    bankAccount: "FI21 1234 5600 0007 85",
  });

  it("täysistä tiedoista ei valiteta", () => {
    expect(missingPartyDetails([vuokranantaja, valmis()])).toEqual([]);
  });

  it("huomaa tyhjän osapuolen", () => {
    // Juuri tämä tapahtui: ennen migraatiota luodun vuokrasuhteen
    // vuokranantajarivi oli kokonaan tyhjä, eikä asiakirja kertonut siitä.
    const tyhja = valmis({
      role: "landlord",
      name: null,
      identifierMasked: null,
      bankAccount: null,
    });

    expect(missingPartyDetails([tyhja, valmis()])).toEqual([
      "Vuokranantajan nimi",
      "Vuokranantajan henkilötunnus",
      "Tilinumero, jolle vuokra maksetaan",
    ]);
  });

  it("yritykseltä kysytään y-tunnus ja allekirjoittaja", () => {
    const yritys = valmis({
      role: "landlord",
      partyType: "yritys",
      name: "Kiinteistö Oy",
      identifierMasked: null,
      bankAccount: "FI21 1234 5600 0007 85",
    });

    expect(missingPartyDetails([yritys])).toEqual([
      "Vuokranantajan y-tunnus",
      "Vuokranantajan allekirjoittaja",
    ]);
  });

  it("tilinumeroa kysytään vain vuokranantajalta", () => {
    // Vuokralaisen tili ei kuulu sopimukseen: vuokra ei mene sinne.
    expect(missingPartyDetails([valmis()])).toEqual([]);
  });
});
