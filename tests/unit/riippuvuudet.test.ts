/**
 * Pääversion nostojen tunnistus (scripts/riippuvuudet.mjs). Taustalla
 * 8.10.2026: WeasyPrint 63 → 70 yhdistyi automaattisesti ja rikkoi logolliset
 * sopimukset. Nämä testit varmistavat, että sama nosto pysähtyy nyt Jukalle.
 */
import { describe, expect, it } from "vitest";
import {
  jasennaVersio,
  majorNostotTiedostossa,
  onMajorNosto,
  tiedostonTyyppi,
} from "../../scripts/riippuvuudet.mjs";

describe("onMajorNosto", () => {
  it.each([
    ["63.1", "70.0", true],
    ["^15.5.0", "^16.0.0", true],
    ["~1.2.3", "~1.3.0", false],
    ["1.2.3", "1.2.4", false],
    ["0.25.3", "0.26.0", true],
    ["0.25.3", "0.25.9", false],
    ["2.0.0", "1.9.0", false],
    ["latest", "next", false],
    ["npm:foo@1.0.0", "npm:foo@2.0.0", true],
  ])("%s → %s on major: %s", (vanha, uusi, odotettu) => {
    expect(onMajorNosto(vanha, uusi)).toBe(odotettu);
  });

  it("jäsentää versiosta numerot", () => {
    expect(jasennaVersio(">=3.11")).toEqual([3, 11, 0]);
    expect(jasennaVersio("*")).toBeNull();
  });
});

describe("tiedostonTyyppi", () => {
  it("tunnistaa tarkistettavat tiedostot", () => {
    expect(tiedostonTyyppi("package.json")).toBe("npm");
    expect(tiedostonTyyppi("clients/x/package.json")).toBe("npm");
    expect(tiedostonTyyppi("sealer/requirements.txt")).toBe("python");
    expect(tiedostonTyyppi("sealer/requirements-dev.txt")).toBe("python");
    expect(tiedostonTyyppi("sealer/Dockerfile")).toBe("docker");
    expect(tiedostonTyyppi("node_modules/x/package.json")).toBeNull();
    expect(tiedostonTyyppi("README.md")).toBeNull();
  });
});

describe("majorNostotTiedostossa", () => {
  it("WeasyPrint 63 → 70 requirements.txt:ssä on pääversion nosto", () => {
    const vanha = "flask==3.1.3\n# kommentti\nweasyprint==63.1\npyhanko==0.25.3\n";
    const uusi = "flask==3.1.4\n# kommentti\nweasyprint==70.0  # nosto\npyhanko==0.25.3\nuusi-paketti==9.0\n";
    expect(majorNostotTiedostossa("sealer/requirements.txt", vanha, uusi)).toEqual([
      { tiedosto: "sealer/requirements.txt", paketti: "weasyprint", vanha: "63.1", uusi: "70.0" },
    ]);
  });

  it("package.json: vain pääversiot, myös overrides; uusi paketti ei ole nosto", () => {
    const vanha = JSON.stringify({
      dependencies: { next: "^15.5.0", zod: "^4.1.0" },
      devDependencies: { vitest: "^4.0.0" },
      overrides: { esbuild: "0.25.0" },
    });
    const uusi = JSON.stringify({
      dependencies: { next: "^16.0.1", zod: "^4.2.0", uusi: "^1.0.0" },
      devDependencies: { vitest: "^4.0.5" },
      overrides: { esbuild: "0.26.0" },
    });
    expect(majorNostotTiedostossa("package.json", vanha, uusi)).toEqual([
      { tiedosto: "package.json", paketti: "next", vanha: "^15.5.0", uusi: "^16.0.1" },
      { tiedosto: "package.json", paketti: "overrides: esbuild", vanha: "0.25.0", uusi: "0.26.0" },
    ]);
  });

  it("Dockerfile: pohjakuvan versio", () => {
    const vanha = "FROM public.ecr.aws/docker/library/python:3.11-slim\nRUN x";
    const uusi = "FROM public.ecr.aws/docker/library/python:4.0-slim\nRUN x";
    expect(majorNostotTiedostossa("sealer/Dockerfile", vanha, uusi)).toHaveLength(1);
    const pieni = "FROM public.ecr.aws/docker/library/python:3.12-slim\nRUN x";
    expect(majorNostotTiedostossa("sealer/Dockerfile", vanha, pieni)).toEqual([]);
  });

  it("uusi tiedosto (ei vanhaa versiota) ei ole nosto", () => {
    expect(majorNostotTiedostossa("package.json", null, "{}")).toEqual([]);
  });
});
