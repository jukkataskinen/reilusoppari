import { describe, expect, it } from "vitest";
import {
  paivitaYmparisto,
  sovellusOsoitteet,
  tenanttiOnTyhja,
  vieraatSovellukset,
} from "@/lib/auth/tenant-setup";

/*
  Nämä testit koskevat vahingon estämistä, eivät ominaisuutta.

  Asetusskripti ajetaan käsin, harvoin ja jännittyneenä. Juuri silloin
  ympäristömuuttuja osoittaa vanhaan tenanttiin, jossa ovat eSinetti, Adepta
  PPR ja SKOG — ja sama kutsu, joka asettaa uuden oikein, rikkoo vanhan.
*/
describe("vieraatSovellukset", () => {
  it("hyväksyy tyhjän tenantin", () => {
    expect(vieraatSovellukset([], ["Reilusoppari"])).toEqual([]);
  });

  it("hyväksyy Auth0:n omat sovellukset, joita ei itse ole luotu", () => {
    const clients = [
      { client_id: "a", name: "Default App" },
      { client_id: "b", name: "All Applications" },
    ];
    expect(vieraatSovellukset(clients, ["Reilusoppari"])).toEqual([]);
  });

  it("hyväksyy odotetut sovellukset", () => {
    const clients = [
      { client_id: "a", name: "Reilusoppari" },
      { client_id: "b", name: "Asetusskripti" },
    ];
    expect(vieraatSovellukset(clients, ["Reilusoppari", "Asetusskripti"])).toEqual([]);
  });

  it("PYSÄYTTÄÄ, jos tenantissa on muiden projektien sovelluksia", () => {
    const clients = [
      { client_id: "a", name: "Reilusoppari" },
      { client_id: "b", name: "eSinetti" },
      { client_id: "c", name: "Adepta SKOG" },
    ];
    const vieraat = vieraatSovellukset(clients, ["Reilusoppari"]);

    expect(vieraat).toEqual(["Adepta SKOG", "eSinetti"]);
    expect(tenanttiOnTyhja(vieraat)).toBe(false);
  });

  it("ei erottele isoja ja pieniä kirjaimia", () => {
    const clients = [{ client_id: "a", name: "reilusoppari" }];
    expect(vieraatSovellukset(clients, ["Reilusoppari"])).toEqual([]);
  });
});

describe("sovellusOsoitteet", () => {
  it("rakentaa paluuosoitteen jokaiselle perustalle", () => {
    const osoitteet = sovellusOsoitteet(["http://localhost:3000", "https://app.reilusoppari.fi"]);

    expect(osoitteet.callbacks).toEqual([
      "http://localhost:3000/auth/callback",
      "https://app.reilusoppari.fi/auth/callback",
    ]);
  });

  /*
    Auth0 vertaa osoitteita merkkijonoina. `https://x.fi/` ja `https://x.fi`
    ovat sille eri asia, ja ylimääräinen kauttaviiva tuottaa virheen
    "Callback URL mismatch", joka ei kerro syytä.
  */
  it("siivoaa lopun kauttaviivan", () => {
    const osoitteet = sovellusOsoitteet(["https://app.reilusoppari.fi/"]);

    expect(osoitteet.callbacks).toEqual(["https://app.reilusoppari.fi/auth/callback"]);
    expect(osoitteet.allowed_logout_urls).toEqual(["https://app.reilusoppari.fi"]);
  });

  it("poistaa kaksoiskappaleet ja tyhjät", () => {
    const osoitteet = sovellusOsoitteet([
      "https://app.reilusoppari.fi",
      "https://app.reilusoppari.fi/",
      "",
    ]);
    expect(osoitteet.web_origins).toEqual(["https://app.reilusoppari.fi"]);
  });
});

describe("paivitaYmparisto", () => {
  it("korvaa olemassa olevan rivin", () => {
    const ennen = "AUTH0_DOMAIN=vanha.auth0.com\nSUPABASE_URL=https://x.supabase.co\n";
    const jalkeen = paivitaYmparisto(ennen, { AUTH0_DOMAIN: "uusi.eu.auth0.com" });

    expect(jalkeen).toContain("AUTH0_DOMAIN=uusi.eu.auth0.com");
    expect(jalkeen).not.toContain("vanha.auth0.com");
  });

  /*
    `.env.local` sisältää myös Supabasen ja eSinetin tunnukset. Niiden
    menettäminen siksi, että Auth0 vaihtui, olisi pahempi vahinko kuin se,
    jota ollaan korjaamassa.
  */
  it("ei koske muihin riveihin", () => {
    const ennen = "# kommentti\nSUPABASE_URL=https://x.supabase.co\nAUTH0_DOMAIN=vanha\n";
    const jalkeen = paivitaYmparisto(ennen, { AUTH0_DOMAIN: "uusi" });

    expect(jalkeen).toContain("# kommentti");
    expect(jalkeen).toContain("SUPABASE_URL=https://x.supabase.co");
  });

  it("lisää puuttuvan avaimen loppuun", () => {
    const jalkeen = paivitaYmparisto("SUPABASE_URL=x\n", { AUTH0_CLIENT_ID: "abc" });

    expect(jalkeen).toContain("SUPABASE_URL=x");
    expect(jalkeen).toContain("AUTH0_CLIENT_ID=abc");
  });

  it("korvaa myös kommentoidun rivin", () => {
    const jalkeen = paivitaYmparisto("# AUTH0_CLIENT_ID=\n", { AUTH0_CLIENT_ID: "abc" });

    expect(jalkeen.trim()).toBe("AUTH0_CLIENT_ID=abc");
  });
});
