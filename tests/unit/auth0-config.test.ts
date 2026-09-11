import { describe, expect, it } from "vitest";
import { AUTHORIZATION_PARAMETERS } from "@/lib/auth/auth0";

/**
 * Kirjautumisen parametrit.
 *
 * Tämä testi on olemassa yhtä virhettä varten: jos `connection: "email"`
 * katoaa, Auth0 näyttää salasanalomakkeen. Salasanoja ei ole olemassa, joten
 * kukaan ei pääse kirjautumaan — mutta mikään ei kaadu eikä lokita mitään,
 * joten vika löytyisi vasta käyttäjän ilmoituksesta.
 *
 * Testi ei voi tarkistaa Auth0-tenantin omaa asetusta (Authentication
 * Profile = Identifier First), joka on sama vika toisesta suunnasta. Se on
 * BLOCKERS.md:ssä EU-siirron muistilistalla.
 */
describe("kirjautumisen parametrit", () => {
  it("ohjaa sähköpostiyhteyteen", () => {
    expect(AUTHORIZATION_PARAMETERS.connection).toBe("email");
  });

  it("pyytää suomenkielisen käyttöliittymän", () => {
    expect(AUTHORIZATION_PARAMETERS.ui_locales).toBe("fi");
  });

  it("ei pyydä salasanayhteyttä", () => {
    const values = Object.values(AUTHORIZATION_PARAMETERS) as string[];
    expect(values).not.toContain("Username-Password-Authentication");
  });
});
