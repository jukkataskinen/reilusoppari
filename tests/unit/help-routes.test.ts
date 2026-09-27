import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { HELP_ROUTE_SLUGS, helpFor } from "@/lib/help/routes";
import { HELP_GROUPS, HELP_TOPICS, sectionId } from "@/lib/help/topics";

/**
 * Jokaisella kirjautuneen käyttäjän sivulla on linkki ohjeeseen. Testi käy
 * läpi kaikki sivutiedostot, joten uusi sivu ei voi jäädä ilman ohjetta
 * (CLAUDE.md, Ohjeet).
 */

const ROOT = join(process.cwd(), "src", "app");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === "page.tsx" ? [full] : [];
  });
}

/** Sivutiedosto osoitteeksi: dynaamiset osat korvataan esimerkkiarvolla. */
const toPath = (file: string) =>
  "/" +
  relative(ROOT, file)
    .split(sep)
    .slice(0, -1)
    .map((part) => (part.startsWith("[") ? "00000000-0000-0000-0000-000000000000" : part))
    .join("/");

/**
 * Julkiset sivut, joilla ei ole kirjautuneen kehystä. Niillä ohjelinkkiä ei
 * näytetä, koska kehitystoive vaatii tilin. Jos jollekin näistä tulee
 * kirjautuneen kehys, alempi testi kaatuu ja sivu on lisättävä karttaan.
 */
const PUBLIC = [/^\/offline$/, /^\/ohjeet(\/|$)/, /^\/todistus\//];

describe("ohjelinkit", () => {
  const files = pages(ROOT);
  const all = files.map((file) => ({ file, path: toPath(file).replace(/\/$/, "") || "/" }));

  it("löytää sivut", () => expect(all.length).toBeGreaterThan(35));

  for (const { path } of all.filter((p) => !PUBLIC.some((re) => re.test(p.path)))) {
    it(`${path} osoittaa ohjeeseen`, () => {
      expect(helpFor(path), "Lisää sivulle ohje tiedostoon src/lib/help/routes.ts").not.toBeNull();
    });
  }

  for (const { file, path } of all.filter((p) => PUBLIC.some((re) => re.test(p.path)))) {
    it(`${path} on julkinen eikä käytä kirjautuneen kehystä`, () => {
      const source = readFileSync(file, "utf8");
      const shells = source.match(/<AppShell\b[^>]*>/g) ?? [];
      for (const shell of shells) expect(shell, path).toContain("signedIn={false}");
    });
  }

  it("valikon kohdat osoittavat ohjeeseen", () => {
    for (const href of ["/asunnot", "/vuokrasuhteet", "/omat-tiedot"]) {
      expect(helpFor(href), href).not.toBeNull();
    }
  });

  it("kartan ohjeet ja osiot ovat olemassa", () => {
    for (const r of HELP_ROUTE_SLUGS) {
      const topic = HELP_TOPICS.find((t) => t.slug === r.slug);
      expect(topic, r.slug).toBeTruthy();
      if (r.section) expect(topic!.sections.map((s) => s.title), `${r.slug}: ${r.section}`).toContain(r.section);
    }
  });

  it("ohje vie osioon ankkurilla", () => {
    expect(helpFor("/asunnot")).toEqual({ slug: "asunnot", title: "Asunnot", href: "/ohjeet/asunnot" });
    expect(helpFor("/kuitti")?.href).toBe("/ohjeet/kulut#kuitin-kuvaaminen");
    expect(helpFor("/asunnot/abc/vuokrasuhde/uusi")?.href).toBe("/ohjeet/vuokrasuhde#uusi-vuokrasuhde");
    expect(helpFor("/vuokrasuhteet/abc/katselmus/keittio")?.slug).toBe("katselmus");
    expect(helpFor("/vuokrasuhteet/abc/loppukatselmus/keittio")?.slug).toBe("loppukatselmus");
    expect(helpFor("/")?.slug).toBe("aloitus");
  });
});

describe("ohjeaiheet", () => {
  it("tunnukset ovat yksilöllisiä", () => {
    const slugs = HELP_TOPICS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  for (const t of HELP_TOPICS) {
    it(`${t.slug}: ryhmä, osiot ja viittaukset kunnossa`, () => {
      expect(HELP_GROUPS).toContain(t.group);
      expect(t.sections.length).toBeGreaterThan(0);
      const anchors = t.sections.map((s) => sectionId(s.title));
      expect(new Set(anchors).size).toBe(anchors.length);
      for (const r of t.related ?? []) expect(HELP_TOPICS.some((o) => o.slug === r), `${t.slug} → ${r}`).toBe(true);
    });

    // Sävy: ei huutomerkkejä (CLAUDE.md kohta 2).
    it(`${t.slug}: ei huutomerkkejä`, () => {
      expect(JSON.stringify(t)).not.toContain("!");
    });
  }
});
