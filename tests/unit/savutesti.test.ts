/**
 * Tuotannon savutesti: pääsy on kiinni ilman salaisuutta, ja vastaukseen
 * päätyy vain askeleen nimi, tila, kesto ja lyhyt koodi.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { tarkistaSavutestinPaasy } from "@/lib/savutesti/auth";
import { ajaAskeleet, SavutestiVirhe, varmista, virhekoodi } from "@/lib/savutesti/runner";

const SALAISUUS = "testi-salaisuus-joka-on-yli-32-merkkia-pitka";

describe("tarkistaSavutestinPaasy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("on kiinni, kun salaisuutta ei ole asetettu", () => {
    vi.stubEnv("SAVUTESTI_SECRET", "");
    expect(tarkistaSavutestinPaasy(`Bearer ${SALAISUUS}`)).toBe("ei_asetettu");
    expect(tarkistaSavutestinPaasy("Bearer ")).toBe("ei_asetettu");
  });

  it("on kiinni, kun salaisuus on liian lyhyt", () => {
    vi.stubEnv("SAVUTESTI_SECRET", "lyhyt");
    expect(tarkistaSavutestinPaasy("Bearer lyhyt")).toBe("ei_asetettu");
  });

  it("hylkää puuttuvan ja väärän otsakkeen", () => {
    vi.stubEnv("SAVUTESTI_SECRET", SALAISUUS);
    expect(tarkistaSavutestinPaasy(null)).toBe("kielletty");
    expect(tarkistaSavutestinPaasy(SALAISUUS)).toBe("kielletty");
    expect(tarkistaSavutestinPaasy(`Bearer ${SALAISUUS}x`)).toBe("kielletty");
    expect(tarkistaSavutestinPaasy(`Bearer ${SALAISUUS.replace("t", "T")}`)).toBe("kielletty");
  });

  it("päästää oikealla salaisuudella", () => {
    vi.stubEnv("SAVUTESTI_SECRET", SALAISUUS);
    expect(tarkistaSavutestinPaasy(`Bearer ${SALAISUUS}`)).toBe("ok");
  });
});

describe("ajaAskeleet", () => {
  it("ajaa kaikki askeleet, vaikka yksi kaatuu, ja kertoo vain koodin", async () => {
    const virheloki = vi.spyOn(console, "error").mockImplementation(() => {});
    const tulos = await ajaAskeleet([
      { nimi: "eka", aja: async () => {} },
      {
        nimi: "toka",
        aja: async () => {
          throw new Error("Yhtiön luonti epäonnistui: Matti Meikäläinen 010170-999R");
        },
      },
      { nimi: "kolmas", aja: async () => varmista(false, "ei_pdf") },
      { nimi: "neljas", aja: async () => {} },
    ]);

    expect(tulos.ok).toBe(false);
    expect(tulos.vaiheet.map((v) => [v.nimi, v.ok, v.koodi])).toEqual([
      ["eka", true, undefined],
      ["toka", false, "virhe"],
      ["kolmas", false, "ei_pdf"],
      ["neljas", true, undefined],
    ]);
    // Virheen viesti ei päädy vastaukseen eikä lokiin.
    expect(JSON.stringify(tulos)).not.toContain("Matti");
    expect(JSON.stringify(virheloki.mock.calls)).not.toContain("Matti");
    virheloki.mockRestore();
  });

  it("katkaisee jumittuvan askeleen aikarajaan", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const tulos = await ajaAskeleet([{ nimi: "jumi", aja: () => new Promise(() => {}) }], { aikaraja: 10 });
    expect(tulos.vaiheet[0]).toMatchObject({ nimi: "jumi", ok: false, koodi: "aikaraja" });
    vi.restoreAllMocks();
  });

  it("onnistuu, kun kaikki askeleet onnistuvat", async () => {
    const tulos = await ajaAskeleet([{ nimi: "a", aja: async () => {} }]);
    expect(tulos).toMatchObject({ ok: true, vaiheet: [{ nimi: "a", ok: true }] });
  });
});

describe("virhekoodi", () => {
  it("hyväksyy vain lyhyet tunnisteet", () => {
    expect(virhekoodi(new SavutestiVirhe("render_failed"))).toBe("render_failed");
    expect(virhekoodi({ code: "Jotain vapaata tekstiä" })).toBe("virhe");
    expect(virhekoodi(null)).toBe("virhe");
    expect(virhekoodi("merkkijono")).toBe("virhe");
  });
});

describe("Reilusopparin asiakirja-askeleet", () => {
  it("jokainen asiakirjapohja renderöityy keksityllä aineistolla omalla fontilla", async () => {
    const { asiakirjaAskeleet } = await import("@/lib/savutesti/steps");
    const tulos = await ajaAskeleet(asiakirjaAskeleet(), { aikaraja: 60_000 });
    expect(tulos.vaiheet.map((v) => v.nimi)).toEqual([
      "asiakirja_vuokrasopimus",
      "asiakirja_katselmuspoytakirja",
      "asiakirja_vuokratodistus",
      "asiakirja_verolaskelma",
    ]);
    expect(tulos.vaiheet.filter((v) => !v.ok)).toEqual([]);
  }, 60_000);
});
