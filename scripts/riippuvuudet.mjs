#!/usr/bin/env node
// Riippuvuuksien pääversion nostojen tunnistus (Jukan päätös 14.10.2026).
//
// Miksi: WeasyPrint 63 → 70 yhdistyi 8.10.2026 automaattisesti kuin pieni päivitys
// ja rikkoi jokaisen logollisen sopimuksen kuudeksi päiväksi. Pääversion nosto voi
// muuttaa rajapintoja, joten sitä ei yhdistetä ilman Jukan tarkistusta.
//
// Käyttö:
//   - scripts/pr.mjs kutsuu `tunnistaMajorNostot()`: jos nostoja on, PR saa
//     tunnisteen `riippuvuus-major` eikä yhdisty automaattisesti.
//   - CI (riippuvuusvahti): `node scripts/riippuvuudet.mjs --tarkista [--pohja <ref>]`
//     päättyy virheeseen, jos nostoja on eikä ympäristössä ole HYVAKSYTTY=true
//     (Jukka lisää PR:ään tunnisteen `riippuvuus-major-hyvaksytty`).
//
// Tarkistetut tiedostot: package.json (dependencies, devDependencies,
// optionalDependencies, peerDependencies, overrides), Pythonin requirements*.txt
// ja Dockerfile-tiedostojen FROM-rivit. Uusi tai poistettu paketti ei ole nosto.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const NPM_OSIOT = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

/** Versiomerkkijonosta numerot, esim. "^15.5.0" → [15, 5, 0]. Ei numeroa → null. */
export function jasennaVersio(merkkijono) {
  if (typeof merkkijono !== "string") return null;
  // Etuliitteet (^, ~, >=, ==, v, npm:nimi@) eivät kuulu versioon.
  const osuma = merkkijono.replace(/^npm:.*@/, "").match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!osuma) return null;
  return [Number(osuma[1]), Number(osuma[2] ?? 0), Number(osuma[3] ?? 0)];
}

/**
 * Onko nosto pääversion nosto. 0.x-versioissa sivuversio on käytännössä
 * pääversio (semver: 0.y.z voi rikkoa rajapinnan millä tahansa nostolla).
 */
export function onMajorNosto(vanha, uusi) {
  const a = jasennaVersio(vanha);
  const b = jasennaVersio(uusi);
  if (!a || !b) return false;
  if (b[0] > a[0]) return true;
  if (a[0] === 0 && b[0] === 0 && b[1] > a[1]) return true;
  return false;
}

function litteaksi(objekti, etuliite, tulos) {
  for (const [avain, arvo] of Object.entries(objekti ?? {})) {
    const nimi = etuliite ? `${etuliite} > ${avain}` : avain;
    if (typeof arvo === "string") tulos.set(nimi, arvo);
    else if (arvo && typeof arvo === "object") litteaksi(arvo, nimi, tulos);
  }
  return tulos;
}

function npmVersiot(teksti) {
  const json = JSON.parse(teksti);
  const versiot = new Map();
  for (const osio of NPM_OSIOT) {
    for (const [nimi, versio] of Object.entries(json[osio] ?? {})) versiot.set(nimi, versio);
  }
  for (const [nimi, versio] of litteaksi(json.overrides, "", new Map())) versiot.set(`overrides: ${nimi}`, versio);
  return versiot;
}

function requirementsVersiot(teksti) {
  const versiot = new Map();
  for (const raaka of teksti.split(/\r?\n/)) {
    const rivi = raaka.replace(/#.*/, "").trim();
    const osuma = rivi.match(/^([A-Za-z0-9_.-]+)(\[[^\]]*\])?\s*(==|>=|~=|===)\s*([^\s;,]+)/);
    if (osuma) versiot.set(osuma[1].toLowerCase().replace(/_/g, "-"), osuma[4]);
  }
  return versiot;
}

function dockerVersiot(teksti) {
  const versiot = new Map();
  for (const raaka of teksti.split(/\r?\n/)) {
    const osuma = raaka.trim().match(/^FROM\s+(?:--platform=\S+\s+)?([^\s:@]+):([^\s@]+)/i);
    if (osuma) versiot.set(osuma[1], osuma[2]);
  }
  return versiot;
}

/** Tiedoston tyyppi nimen perusteella, tai null jos tiedostoa ei tarkisteta. */
export function tiedostonTyyppi(polku) {
  const nimi = polku.split("/").pop() ?? "";
  if (polku.includes("node_modules/")) return null;
  if (nimi === "package.json") return "npm";
  if (/^requirements.*\.txt$/.test(nimi)) return "python";
  if (/^Dockerfile/.test(nimi)) return "docker";
  return null;
}

/** Pääversion nostot yhdessä tiedostossa: [{ tiedosto, paketti, vanha, uusi }]. */
export function majorNostotTiedostossa(polku, vanhaTeksti, uusiTeksti) {
  const tyyppi = tiedostonTyyppi(polku);
  if (!tyyppi || vanhaTeksti == null || uusiTeksti == null) return [];
  const lue = tyyppi === "npm" ? npmVersiot : tyyppi === "python" ? requirementsVersiot : dockerVersiot;
  const vanhat = lue(vanhaTeksti);
  const uudet = lue(uusiTeksti);
  const nostot = [];
  for (const [paketti, uusi] of uudet) {
    const vanha = vanhat.get(paketti);
    if (vanha !== undefined && onMajorNosto(vanha, uusi)) nostot.push({ tiedosto: polku, paketti, vanha, uusi });
  }
  return nostot;
}

function gitTeksti(cwd, ...args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/**
 * Vertaa HEADin tarkistettavia tiedostoja pohjaan. Oletuspohja on yhteinen
 * esivanhempi origin/mainin kanssa, jolloin mainin omat muutokset eivät näy
 * tämän haaran nostoina. CI antaa PR:n pohjan (`--pohja <sha>`).
 */
export function tunnistaMajorNostot({ pohja, cwd = process.cwd() } = {}) {
  const vertailukohta =
    pohja ?? gitTeksti(cwd, "merge-base", "origin/main", "HEAD")?.trim() ?? "origin/main";
  const tiedostot = (gitTeksti(cwd, "ls-files") ?? "").split(/\r?\n/).filter((p) => tiedostonTyyppi(p));
  const nostot = [];
  for (const polku of tiedostot) {
    const vanha = gitTeksti(cwd, "show", `${vertailukohta}:${polku}`);
    const uusi = gitTeksti(cwd, "show", `HEAD:${polku}`);
    nostot.push(...majorNostotTiedostossa(polku, vanha, uusi));
  }
  return nostot;
}

export function kuvaaNostot(nostot) {
  return nostot.map((n) => `- ${n.paketti}: ${n.vanha} → ${n.uusi} (${n.tiedosto})`).join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const pohja = args.includes("--pohja") ? args[args.indexOf("--pohja") + 1] : undefined;
  const nostot = tunnistaMajorNostot({ pohja });
  if (nostot.length === 0) {
    console.log("Ei pääversion nostoja.");
    process.exit(0);
  }
  console.log(`Pääversion nostoja ${nostot.length}:\n${kuvaaNostot(nostot)}`);
  if (args.includes("--tarkista") && process.env.HYVAKSYTTY !== "true") {
    console.error(
      "Pääversion nosto vaatii Jukan tarkistuksen: lisää PR:ään tunniste riippuvuus-major-hyvaksytty, kun muutos on testattu.",
    );
    process.exit(1);
  }
  console.log("Hyväksytty tunnisteella riippuvuus-major-hyvaksytty.");
}
