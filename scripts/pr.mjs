#!/usr/bin/env node
// PR:n avaus ja automaattinen yhdistäminen Claude-istunnoista (Jukan päätös 4.10.2026,
// sama malli kuin adepta-repossa). Työ ei mene enää suoraan mainiin: haara pushataan,
// PR avataan ja se yhdistyy vasta, kun CI on vihreä. Jukka näkee PR:n puhelimella.
//
// gh-työkalu ei saa Jukan koneelta aina verkkoyhteyttä, joten kutsut tehdään Noden
// fetchillä gh:n tallentamalla tunnuksella. Tunnusta ei tulosteta.
//
//   node scripts/pr.mjs --otsikko "Otsikko" [--kuvaus tiedosto.md] [--ei-automaattista]
//
// Riippuvuuden pääversion nosto (scripts/riippuvuudet.mjs) jättää PR:n aina Jukalle.
//
// Haara on nykyinen haara. Mainista PR:ää ei voi avata.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { kuvaaNostot, tunnistaMajorNostot } from "./riippuvuudet.mjs";

const args = process.argv.slice(2);
const arvo = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const otsikko = arvo("--otsikko");
if (!otsikko) {
  console.error('Anna --otsikko "..."');
  process.exit(1);
}
const kuvausTiedosto = arvo("--kuvaus");
const kuvaus = kuvausTiedosto ? readFileSync(kuvausTiedosto, "utf8") : "";

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const haara = git("rev-parse", "--abbrev-ref", "HEAD");
if (haara === "main" || haara === "master" || haara === "HEAD") {
  console.error(`Olet haarassa ${haara}. Tee työ omassa haarassa (esim. git switch -c claude/aihe).`);
  process.exit(1);
}
// Repo päätellään remotesta, jotta sama skripti toimii kaikissa Jukan repoissa.
const remote = git("remote", "get-url", "origin");
const REPO = remote.replace(/^.*github\.com[:/]/, "").replace(/\.git$/, "");

git("push", "-u", "origin", haara);

const GH = process.platform === "win32" && existsSync("C:/Program Files/GitHub CLI/gh.exe") ? "C:/Program Files/GitHub CLI/gh.exe" : "gh";
const token = execFileSync(GH, ["auth", "token"], { encoding: "utf8" }).trim();
const h = { Authorization: `Bearer ${token}`, "User-Agent": "claude-pr", Accept: "application/vnd.github+json" };

async function api(polku, metodi = "GET", runko) {
  const r = await fetch(`https://api.github.com${polku}`, { method: metodi, headers: h, body: runko ? JSON.stringify(runko) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GitHub ${metodi} ${polku}: ${r.status} ${j.message ?? ""}`);
  return j;
}
async function graphql(query, variables) {
  const j = await api("/graphql", "POST", { query, variables });
  if (j.errors?.length) throw new Error(j.errors.map((e) => e.message).join("; "));
  return j.data;
}

const avoimet = await api(`/repos/${REPO}/pulls?state=open&head=${REPO.split("/")[0]}:${encodeURIComponent(haara)}`);
const pr = avoimet[0] ?? (await api(`/repos/${REPO}/pulls`, "POST", { title: otsikko, head: haara, base: "main", body: kuvaus }));
console.log(`PR #${pr.number}: ${pr.html_url}`);

// Riippuvuuden pääversion nosto ei yhdisty automaattisesti (Jukka 14.10.2026): WeasyPrint
// 63 → 70 yhdistyi 8.10.2026 kuin pieni päivitys ja rikkoi logolliset sopimukset.
// PR saa tunnisteen ja selityksen, ja Jukka yhdistää sen itse tarkistuksen jälkeen.
async function varmistaTunniste(nimi, color, description) {
  await api(`/repos/${REPO}/labels`, "POST", { name: nimi, color, description }).catch(() => {});
}
try {
  git("fetch", "--quiet", "origin", "main");
} catch {
  // Verkkovirhe: verrataan viimeksi haettuun mainiin.
}
const majorNostot = tunnistaMajorNostot();
if (majorNostot.length > 0) {
  await varmistaTunniste("riippuvuus-major", "d93f0b", "Riippuvuuden pääversion nosto: Jukka tarkistaa ennen yhdistämistä");
  await varmistaTunniste("riippuvuus-major-hyvaksytty", "0e8a16", "Jukka on tarkistanut pääversion noston");
  await api(`/repos/${REPO}/issues/${pr.number}/labels`, "POST", { labels: ["riippuvuus-major"] });
  await api(`/repos/${REPO}/issues/${pr.number}/comments`, "POST", {
    body:
      "Tässä PR:ssä nousee riippuvuuden pääversio, joten se ei yhdisty automaattisesti.\n\n" +
      `${kuvaaNostot(majorNostot)}\n\n` +
      "Pääversio voi muuttaa toimintaa. Kokeile esikatselussa ainakin docs/kriittiset-polut.md:n polut. " +
      "Kun kaikki toimii, lisää tunniste riippuvuus-major-hyvaksytty ja yhdistä PR.",
  });
  console.log(`Pääversion nostoja ${majorNostot.length}: PR jää Jukan tarkistettavaksi (tunniste riippuvuus-major).`);
}
const automaattinen = !args.includes("--ei-automaattista") && majorNostot.length === 0;

// Ilman haarasuojausta GitHub pitäisi PR:ää heti "valmiina" ja yhdistäisi sen ennen CI:tä.
// Silloin PR jätetään auki Jukan tarkistettavaksi.
const suojattu = await api(`/repos/${REPO}/branches/main/protection`).then(() => true, () => false);
if (!suojattu && automaattinen) {
  console.log("Mainin haarasuojaus ei ole päällä, joten PR jää auki tarkistettavaksi.");
} else if (automaattinen) {
  try {
    await graphql(
      "mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){pullRequest{number}}}",
      { id: pr.node_id },
    );
    console.log("Yhdistyy automaattisesti, kun tarkistukset ovat vihreänä.");
  } catch (e) {
    // Jos tarkistukset ovat jo valmiit, GitHub ei salli automaattista yhdistämistä vaan PR yhdistetään heti.
    if (/clean status|unstable status/i.test(e.message)) {
      await api(`/repos/${REPO}/pulls/${pr.number}/merge`, "PUT", { merge_method: "squash" });
      console.log("Tarkistukset olivat jo valmiit, PR yhdistetty.");
    } else {
      // Yleisin syy: automaattinen yhdistäminen tai haarasuojaus ei ole repossa päällä. PR jää auki Jukalle.
      console.error(`Automaattista yhdistämistä ei voitu kytkeä (${e.message}). PR jää auki tarkistettavaksi.`);
    }
  }
}
