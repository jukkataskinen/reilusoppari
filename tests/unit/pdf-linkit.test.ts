import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  PDF-tallennus ei saa jättää kotinäytön sovellusta umpikujaan (PLAN.md,
  Jukan havainnot 11.9. ja 10.10.2026).

  Kotinäytölle asennetussa sovelluksessa (`display-mode: standalone`) ei ole
  selaimen takaisin-nappia. `target="_blank"` jättää näkymän, josta ei pääse
  pois kuin sulkemalla koko sovellus; samaan ikkunaan avautuva lataus vie
  näkymän pois sieltä mihin käyttäjä jäi. Siksi kaikki PDF-lataukset kulkevat
  yhden komponentin (`PdfLink`) läpi, joka kotinäytön sovelluksessa hakee
  tiedoston ja antaa sen puhelimen jakovalikolle eikä vaihda näkymää
  lainkaan. Muualla linkki toimii kuten ennen (`target="_blank"`).
*/
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

const PDF_LINK_FILE = join("src", "components", "PdfLink.tsx");

describe("PDF-linkit", () => {
  it("PDF-lataukset käyttävät PdfLink-komponenttia, ei suoraa <a download>-linkkiä", () => {
    const puutteet: string[] = [];
    for (const file of tsxFiles("src")) {
      if (file === PDF_LINK_FILE) continue;
      const source = readFileSync(file, "utf8");
      if (/<a\b[^>]*\bdownload\b/.test(source)) puutteet.push(file);
    }
    expect(puutteet).toEqual([]);
  });

  it("PdfLink avautuu aina uuteen ikkunaan, jos jakovalikko ei toimi", () => {
    const source = readFileSync(PDF_LINK_FILE, "utf8");
    expect(source).toContain('target="_blank"');
    expect(source).toContain("navigator");
    expect(source).toMatch(/\.share\(/);
  });
});
