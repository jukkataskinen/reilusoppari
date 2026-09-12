import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createZip, crc32, safeName } from "@/lib/export/zip";

/**
 * ZIP-kirjoittajan testit.
 *
 * ===========================================================================
 * TARKISTUS TEHDÄÄN ULKOPUOLISELLA LUKIJALLA
 *
 * Itse kirjoitetun ja itse luetun tiedoston pyöräytys ei todistaisi mitään:
 * sama väärinkäsitys olisi molemmissa päissä, ja testi menisi läpi vaikka
 * tiedosto ei avautuisi millään oikealla ohjelmalla.
 *
 * Siksi tuotettu tiedosto avataan Pythonin `zipfile`-moduulilla, joka ei
 * tiedä tästä koodista mitään. `testzip()` tarkistaa myös jokaisen
 * tiedoston CRC:n.
 * ===========================================================================
 */

const HAKEMISTO = mkdtempSync(join(tmpdir(), "rs-zip-"));

afterAll(() => {
  rmSync(HAKEMISTO, { recursive: true, force: true });
});

/** Avaa paketin Pythonilla ja palauttaa sen sisällön. */
function avaaPythonilla(bytes: Uint8Array): { nimet: string[]; sisallot: Record<string, string> } {
  const polku = join(HAKEMISTO, `paketti-${Math.random().toString(36).slice(2)}.zip`);
  writeFileSync(polku, bytes);

  const skripti = [
    "import json, sys, zipfile",
    "z = zipfile.ZipFile(sys.argv[1])",
    "rikki = z.testzip()",
    "assert rikki is None, rikki",
    "nimet = z.namelist()",
    "sisallot = {n: z.read(n).decode('utf-8', 'replace') for n in nimet}",
    "print(json.dumps({'nimet': nimet, 'sisallot': sisallot}))",
  ].join("\n");

  const tuloste = execFileSync("python", ["-c", skripti, polku], { encoding: "utf8" });
  return JSON.parse(tuloste);
}

describe("CRC-32", () => {
  it("tuottaa tunnetut arvot", () => {
    /*
      Vertailuarvot ovat standardista. Jos tämä on väärin, jokainen paketti
      avautuu virheilmoituksella — ja syy olisi vaikea löytää, koska muoto
      näyttäisi muuten oikealta.
    */
    expect(crc32(new TextEncoder().encode(""))).toBe(0);
    expect(crc32(new TextEncoder().encode("a"))).toBe(0xe8b7be43);
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("paketin rakenne", () => {
  it("avautuu Pythonilla ja sisältö säilyy", () => {
    const paketti = createZip(
      [
        { name: "tiedot.json", bytes: new TextEncoder().encode('{"nimi":"Maija"}') },
        { name: "kansio/teksti.txt", bytes: new TextEncoder().encode("Hei maailma") },
      ],
      new Date("2026-09-12T10:30:00.000Z"),
    );

    const { nimet, sisallot } = avaaPythonilla(paketti);

    expect(nimet).toEqual(["tiedot.json", "kansio/teksti.txt"]);
    expect(sisallot["tiedot.json"]).toBe('{"nimi":"Maija"}');
    expect(sisallot["kansio/teksti.txt"]).toBe("Hei maailma");
  });

  it("säilyttää ääkköset tiedostonimessä", () => {
    // Lippu 0x0800 kertoo purkuohjelmalle, että nimi on UTF-8:aa. Ilman
    // sitä "Mäkitie" muuttuu purettaessa mojibakeksi.
    const paketti = createZip([
      { name: "asunnot/Mäkitie 12 A 4/kulut.json", bytes: new TextEncoder().encode("[]") },
    ]);

    expect(avaaPythonilla(paketti).nimet).toEqual(["asunnot/Mäkitie 12 A 4/kulut.json"]);
  });

  it("kestää tyhjän tiedoston", () => {
    const paketti = createZip([{ name: "tyhja.txt", bytes: new Uint8Array(0) }]);
    const { nimet, sisallot } = avaaPythonilla(paketti);

    expect(nimet).toEqual(["tyhja.txt"]);
    expect(sisallot["tyhja.txt"]).toBe("");
  });

  it("kestää tyhjän paketin", () => {
    // Käyttäjä, jolla ei ole vielä mitään, saa silti kelvollisen tiedoston.
    expect(avaaPythonilla(createZip([])).nimet).toEqual([]);
  });

  it("pakkaa toistuvan sisällön selvästi pienemmäksi", () => {
    const iso = new TextEncoder().encode("sama rivi\n".repeat(2000));
    const paketti = createZip([{ name: "iso.txt", bytes: iso }]);

    expect(paketti.length).toBeLessThan(iso.length / 4);
    expect(avaaPythonilla(paketti).sisallot["iso.txt"]).toBe(
      new TextDecoder().decode(iso),
    );
  });

  it("säilyttää tavut myös pakkaamattomana", () => {
    /*
      JPEG ja PDF eivät pienene deflatella, joten ne tallennetaan
      sellaisenaan. Tavujen on silti säilyttävä bitilleen — kuitin tiiviste
      lasketaan niistä.
    */
    const tavut = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const paketti = createZip([{ name: "kuva.jpg", bytes: tavut, compress: false }]);

    // Python tarkistaa CRC:n `testzip()`-kutsussa; pelkkä avautuminen riittää.
    expect(avaaPythonilla(paketti).nimet).toEqual(["kuva.jpg"]);
  });

  it("tuottaa saman tiedoston samasta sisällöstä", () => {
    // Aikaleima annetaan ulkoa juuri tätä varten.
    const hetki = new Date("2026-09-12T10:30:00.000Z");
    const tee = () => createZip([{ name: "a.txt", bytes: new TextEncoder().encode("x") }], hetki);

    expect(Buffer.from(tee())).toEqual(Buffer.from(tee()));
  });
});

describe("nimen siivous", () => {
  it("poistaa polun ylöspäin vievät osat", () => {
    /*
      Asunnon nimi on käyttäjän kirjoittamaa tekstiä ja päätyy
      tiedostonimeen. Purkuohjelmaa ei saa ohjata kirjoittamaan paketin
      ulkopuolelle.
    */
    expect(safeName("../../etc/passwd")).not.toContain("..");
    expect(safeName("kansio/alikansio")).not.toContain("/");
    expect(safeName("C:\\Windows")).not.toContain("\\");
  });

  it("säilyttää tavallisen nimen ja ääkköset", () => {
    expect(safeName("Mäkitie 12 A 4")).toBe("Mäkitie 12 A 4");
  });

  it("antaa tyhjälle varanimen", () => {
    // Nimetön tiedosto rikkoisi paketin.
    expect(safeName("   ")).toBe("nimeton");
    expect(safeName("///")).not.toBe("");
  });

  it("katkaisee liian pitkän", () => {
    expect(safeName("a".repeat(300)).length).toBe(80);
  });
});
