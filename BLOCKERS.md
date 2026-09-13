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
| Auth0 passwordless | **valmis** – kirjautuminen todennettu päästä päähän 2026-09-11 |
| eSinetti-tenant + API-avain | puuttuu – mock riittää vaiheisiin 0 ja 1 |
| VAPID, Resend, Stripe | puuttuu – tarvitaan vaiheissa 2 ja 5 |

**`app.reilusoppari.fi` ei ole vielä liitetty** (404). Koska `reilusoppari.fi`:n
DNS-vyöhyke on Vercelillä, liittäminen on yksi askel: projekti → Settings →
Domains → Add `app.reilusoppari.fi`. Tietue syntyy automaattisesti.

**Ympäristömuuttujat puuttuvat Vercelistä.** Niitä ei vielä tarvita, koska
julkaistu sivu on paikanvaraaja, mutta heti kun tietokantakerros otetaan
käyttöön näkymissä, deploy tarvitsee ainakin `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` ja `SUPABASE_ANON_KEY`.

## Kirjautumissähköposti on nykyisellään huono — korjattava ennen lanseerausta

Havaittu 2026-09-11 oikeasta viestistä. Neljä erillistä ongelmaa, joista
ensimmäinen on vakavin:

**1. Vastaanottajan sähköposti varoittaa väärennöksestä.** Viesti tulee
osoitteesta `root@auth0.com`, eikä lähettäjää voi vahvistaa. Outlook näytti
punaisen palkin: *"Emme pysty vahvistamaan, että tämä sähköposti on peräisin
sen väitetyltä lähettäjältä."* Kuluttajatuotteessa tämä on paha: kirjautumis-
koodi, jota sähköposti epäilee huijaukseksi, jää avaamatta tai päätyy roskiin.

**2. Teksti on englanniksi.** "Welcome to Reilusoppari!", "Your verification
code is". Sivuston sävy on suomi ja sinuttelu.

**3. Viestissä näkyy tenantin tekninen nimi.** *"You have an account in
dev-qanv0hdzfjjsybgm"* näyttää itsessään kalasteluviestiltä.

**4. Ulkoasu on Auth0:n oletus**, ei Reilusopparin.

### Korjaus, oikeassa järjestyksessä

Järjestys ei jousta: **Auth0 ohittaa muokatut pohjat, kunnes oma
sähköpostipalvelin on konfiguroitu.** Tämä lukee Auth0:n omassa varoituksessa
pohjan muokkausnäkymässä. Templaten kääntäminen ensin olisi hukkaan heitettyä
työtä.

1. **Oma sähköpostipalvelin Auth0:aan.** Auth0:n valmiissa listassa ei ole
   Resendiä, joten valitaan `SMTP`: `smtp.resend.com`, portti 465, käyttäjä
   `resend`, salasanaksi Resendin API-avain, lähettäjäksi
   `noreply@reilusoppari.fi`. Tarkat kentät: `auth0/README.md`.
2. **Resendin domain-vahvistus.** SPF-, DKIM- ja DMARC-tietueet lisätään
   **Vercelin DNS-hallintaan**, koska nimipalvelimet ovat siellä. Tämä on se,
   joka poistaa kohdan 1 varoituksen — ei pelkkä lähettäjäosoitteen vaihto.

   > **Tilanne 2026-09-13 (päivitetty samana päivänä): VALMIS.** DNS toimii,
   > ja Resendin tietueet on lisätty. Todennettu julkisesta resolverista:
   > SPF `send.reilusoppari.fi` → `v=spf1 include:amazonses.com ~all`,
   > DKIM `resend._domainkey.reilusoppari.fi`, ja bounce-MX
   > `send.reilusoppari.fi` → `feedback-smtp.eu-west-1.amazonses.com`
   > (EU-alue, kuten pitääkin).
   >
   > **Puuttuu vielä DMARC.** `_dmarc.reilusoppari.fi` on tyhjä. SPF ja DKIM
   > kertovat että viesti on aito; DMARC kertoo vastaanottajalle mitä tehdä
   > kun ne eivät täsmää. Tietue ja perustelu: `auth0/README.md`.
3. **Pohja suomeksi:** Branding → Email Templates → Verification Code.
   Valmis pohja on repossa: `auth0/kirjautumiskoodi.liquid`. Se käyttää
   `{{ application.name }}`-muuttujaa, joten sama pohja kelpaa kaikille
   tenantin sovelluksille, ja alatunnisteen yhtiö valitaan sen mukaan.
4. **Tenantin Friendly Name.** Se näkyy viestissä (kohta 3). ⚠️ Sama tenant
   palvelee eSinettiä, PPR:ää ja SKOGia, joten nimeksi EI sovi "Reilusoppari"
   vaan jokin neutraali, esim. `Adepta`.

Huom kohta 4: yhteinen tenant tarkoittaa myös yhteistä sähköpostipohjaa. Jos
viestin on oltava Reilusopparin näköinen ja eSinetin viestin eSinetin
näköinen, se vaatii joko tenantin jakamisen tai pohjan, joka käyttää
`{{ application.name }}`-muuttujaa kaikkialla missä nyt on tenantin nimi.

### Yhtiöjako muuttaa tämän painavammaksi (2026-09-13)

Reilusoppari on nyt **Adepta Tilat Oy:n** (2145627-7) tuote ja eSinetti
**Adepta Oy:n** (2237131-2). Yhteinen Auth0-tenant tarkoittaa siis, että
toisen yhtiön tunnistuspalvelu hoitaa toisen yhtiön asiakkaiden
kirjautumisen.

Kaksi seurausta, jotka eivät ole muotoseikkoja:

**1. Sähköpostipalvelin on tenant-laajuinen.** Jos lähettäjäksi asetetaan
`noreply@reilusoppari.fi`, myös eSinetin, PPR:n ja SKOGin kirjautumiskoodit
lähtevät Adepta Tilat Oy:n domainista. Toisin päin sama ongelma. Kierto:
vahvista Resendissä useampi domain ja käytä lähettäjäkentässä Liquidia
(`{{ application.name }}`) — **tämä on testattava**, sillä Auth0:n
dokumentaatio lupaa muuttujat mutta ei ehtolauseita.

**2. Tietosuoja.** Kun Adepta Oy:n tenant käsittelee Adepta Tilat Oy:n
käyttäjien sähköpostiosoitteita ja kirjautumistapahtumia, se on
henkilötietojen käsittelijä — eri oikeushenkilönä, eli GDPR 28 art. vaatii
kirjallisen sopimuksen. Sama koskee eSinettiä allekirjoituksissa
(`reilusoppari-web/BLOCKERS.md`).

**Päätettävä ennen EU-siirtoa:** yksi tenant vai kaksi. Siirto on jo päätetty
tehtäväksi, ja se on luonteva hetki jakaa tenantit, jos ne jaetaan. Toinen
tenant maksaa 35 $/kk — se on hinta siitä, ettei kahden yhtiön
käyttäjähallinta ole samassa laatikossa.

## Auth0: siirto EU-tenanttiin — PÄÄTETTY 2026-09-11, ajankohta avoin

Jukan päätös: kaikki viisi sovellusta siirretään uuteen EU-alueen tenanttiin
jossain vaiheessa ennen lanseerausta. Silloin tenantteja on edelleen yksi ja
ilmaistaso riittää (toinen tenant maksaisi 35 $/kk).

Siirto koskee neljää projektia: `reilusoppari`, `esinetti`, Adepta PPR ja
Adepta SKOG.

### Kaksi asiaa, jotka ratkaisevat onnistuuko siirto

**1. Ilmaistasolla vanhaa ja uutta ei voi ajaa rinnakkain.** Yksi tenant per
tili tarkoittaa, että vanha on poistettava ennen uuden luontia — eli kaikkien
neljän projektin kirjautuminen on poikki siirron ajan, eikä paluuta ole.

Vaihtoehto, joka poistaa koko riskin: **maksa Essentials yhdeltä kuukaudelta
(35 $).** Silloin molemmat tenantit ovat olemassa yhtä aikaa, siirron voi tehdä
sovellus kerrallaan, testata, ja peruuttaa jos jokin menee pieleen. Kuukauden
jälkeen vanha poistetaan ja palataan ilmaistasolle.

35 dollaria on halpa hinta siitä, että neljän tuotantojärjestelmän
kirjautuminen ei ole kerralla poikki ilman paluutietä.

**2. `auth0_sub` muuttuu, ja tietokannat viittaavat siihen.** Uudessa
tenantissa käyttäjät saavat uudet tunnisteet. Nämä rivit orpoutuvat:

- `rs_users.auth0_sub` (Reilusoppari)
- `sin_tenant_users.auth0_sub` (eSinetti)
- vastaavat PPR:ssä ja SKOGissa

Ne on kartoitettava uudelleen **sähköpostiosoitteen perusteella** siirron
yhteydessä. Ilman tätä kirjautuminen onnistuu mutta käyttäjä näyttää uudelta:
eSinetissä hän menettäisi pääsyn omaan tenanttiinsa ja Reilusopparissa omiin
vuokrasuhteisiinsa.

### Muu tehtävälista siirrossa

- Jokaiselle sovellukselle uudet `AUTH0_DOMAIN`, `CLIENT_ID`, `CLIENT_SECRET`
  → päivitettävä neljän projektin Vercel-ympäristömuuttujiin ja `.env.local`eihin
- Callback-, logout- ja web origin -osoitteet uudelleen jokaiselle sovellukselle
- Authentication Profile → **Identifier First** (muuten Reilusopparin
  passwordless ei toimi, ks. DECISIONS.md)
- Passwordless Email päälle Reilusopparille, tietokantayhteys siltä pois
- Salasanakäyttäjien siirto: Auth0:n vienti ei sisällä salasanatiivisteitä
  ilman erillistä pyyntöä. Käytännössä eSinetin, PPR:n ja SKOGin käyttäjät
  joko asettavat salasanan uudelleen, tai heidätkin siirretään passwordlessiin.

### Milloin

Ennen lanseerausta. Luonteva hetki on **ennen kuin Reilusopparilla on oikeita
käyttäjiä** — jokainen uusi tili kasvattaa kartoitustyötä kohdassa 2.

## eSinetissä ei ole reittiä pohjien listaamiseen (2026-09-11)

`POST /documents/render` ottaa vastaan `template_id`:n (uuid), mutta eSinetin
API:ssa ei ole `GET /templates`-reittiä. Reilusoppari tuntee pohjat nimellä
(`vuokrasopimus_asuinhuoneisto`), joten yhdistämistä ei voi tehdä ajossa.

Kierto toistaiseksi: `npm run templates:push` tulostaa kartan avain → uuid, ja
se asetetaan ympäristömuuttujaan `ESINETTI_TEMPLATE_IDS`
(`src/lib/esinetti/template-ids.ts`).

Tämä toimii mutta on hauras: pohjan uudelleenluonti eSinetissä vaihtaa uuid:n,
ja muuttuja jää vanhaksi ilman että mikään kertoo siitä. Kunnollinen korjaus on
lisätä eSinettiin `GET /v1/templates`, jolloin tämä tiedosto poistuu. Kirjattu
myös `esinetti/BLOCKERS.md`:hen.

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


## Tuotanto pystyssä 2026-09-11

`app.reilusoppari.fi` on julkaistu ja todennettu läpi koko ketjun: kirjautuminen,
tietokanta, kutsulinkit, PDF:n tuottaminen ja PWA-asennus kotivalikkoon.
Ympäristömuuttujat ovat Vercelissä ja Auth0 sallii tuotanto-osoitteen.

### Korjattu samalla

Sopimuksen esikatselu kaatui tuotannossa mutta toimi paikallisesti: pdfkitin
vakiofontit puuttuivat funktiopaketista, koska Next.js ei näe niiden
dynaamista latausta. CI tarkistaa tämän nyt jokaisella käännöksellä.

### Auth0:n ilme

Tehty: tenantin nimi, kieli suomeksi, logo ja värit kirjautumissivulla.
`dev-qanv0hdzfjjsybgm` ei enää näy käyttäjälle.

**Jäljellä: kirjautumissähköposti.** Se on edelleen englanniksi ja tulee
osoitteesta `root@auth0.com`. Auth0 sallii sähköpostipohjien muokkaamisen
vasta, kun tenantille on määritetty oma sähköpostipalvelu — käytännössä
Resend, jonka domain on todennettava. Tämä on tehtävä ennen lanseerausta,
koska kirjautumissähköposti on ensimmäinen asia jonka vuokralainen saa.
Ks. myös EU-siirron muistilista yllä.


---

## Vahva tunnistautuminen ilman allekirjoituskierrosta (2026-09-12)

**Estää:** vaiheen 6 viimeisen askeleen — uuden vuokranantajan pääsyn
todistuskeskusteluun (CLAUDE.md 5.10).

eSinetin rajapinnassa vahva tunnistautuminen tapahtuu allekirjoituskierroksen
osana (`authLevel: "strong"`). Erillistä tunnistuspäätepistettä ei ole, eikä
todistuskeskustelussa ole mitään allekirjoitettavaa.

Reilusopparin puoli on valmis: sääntö on `certificates/contact.ts`:ssä,
testattu, ja kysyjä pysähtyy `identity_verified_at`-tarkistukseen. Sivu kertoo
tunnistautumisen puuttuvan eikä avaa keskustelua.

**Mitä eSinetiltä tarvitaan:** päätepiste, joka tunnistaa henkilön ja
palauttaa nimen ja syntymäajan ilman asiakirjaa — esimerkiksi
`POST /identifications`, joka palauttaa tunnistautumislinkin ja webhookin
valmistuttuaan. Ei henkilötunnusta (CLAUDE.md kohta 6).

Sen valmistuttua tarvitaan Reilusopparissa vain linkki tunnistautumiseen
`todistus/[token]/kysy`-sivulle ja `identity_verified_at`:in kirjaus
webhookista — sama kohta, jossa se jo kirjataan allekirjoituksen yhteydessä.
