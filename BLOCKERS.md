# BLOCKERS — reilusoppari (sovellus)

## Tila 2026-09-10: rakennusohje paikallaan, riippuvuudet ratkaistu

`CLAUDE.md` on kopioitu tänne Downloads-kansiosta 2026-09-10. Alkuperäinen on
edelleen `Downloads/REILUSOPPARI_RAKENNUSOHJE.md`.

Hakemisto **ei ole git-repo**. Repoa ei luotu tarkoituksella: jos GitHubiin
luodaan repo README:n kanssa ja se kloonataan, paikallinen `git init` johtaisi
kahteen eri historiaan.

Sisarprojektit: `esinetti` (moottori), `reilusoppari-web` (julkinen sivusto,
<https://github.com/jukkataskinen/reilusoppari-web>).

---

## ~~1. eSinetin `/documents/render` ja `/documents/seal`~~ — TOTEUTETTU 2026-09-10

Molemmat on nyt rakennettu eSinettiin (commit `96b4dd3`):

| Endpoint | Mitä tekee |
|---|---|
| `POST /api/v1/documents/render` | Pohja + arvot → PDF. **Tilaton**, ei tallenna mitään. Kuvat `assets`-parametrilla base64:na. Palauttaa `pdf_base64`, `sha256` ja `missing_placeholders`. |
| `POST /api/v1/documents/seal` | Sinetöi PDF ilman allekirjoittajia. Palauttaa `id`, `sealed_sha256` ja `download_url`. Löytyy tämän jälkeen `GET /verify?sha256=…`-reitiltä. |

Reilusopparin kannalta olennaista:

- **Katselmuspöytäkirjan kuvat toimivat.** `assets`-parametri ottaa PNG/JPEG
  base64:na, enintään 200 kuvaa ja 40 MB yhteensä. Pohjassa viitataan
  `{{asset:avain}}`-syntaksilla. Renderöijä **ei hae ulkoisia resursseja**,
  joten kuvia ei voi antaa URL:na — ne on lähetettävä mukana.
- **Determinismi:** anna `today`-kenttä itse, jos haluat että saman
  vuokrasuhteen uudelleenrenderöinti tuottaa saman tiivisteen.
- **Julkaisematonta pohjaa ei voi käyttää.** Reilusopparin pohjien on oltava
  `published = true` eSinetissä ennen kuin niistä voi tuottaa asiakirjan.
- **Metatiedoissa ei saa olla henkilötunnusta.** `/documents/seal` hylkää
  pyynnön, jos `metadata` sisältää hetulta näyttävän arvon — myös avaimen
  nimessä. Sinetöity PDF on pysyvä, joten tarkistus on ennen sinetöintiä.
- **Säilytysaika:** `retain_years` 1–10, tai puuttuva jolloin automaattista
  poistoa ei ole.

Kaksi asiaa on vielä Jukan tehtävälistalla eSinetin puolella:

1. **Migraatio `0009_standalone_documents.sql` on ajettava live-Supabasea
   vasten.** Ennen sitä `/documents/seal` palauttaa 500:n. Ks. eSinetin
   `BLOCKERS.md` #12.
2. **WeasyPrint on uusi riippuvuus docservicessä.** CI todentaa sen; imagen
   koko kasvaa.

## ~~2. Ristiriita: kuka päättää mitä kuvataan~~ — RATKAISTU 2026-09-10

Jukan päätös, ks. `DECISIONS.md`: oletuslista on muistin tueksi, ei rajoite.
Kumpi tahansa osapuoli voi lisätä oman kohtansa, ja vuokralaisen lisäämä kohta
on samanarvoinen. Allekirjoitus vasta kun kuvat on tallennettu ja katselmus
lukittu. `CLAUDE.md` on päivitetty (kohdat 1, 3, 4 ja 5.3).

---

## ~~3. Ristiriita: onko todistus arvio henkilöstä~~ — RATKAISTU 2026-09-10

Jukan päätös, ks. `DECISIONS.md`:

- **Arvio on kaksiarvoinen:** `recommend` tai ei arviota. Kielteistä
  vaihtoehtoa ei ole.
- **Todistus syntyy aina.** Vastaanottaja ei voi estää sitä, mutta näkee sen
  ennen sinetöintiä ja voi liittää vastineen.
- **Sitova toteutussääntö:** jos suositusta ei ole, todistuksessa ei ole
  suositusosiota lainkaan — ei tyhjää kohtaa eikä mainintaa. Muuten
  kaksiarvoisuudesta tulee kiertoteitse kolmiportainen asteikko.

`CLAUDE.md` on päivitetty vastaamaan tätä (kohta 2, tietomalli, kohta 5.8).
Sivuston tekstit on korjattu samana päivänä.

## Ympäristön tila (päivitetty 2026-09-11)

| Palvelu | Tila |
|---|---|
| Supabase (EU) | **valmis** – migraatiot 0001 ja 0002 ajettu, RLS todennettu |
| Vercel-projekti | **valmis** – <https://reilusoppari.vercel.app> vastaa 200 |
| GitHub-repo | **valmis** – <https://github.com/jukkataskinen/reilusoppari> |
| Auth0 passwordless | puuttuu – estää kirjautumisen ja vaiheen 0 DoD:n |
| eSinetti-tenant + API-avain | puuttuu – mock riittää vaiheisiin 0 ja 1 |
| VAPID, Resend, Stripe | puuttuu – tarvitaan vaiheissa 2 ja 5 |

**`app.reilusoppari.fi` ei ole vielä liitetty** (404). Koska `reilusoppari.fi`:n
DNS-vyöhyke on Vercelillä, liittäminen on yksi askel: projekti → Settings →
Domains → Add `app.reilusoppari.fi`. Tietue syntyy automaattisesti.

**Ympäristömuuttujat puuttuvat Vercelistä.** Niitä ei vielä tarvita, koska
julkaistu sivu on paikanvaraaja, mutta heti kun tietokantakerros otetaan
käyttöön näkymissä, deploy tarvitsee ainakin `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` ja `SUPABASE_ANON_KEY`.

## 4. Jukan tehtävät (CLAUDE.md kohta 9)

| # | Tehtävä | Tila |
|---|---|---|
| 1 | Repo `reilusoppari` GitHubiin | tekemättä |
| 2 | Supabase (EU), Auth0 passwordless, Vercel `app.reilusoppari.fi`, Resend, VAPID, Stripe test | tekemättä |
| 3 | eSinetti-tenant `reilusoppari` + API-avain; `/documents/render` ja `/documents/seal` eSinetin PLANiin | tekemättä, ks. kohta 1 |
| 4 | Vuokrasopimuspohjan juridinen sisältö (AHVL 481/1995) | tekemättä, harkitse juristia |
| 5 | Verolaskelman ohjetekstit ja km-taksa | tekemättä |
| 6 | Todistuspohjien tekstit ja sanasto | tekemättä; linjaus lukittu, ks. DECISIONS.md |
| 7 | Kuluttajakäyttöehdot ja tietosuojaseloste | luonnokset olemassa `reilusoppari-web`-repossa, sovellukselle omat |

Huom kohta 7: `reilusoppari-web/src/app/{tietosuoja,kayttoehdot}` sisältää jo
pohjat, joissa on käsitelty kuvat kodista, molempien oikeus samaan aineistoon ja
todistuksen omistajuus. Ne on kirjoitettu sivustoa varten, mutta ovat suoraan
käyttökelpoinen lähtökohta myös sovellukselle.

---

## 5. Kustannukset

Sovellus tuo mukanaan palveluita, joita sivustolla ei ole: oma Supabase-projekti,
Auth0, Stripe ja vahva tunnistautuminen eSinetin kautta. Ks.
`reilusoppari-web/KUSTANNUKSET.md`, jossa nämä on arvioitu — ja etenkin siellä
oleva huomio siitä, että **tunnistautumisen yksikköhinta on suoraan kate-erä**:
29 € kattaa kaksi tunnistautumista ja jopa viiden vuoden vuokrasuhteen. Telian
tarjous kannattaa pyytää ennen kuin hinta lyödään lukkoon.

---

## Ensimmäinen kehote, kun repo on olemassa

> Lue CLAUDE.md, BLOCKERS.md ja esinetti-repon CLAUDE.md kohdat 0 ja 0.1.
> Luo PLAN.md kohdan 8 pohjalta ja aloita vaihe 0. BLOCKERS.md:n kohdat 1–3
> on ratkaistu; jäljellä on ympäristö (kohta 3 alempana) ja Jukan omat
> sisältötehtävät.
