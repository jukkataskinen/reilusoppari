# Reilusoppari omaan Auth0-tenanttiin

> **Tila 2026-09-14: VALMIS.** Kaikki vaiheet tehty ja todennettu: kirjautuminen
> toimii paikallisesti ja tuotannossa uudessa tenantissa
> `reilusoppari.eu.auth0.com`, eSinetin kirjautumissivulla lukee "Adepta",
> DMARC lisätty, e2e 32/32 läpi.

Tämä on ajo-ohje, ei taustapaperi. Perustelut ovat `BLOCKERS.md`:ssä.

**Lopputulos:** Reilusopparilla on oma EU-alueen tenantti. eSinetti, Adepta
PPR ja SKOG jäävät nykyiseen tenanttiin, joka nimetään Adeptaksi. Kummankin
yhtiön kirjautuminen on omassa laatikossaan.

**Kesto:** noin tunti, josta suurin osa on odottelua. Skripti hoitaa asetukset.

**Ei siirrä käyttäjiä.** Reilusopparissa on 68 käyttäjää, joista 66 on
testidataa ja 2 Jukan omia. Ne syntyvät uudelleen ensimmäisellä
kirjautumisella. Tämä on syy tehdä siirto **nyt eikä lanseerauksen jälkeen**.

---

## Ennen kuin aloitat

Ota talteen nykyiset arvot, jotta paluu on mahdollinen:

```bash
grep AUTH0 .env.local
```

Kopioi tuloste johonkin. Jos jokin menee pieleen, nämä rivit palauttavat
vanhan tilanteen.

---

## 1. Uusi tili ja tenantti

**Reilusoppari tarvitsee oman Auth0-tilin, ei vain omaa tenanttia.**
Ilmaistasolle mahtuu yksi tenantti per tili, ja maksullinen taso on kallis
(2026-09-14: 5 000 käyttäjää = 350 $/kk, ks. `reilusoppari-web/KUSTANNUKSET.md`).
Toinen tili saa oman ilmaistasonsa: 1 tenantti ja 25 000 käyttäjää, 0 €.

Se vastaa myös yhtiörakennetta — Reilusoppari on Adepta Tilat Oy:n tuote.
Tili luotiin osoitteella `info@adeptatilat.fi`.

Kirjaudu **yksityisessä selainikkunassa**, jotta vanhan tilin istunto pysyy
auki toisessa ikkunassa.

### Kolme ansaa, jotka maksoivat kolme yritystä (2026-09-14)

**1. Rekisteröityminen luo tenantin itse.** Auth0 tekee ensimmäisen tenantin
automaattisesti kysymättä: nimeksi tulee `dev-3tmsn0x6ccc7awwc` ja alueeksi
**US**. Kumpaakaan ei voi muuttaa jälkikäteen.

**2. Uutta ei voi luoda ennen kuin vanha on poistettu.** Ilmaistason raja on
yksi tenantti, joten järjestys on pakotettu: **poista ensin, luo sitten.**
Poisto on Tenant Settings → **Advanced** → alalaita, ei Generalissa.

**3. Create tenant -dialogissa nimikenttä on ylimpänä, ruudun ulkopuolella.**
Pienellä näytöllä näkyvät vain Environment Tag ja Region. Jos nimikenttää ei
täytä, Auth0 generoi taas `dev-`-alkuisen nimen — ja se näkyy käyttäjälle
kirjautumisosoitteessa. **Vieritä dialogia ylöspäin.**

### Luonti

Vasemmalta ylhäältä tenantin nimi → **Create tenant**

| Kenttä | Arvo |
|---|---|
| Tenant Domain | `reilusoppari` (siitä tulee `reilusoppari.eu.auth0.com`) |
| Region | **Europe** |
| Environment | Production, tai Development jos Production on estetty |

> **Nimi ja alue ovat pysyviä.** Kumpaakaan ei voi muuttaa jälkikäteen.
> Environment Tagin voi vaihtaa myöhemmin.

Tarkista lopuksi Tenant Settings → General: pitää lukea `reilusoppari` ja
`EU-2`. Osoiterivillä pitää lukea `/dashboard/eu/reilusoppari/`.

**Älä syötä laskutustietoja.** Uudella tilillä on 22 päivän kokeilujakso
maksullisiin ominaisuuksiin. Sen päätyttyä tili putoaa ilmaistasolle
itsestään, ja juuri sitä halutaan.

---

## 2. Vanha tenantti uudelleen nimetään

Vaihda vanhaan tenanttiin ja käy **Settings → General**:

| Kenttä | Arvo |
|---|---|
| Friendly Name | `Adepta` |
| Logo URL | tyhjennä tai vaihda neutraaliksi |

Tämä poistaa sen, mikä näkyi eSinetin kirjautumissivulla: *"Syötä
Reilusoppari-salasanasi jatkaaksesi kohteeseen eSinetti"*.

Halutessasi voit antaa kullekin sovellukselle oman logon:
**Applications → (sovellus) → Settings → Application Logo**. Uusi Universal
Login käyttää sitä ja turvautuu tenantin logoon vain, jos omaa ei ole.

---

## 3. Asetusskriptin tunnukset

Palaa **uuteen** tenanttiin. Applications → **Create Application**:

| Kenttä | Arvo |
|---|---|
| Name | `Asetusskripti` |
| Type | **Machine to Machine** |
| API | **Auth0 Management API** |

Oikeuksiksi (scopes) nämä:

```
read:clients              create:clients          update:clients
read:connections          update:connections
read:connections_options  update:connections_options
read:tenant_settings      update:tenant_settings
read:prompts              update:prompts
read:email_provider       create:email_provider   update:email_provider
```

> `update:connections_options` on erillinen oikeus, eikä `update:connections`
> riitä sen tilalle. Ilman sitä skripti tekee kaiken muun ja kaatuu vasta
> viimeiseen vaiheeseen virheellä *"Updating the options property requires the
> update:connections_options scope"*. Todennettu 2026-09-14.

> Anna vain nämä. "Select All" antaisi skriptille oikeuden poistaa käyttäjiä
> ja sovelluksia — oikeuksia, joita se ei käytä eikä tarvitse.

Kopioi sitten **Settings**-välilehdeltä Domain, Client ID ja Client Secret
tiedostoon `.env.local`:

```
AUTH0_MGMT_DOMAIN=reilusoppari.eu.auth0.com
AUTH0_MGMT_CLIENT_ID=...
AUTH0_MGMT_CLIENT_SECRET=...
```

`.env.local` on gitignoressa. Älä liitä näitä arvoja mihinkään muualle.

---

## 4. Passwordless-yhteys päälle

Uudessa tenantissa: **Authentication → Passwordless → Email** → kytke päälle.

Asetuksia ei tarvitse säätää — skripti kirjoittaa lähettäjän, otsikon ja
pohjan. Yhteys pitää silti luoda käsin, koska Auth0 on esittänyt sen
asetukset kahdessa eri rakenteessa eri aikoina. Skripti lukee olemassa olevan
rakenteen ja kirjoittaa siihen; arvaaminen tuottaisi hiljaa väärän asetuksen.

---

## 5. Resendin avain

Sama avain kuin ennen, tai uusi:

```
RESEND_API_KEY=re_...
```

`.env.local`:iin. Skripti asettaa sen Auth0:n SMTP-salasanaksi eikä tulosta
sitä.

---

## 6. Kuivaharjoitus

```bash
npm run auth0:asetukset
```

Skripti ei kirjoita mitään. Se tulostaa tenantin nimen, sovellusten määrän ja
listan siitä, mitä se muuttaisi.

**Lue tuloste ennen kuin jatkat.** Erityisesti ensimmäinen rivi: siinä lukee,
mihin tenanttiin ollaan menossa.

Jos tenantissa on muiden projektien sovelluksia, skripti pysähtyy ja näyttää
nimet. Silloin `AUTH0_MGMT_DOMAIN` osoittaa vanhaan tenanttiin. Korjaa se
äläkä käytä `--pakota`.

---

## 7. Ajo

```bash
npm run auth0:asetukset -- --aja
```

Skripti tekee kuusi asiaa:

1. Tenantin nimeksi Reilusoppari, kieleksi suomi
2. Authentication Profile → **Identifier First**
3. Sovellus `Reilusoppari` paluuosoitteineen
4. Sähköpostipalvelimeksi Resendin SMTP, lähettäjäksi `noreply@reilusoppari.fi`
5. Passwordless-yhteyteen lähettäjä, otsikko ja suomenkielinen pohja
6. Salasanayhteys pois sovellukselta

`AUTH0_DOMAIN`, `AUTH0_CLIENT_ID` ja `AUTH0_CLIENT_SECRET` kirjoitetaan
suoraan `.env.local`:iin. Arvoja ei tulosteta ruudulle.

> Kohta 2 on se, joka unohtuu käsin tehdessä. Ilman Identifier Firstiä Auth0
> pudottaa `connection: "email"` -parametrin **hiljaa** ja näyttää
> salasanalomakkeen, vaikka salasanoja ei ole olemassa. Se ei kaada mitään
> eikä näy lokista.

---

## 8. Testaus paikallisesti

```bash
npm run dev
```

Avaa `http://localhost:3000` ja kirjaudu.

Tarkista neljä asiaa:

- [ ] Kirjautumissivu kysyy **sähköpostia, ei salasanaa**
- [ ] Koodi tulee perille
- [ ] Viesti on **suomeksi** ja lähettäjä `noreply@reilusoppari.fi`
- [ ] Outlookissa **ei punaista palkkia**

Jos näkyy salasanakenttä, kohta 2 ei mennyt läpi. Aja skripti uudelleen.

Aja sitten koko testisarja:

```bash
npm test
npm run test:e2e
```

---

## 9. Vercel

**Vercel → reilusoppari → Settings → Environment Variables.** Päivitä kolme:

- `AUTH0_DOMAIN`
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`

Arvot ovat `.env.local`:issa. `AUTH0_SECRET` ja `APP_BASE_URL` pysyvät
ennallaan.

**Uudelleenkäynnistä** (Deployments → viimeisin → Redeploy). Ympäristömuuttujat
luetaan käynnistyksessä, joten pelkkä tallennus ei riitä.

---

## 10. Lopuksi

- [ ] Kirjaudu `app.reilusoppari.fi`:hin ja tarkista että toimii
- [ ] Kirjaudu **eSinettiin** ja tarkista että sekin toimii — vanha tenantti
      ei saanut muuttua
- [ ] ~~Merkitse 35 $/kk~~ — ei maksua: oma tili ilmaistasolla (`reilusoppari-web/KUSTANNUKSET.md`)
- [ ] Vanhan tenantin passwordless-yhteydessä lähettäjä on yhä `noreply@reilusoppari.fi` ja pohjassa Reilusoppari-ehtolause. Vaihda lähettäjä neutraaliksi, kun eSinetille on oma lähetysdomain
- [ ] Lisää DMARC, jos ei ole vielä (`auth0/README.md`)

---

## Jos menee pieleen

Palauta `.env.local`:iin kohdassa "Ennen kuin aloitat" talteen ottamasi
Auth0-rivit, palauta samat Verceliin ja käynnistä uudelleen. Vanha tenantti on
koskematon, joten paluu toimii.

Uuden tenantin voi poistaa ja aloittaa alusta: siellä ei ole mitään
menetettävää ennen kuin ensimmäinen oikea käyttäjä kirjautuu.
