# Asiakirjapohjat

Pohjien HTML ja schema ylläpidetään täällä ja viedään eSinettiin skriptillä
`npm run templates:push`. eSinetti renderöi ne PDF:ksi WeasyPrintillä
(`POST /documents/render`).

Juridinen sisältö on Jukan vastuulla. Tämä tiedosto koskee ulkoasua ja kieltä.

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

Kuva on upotettava base64:nä (`assets`-kenttä), koska eSinetin renderöijä ei
hae ulkoisia resursseja lainkaan.

**3. Puuttuva suositus ei saa jättää aukkoa.**
Luonnoksessa "Vuokranantajan tervehdys" on näkyvä paneeli. Kun suositusta ei
anneta, **koko paneelin on kadottava jäljettömiin** — ei tyhjää laatikkoa,
ei mainintaa, ei eri asettelua (`DECISIONS.md` 2026-09-10: tämä on päätöksen
ydin). Taitto on siis rakennettava niin, että sivu näyttää valmiilta myös
ilman sitä.

**4. Käsinkirjoitusfontti maksaa painoa.**
Korostusrivi vaatii toisen fontin, joka on upotettava jokaiseen PDF:ään.
Vaihtoehto on tehdä sama korostus Plus Jakarta Sansin kursiivilla — halvempi
ja lähes yhtä lämmin. Päätettävä ennen ensimmäistä pohjaa.

**5. QR-koodi generoidaan itse.**
Ulkoista QR-palvelua ei voi käyttää (renderöijä ei hae ulkoisia
resursseja eikä todistuksen tunnistetta saa lähettää kolmannelle).
QR generoidaan Reilusopparissa ja välitetään `assets`-kentässä PNG:nä.

---

## Typografia ja mitat

| | |
|---|---|
| Fontti | Plus Jakarta Sans, sama kuin sovelluksessa ja sivustolla; upotettava |
| Otsikko | 34–40 pt, `--color-ink`, normaali kirjainväli |
| Alaotsikko | 13 pt, `--color-ink` 70 % |
| Leipäteksti | 10–11 pt, riviväli 1,5 |
| Kentän otsikko | 8 pt, harmaa, ei versaaleja |
| Marginaali | 18 mm, ylätunnisteelle ja alatunnisteelle omat |
| Paneelin pyöristys | 12 pt, tausta vaalea sininen |
| Kuvakkeet | Ohutviivaiset, 1,5 pt, ei täyttöä |

---

## Pohjat

| Avain | Tila |
|---|---|
| `vuokrasopimus_asuinhuoneisto` | kirjoittamatta |
| `alkukatselmus` | kirjoittamatta |
| `loppukatselmus` | kirjoittamatta |
| `vuokratodistus_vuokralainen` | kirjoittamatta |
| `vuokratodistus_vuokranantaja` | kirjoittamatta |
| `verolaskelma` | kirjoittamatta |
