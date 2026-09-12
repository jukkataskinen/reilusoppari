# Asiakirjat

Reilusoppari tekee PDF:nsä itse (React-PDF). eSinetti vain kerää
allekirjoitukset ja sinetöi — se ei tiedä näistä asiakirjoista mitään.
Ks. `DECISIONS.md` 2026-09-11.

Juridinen sisältö on Jukan vastuulla. Tämä tiedosto koskee ulkoasua ja kieltä.

## Tiedostot

| | |
|---|---|
| `theme.ts` | Värit, pistekoot, välit. Ei korallinpunaista asiakirjoissa. |
| `fonts.ts` | Plus Jakarta Sans 400 / 600 / 700, upotettuna |
| `fonts/*.ttf` | Staattiset leikkaukset. Muunnettu `@fontsource`-paketista; React-PDF ei lue woff2:ta eikä muuttuvia fontteja. |
| `render.ts` | `renderDocumentPdf()` — PDF + SHA-256, deterministinen |
| `components.tsx` | `DocumentRoot`, ylä- ja alatunniste, avaintiedot, ehtolista, allekirjoitukset |
| `decorations.tsx` | Taustamuodot kaikkiin, vinjetti vain sopimukseen ja todistuksiin |
| `RentalAgreement.tsx` | Vuokrasopimus |
| `InspectionProtocol.tsx` | Alku- ja loppukatselmus |
| `TenancyCertificate.tsx` | Vuokratodistus molemmille rooleille |
| `qr.tsx` | QR-koodi vektorina, ei ulkoista palvelua |

## Esimerkit

    npm run samples                                    → esimerkit/*.pdf
    node scripts/pdf-to-png.mjs esimerkit/x.pdf sivu   → sivu-1.png, sivu-2.png …

Toinen komento on olennainen: asiakirjan ulkoasua ei voi arvioida lukematta
sitä, eikä PDF:ää näe päätteestä.

**Markkinointisivusto näyttää näitä samoja asiakirjoja.** `reilusoppari-web`
esittää vuokrasopimuksen, alkukatselmuksen ja vuokratodistuksen ensimmäiset
sivut PNG-kuvina (`public/asiakirjat/`), jottei sivustolle synny toista
versiota samasta asiakirjasta. **Kun muutat pohjaa, päivitä myös ne:**

    npm run samples
    node scripts/pdf-to-png.mjs esimerkit/vuokrasopimus.pdf sivu
    # kopioi sivu-1.png → reilusoppari-web/public/asiakirjat/vuokrasopimus.png

Sama `alkukatselmus.pdf` → `alkukatselmus.png` ja `vuokratodistus.pdf` →
`vuokratodistus.png`. Jos tämä unohtuu, sivusto näyttää vanhaa asiakirjaa
eikä kukaan huomaa sitä ennen kuin asiakas huomaa.

---

## Lähtökohta: ei viranomaispaperia

Jukan linjaus 2026-09-11 (`DECISIONS.md`): *"kaikkien dokumenttien pitää olla
niin sanotusti mukavia: niiden ei siis tule näyttää viranomaisdokumenteilta
vaikka asiaa ovatkin."*

Jukan luonnos vuokrasopimuksesta ja vuokrasuhdetodistuksesta on tämän
hakemiston ulkoasun perusta. Alla on siitä luettu rakenne, jotta pohjat
voidaan kirjoittaa ilman että kuvaa tarvitsee katsoa rinnalla.

**Mikä ei jousta:** asiakirjan on oltava todistusvoimainen. Kaikki
juridisesti tarpeellinen sisältö, päiväykset, tiivisteet ja
allekirjoitustiedot ovat mukana. "Mukava" koskee ulkoasua ja kieltä, ei
sisältöä.

---

## Sivun rakenne

Sama runko kaikissa pohjissa, ylhäältä alas:

1. **Ylätunniste.** Vasemmalla merkki ja sanamerkki *Reilusoppari*.
   Oikealla tunnuslause pienellä: *Sopikaa. Kuvatkaa. Kuitatkaa.*
2. **Otsikko.** Iso, ilmava, tummansininen. Ei versaaleja, ei
   dokumenttinumeroa. Pelkkä *Vuokrasopimus*.
3. **Alaotsikko yhtenä lauseena, ihmisen kielellä.** Kertoo mikä asiakirja
   on, ei mitä laki siitä sanoo: *"Tämä on sopimus kodista, jonka
   vuokralainen ja vuokranantaja ovat sopineet yhdessä."*
4. **Avaintiedot pehmeäsävyisessä paneelissa.** Kaksi saraketta, jokaisella
   rivillä ohutviivainen kuvake, pieni harmaa otsikko ja arvo:
   Koti · Vuokrasuhde alkaa · Vuokralainen · Vuokra · Vuokranantaja.
5. **Sisältö.** Sopimusehdot numeroituna, kaksi saraketta, jokaisella
   lyhyt lihavoitu otsikko ja 1–2 lauseen selitys. Ei pykäliä, ei
   alaviitteitä.
6. **Lämmin loppusana** omassa paneelissaan sydänkuvakkeella:
   *"Kiitos, että olette sopineet tästä yhdessä."*
7. **Allekirjoitukset.** Paikka ja aika vasemmalla, sitten kumpikin
   osapuoli. Viiva ja nimi sen alla.
8. **Alatunniste.** Merkki ja *Reilua asumista. Yhdessä.*

Vuokrasuhdetodistus käyttää samaa runkoa mutta korvaa kohdat 4–6:

- Todistettava tieto **korostettuina kenttinä** (täytetty vaalea palkki,
  ei viivaa jonka päälle kirjoitetaan)
- **Käsinkirjoitusta muistuttava korostusrivi** yhteenvetona:
  *"3 vuotta yhdessä sovittua arkea."*
- **Tilastopaneeli** kolmessa sarakkeessa kuvakkeineen: Vuokrasuhde ·
  Maksut (*Vuokrat kuitattu ajallaan 36 / 36*) · Vakuus
- **Vuokranantajan tervehdys** lainauksena omassa paneelissaan
- **Vahvistuslista** rastituksineen ja **QR-koodi**, jonka alla
  `reilusoppari.fi/todistus/…`

---

## Viisi asiaa, jotka on ratkaistava ennen kuin pohjia kirjoitetaan

**1. Väri: dokumentit ovat sinisiä, eivät korallinpunaisia.**
Sovelluksen paletissa on `--color-coral` (#FF6F59). Luonnoksessa sitä ei ole,
ja se on oikein: korallinpunainen luetaan asiakirjassa varoitukseksi.
Asiakirjoissa käytetään vain sinisen sävyjä ja tummaa `--color-ink`iä.
Korallinpunaista käytetään vain, jos jokin pitää oikeasti merkitä
huomioitavaksi — ei koristeena.

**2. Koristekuva kuuluu vain sopimukseen, ei pöytäkirjaan.**
Luonnoksen sopimussivulla on pyöreäksi rajattu sisustuskuva. Se on lämmin
ja toimii — mutta **katselmuspöytäkirjassa kuva on todiste**. Koristekuva
samalla sivulla tekisi rajasta epäselvän. Sääntö: koristekuvia vain
vuokrasopimuksessa ja todistuksissa, ei kummassakaan katselmus-
pöytäkirjassa.

**3. Puuttuva suositus ei saa jättää aukkoa.**
Luonnoksessa "Vuokranantajan tervehdys" on näkyvä paneeli. Kun suositusta ei
anneta, **koko paneelin on kadottava jäljettömiin** — ei tyhjää laatikkoa,
ei mainintaa, ei eri asettelua (`DECISIONS.md` 2026-09-10: tämä on päätöksen
ydin). Taitto on siis rakennettava niin, että sivu näyttää valmiilta myös
ilman sitä.

**4. Käsinkirjoitusfontti maksaa painoa.**
Korostusrivi vaatii neljännen fonttitiedoston jokaiseen PDF:ään. Vaihtoehto
on tehdä sama korostus Plus Jakarta Sansin kevyemmällä leikkauksella —
halvempi ja lähes yhtä lämmin. Avoin, päätetään ensimmäisen asiakirjan
yhteydessä.

**5. QR-koodi generoidaan itse.**
Todistuksen tunnistetta ei lähetetä kolmannelle osapuolelle, joten ulkoista
QR-palvelua ei käytetä. QR piirretään Reilusopparissa.

---

## Typografia ja mitat

| | |
|---|---|
| Fontti | Plus Jakarta Sans 400 / 600 / 700, upotettuna (`fonts.ts`) |
| Otsikko | 34–40 pt, `--color-ink`, normaali kirjainväli |
| Alaotsikko | 13 pt, `--color-ink` 70 % |
| Leipäteksti | 10–11 pt, riviväli 1,5 |
| Kentän otsikko | 8 pt, harmaa, ei versaaleja |
| Marginaali | 18 mm, ylätunnisteelle ja alatunnisteelle omat |
| Paneelin pyöristys | 12 pt, tausta vaalea sininen |
| Kuvakkeet | Ohutviivaiset, 1,5 pt, ei täyttöä |

---

## Asiakirjat

| Asiakirja | Reitti eSinettiin | Tila |
|---|---|---|
| Vuokrasopimus | allekirjoituskierros | **valmis**, juridinen sisältö Jukan tarkistettavana |
| Alkukatselmus | allekirjoituskierros | **valmis** |
| Loppukatselmus | allekirjoituskierros | **valmis** (sama komponentti, `kind: "final"`) |
| Vuokratodistus, vuokralainen | kierros tai sinetöinti¹ | **valmis** |
| Vuokratodistus, vuokranantaja | kierros tai sinetöinti¹ | **valmis** (sama komponentti, `for: "landlord"`) |
| Verolaskelma | sinetöinti | kirjoittamatta |

¹ Optimitilanteessa todistus allekirjoitetaan — vuokralainen esimerkiksi
kuittaa saaneensa vakuutensa takaisin. Riitaisaa loppuraporttia ei kuittaa
kukaan, joten se sinetöidään ilman allekirjoituksia. Kumpikin löytyy
jälkeenpäin `GET /verify`-haulla tiivisteellä. (Jukan tarkennus 2026-09-11.)

## Determinismi

`renderDocumentPdf` asettaa PDF:n aikaleimat kutsujan antamasta päiväyksestä.
Se ei ole sopimus vaan rakenne: kutsuja ei voi unohtaa sitä. Syy on se, että
asiakirjan SHA-256 päätyy pöytäkirjaan, webhookiin ja todistukseen — jos sama
sisältö tuottaisi eri tavut joka ajolla, tiiviste ei tarkoittaisi mitään.


## Tiedossa oleva rajoite: kuvien saavutettavuus

Katselmuspöytäkirjan todistusaineisto on kuvia, eikä React-PDF tuota tagattua
PDF:ää — kuville ei siis voi antaa vaihtoehtoista tekstiä. Näkövammainen
osapuoli ei pääse kuviin käsiksi ruudunlukijalla.

Lieventävänä tekijänä kaikki kuvan ympärillä oleva on tekstiä: kohdan nimi,
huone, kuvaaja, palvelimen vastaanottoaika, tiiviste ja kuvaajan huomautus.
Pöytäkirjasta saa siis selville mitä on kuvattu, kuka kuvasi ja milloin,
vaikka itse kuvaa ei näkisi.

Tämä ei ole ratkaisu vaan rajoite. Jos se osoittautuu ongelmaksi, oikea
korjaus on vaatia huomautus jokaiseen kuvaan — silloin jokaisella kuvalla on
sanallinen kuvaus. Se on tuotepäätös, ei tekninen.
