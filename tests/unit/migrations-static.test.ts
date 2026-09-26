import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Migraatioiden staattinen tarkistus (CLAUDE.md kohta 2: RLS ja GRANTit).
 *
 * ===========================================================================
 * MIKSI TEKSTISTÄ EIKÄ KANNASTA
 *
 * Kantatestit ohittuvat ilman tunnuksia, ja migraatiot ajetaan käsin. Uusi
 * taulu ilman RLS:ää tai `security definer` -funktio ilman kiinnitettyä
 * `search_path`:ia olisi tietoturva-aukko, joka ei näkyisi yhdessäkään
 * testissä ennen kuin se on jo tuotannossa. Tämä tarkistus lukee
 * SQL-tiedostot ja toimii aina, myös CI:ssä ilman kantaa.
 *
 * Tarkistus on tarkoituksella yksinkertainen: se etsii lauseita tekstistä.
 * Se ei korvaa kannan tarkistusta, mutta se huomaa unohduksen.
 * ===========================================================================
 */

const DIR = path.resolve(process.cwd(), "supabase/migrations");
const files = readdirSync(DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();

/** Kommentit pois, jottei selitysteksti täytä ehtoja. */
function sql(name: string): string {
  return readFileSync(path.join(DIR, name), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "")
    .toLowerCase();
}

const all = files.map((name) => ({ name, text: sql(name) }));
const everything = all.map((file) => file.text).join("\n");

describe("migraatiotiedostot", () => {
  it("numerot ovat yksilöllisiä ja peräkkäisiä", () => {
    /*
      Kaksi samannumeroista migraatiota syntyy helposti rinnakkaisissa
      haaroissa, ja silloin ajojärjestys riippuu tiedostonimen lopusta.
    */
    const numbers = files.map((name) => Number(name.slice(0, 4)));
    expect(files.every((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))).toBe(true);
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
  });
});

describe("jokaisella taululla on RLS", () => {
  const created = [...everything.matchAll(/create table (?:if not exists )?([a-z_]+)/g)].map(
    (match) => match[1],
  );

  /*
    Migraatio 0001 kytkee RLS:n silmukassa taulunimien listalle. Lista
    luetaan tiedostosta, jottei sitä tarvitse toistaa tässä.
  */
  const loopTables = new Set(
    [...(all[0]?.text.matchAll(/'(rs_[a-z_]+)'/g) ?? [])].map((match) => match[1]),
  );

  it("tauluja löytyy", () => {
    expect(created.length).toBeGreaterThan(20);
  });

  for (const table of new Set(created)) {
    it(table, () => {
      expect(table.startsWith("rs_")).toBe(true);
      const explicit = everything.includes(`alter table ${table} enable row level security`);
      expect(explicit || loopTables.has(table)).toBe(true);
    });
  }
});

describe("security definer -funktiot", () => {
  /*
    `security definer` ajaa funktion omistajan oikeuksin. Ilman kiinnitettyä
    `search_path`:ia kutsuja voisi ohjata sen toiseen skeemaan.
  */
  const definers = [
    ...everything.matchAll(
      /create (?:or replace )?function ([a-z_]+)\s*\(([^)]*)\)[\s\S]*?(?:\$\$|as \$)/g,
    ),
  ].filter((match) => /security definer/.test(match[0]));

  it("löytyy", () => {
    expect(definers.length).toBeGreaterThan(0);
  });

  for (const match of definers) {
    it(`${match[1]} kiinnittää search_pathin`, () => {
      expect(match[0]).toMatch(/set search_path\s*=/);
    });
  }

  /*
    Kutsurajan laskurit ovat palvelun kirjanpitoa. Supabase antaa uusille
    funktioille oletuksena suoritusoikeuden anon-roolille, ja `revoke from
    public` ei poista sitä (migraatio 0017).
  */
  for (const name of ["rs_kasvata_kutsuraja", "rs_kasvata_linkkiraja"]) {
    it(`${name} ei ole anon-roolin kutsuttavissa`, () => {
      const revoke = new RegExp(`revoke [a-z ]+ on function ${name}\\([^)]*\\) from [a-z_, ]*anon`);
      expect(everything).toMatch(revoke);
    });
  }
});
