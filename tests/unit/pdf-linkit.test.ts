import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  PDF-linkit avautuvat aina omaan ikkunaansa (Jukka 10.10.2026).

  Kotinäytölle asennetussa sovelluksessa ei ole selaimen takaisin-nappia.
  Jos PDF aukeaa samaan ikkunaan, käyttäjä pääsee pois vain sulkemalla
  sovelluksen. `download`-attribuutti ei auta, koska puhelimet usein
  ohittavat sen ja näyttävät tiedoston.
*/
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

describe("PDF-linkit", () => {
  it("jokainen download-linkki avautuu uuteen ikkunaan", () => {
    const puutteet: string[] = [];
    for (const file of tsxFiles("src")) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/<a\b[^>]*?\bdownload=[^>]*>/g)) {
        if (!/target="_blank"/.test(match[0])) puutteet.push(file);
      }
    }
    expect(puutteet).toEqual([]);
  });
});
