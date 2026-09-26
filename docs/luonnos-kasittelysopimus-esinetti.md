# LUONNOS — Henkilötietojen käsittelysopimus

**Adepta Tilat Oy (Reilusoppari) ja Adepta Oy (eSinetti)**

**Tila:** luonnos Jukan tarkistettavaksi, 2026-09-26. Ei allekirjoitettu.
Pohja on kirjoitettu EU:n yleisen tietosuoja-asetuksen (2016/679) 28
artiklan 3 kohdan vähimmäissisällön mukaan ja täytetty sillä, mitä
Reilusopparin koodista näkyy. Hakasulkeissa `[...]` olevat kohdat vaativat
tiedon, jota koodista ei näe. Harkitse juristin kertaluonteista tarkistusta,
kuten sopimuspohjissakin (CLAUDE.md kohta 9).

Miksi sopimus tarvitaan, vaikka molemmat yhtiöt ovat Jukan: yhtiöt ovat eri
oikeushenkilöitä, ja eSinetti käsittelee Reilusopparin käyttäjien tietoja
Adepta Tilat Oy:n lukuun (BLOCKERS.md, yhtiöjako 2026-09-13). Auth0 ei enää
kuulu tähän: Reilusopparilla on oma tenant 2026-09-14 alkaen.

---

## 1. Osapuolet

**Rekisterinpitäjä:** Adepta Tilat Oy, y-tunnus 2145627-7, [osoite]
("Rekisterinpitäjä"). Palvelu: Reilusoppari (`app.reilusoppari.fi`).

**Käsittelijä:** Adepta Oy, y-tunnus 2237131-2, [osoite] ("Käsittelijä").
Palvelu: eSinetti (`esinetti.fi`), tenant `reilusoppari`.

## 2. Sopimuksen tarkoitus ja suhde pääsopimukseen

Tämä sopimus koskee henkilötietoja, joita Käsittelijä käsittelee
Rekisterinpitäjän lukuun tuottaessaan eSinetti-palvelua
[palvelusopimuksen tai tilauksen nimi ja päiväys]. Jos tämä sopimus ja
pääsopimus ovat ristiriidassa henkilötietojen käsittelyssä, noudatetaan tätä
sopimusta.

## 3. Käsittelyn kohde, luonne ja tarkoitus

Käsittelijä:

1. kerää sähköiset allekirjoitukset Rekisterinpitäjän toimittamiin
   asiakirjoihin (vuokrasopimus, alku- ja loppukatselmuksen pöytäkirja)
2. tunnistaa allekirjoittajat vahvasti (pankkitunnukset, mobiilivarmenne)
3. sinetöi asiakirjat, joita ei allekirjoiteta (vuokratodistukset,
   verolaskelma)
4. säilyttää allekirjoitetut ja sinetöidyt asiakirjat sovitun ajan ja
   toimittaa ne Rekisterinpitäjälle
5. tarjoaa asiakirjan aitouden tarkistuksen tiivisteellä
6. lähettää allekirjoittajille allekirjoituskutsut ja muistutukset
   sähköpostilla [ja tekstiviestillä, jos käytössä]
7. ilmoittaa Rekisterinpitäjälle kierroksen tilasta (webhook).

Käsittelijä ei laadi asiakirjoja eikä muuta niiden sisältöä.
Rekisterinpitäjä tekee asiakirjat itse, ja Käsittelijä vastaanottaa ne
valmiina PDF-tiedostoina.

## 4. Henkilötietojen tyypit

- allekirjoittajan nimi, sähköpostiosoite ja [puhelinnumero, jos annettu]
- vahvan tunnistautumisen tulos: nimi, syntymäaika, tunnistustapa,
  tunnistuspalvelun tapahtumatunniste. [Tarkista: käsitteleekö eSinetti
  tunnistuksessa henkilötunnusta, ja säilytetäänkö se. Rekisterinpitäjä ei
  vastaanota henkilötunnusta tunnistuksen tuloksena.]
- asiakirjojen sisältö kokonaisuudessaan, johon kuuluu:
  - vuokrasopimuksessa osapuolten nimet, yhteystiedot, **henkilötunnukset**
    tai y-tunnukset, maksutili, vuokran ja vakuuden määrät
  - katselmuspöytäkirjoissa valokuvia asunnosta, kuvien selitteet ja
    kuvaajien nimet
  - vuokratodistuksissa vuokranmaksun ja huoltokirjan tilastot, arvio
    ja vapaa teksti
  - verolaskelmassa vuokranantajan vuokratulot ja kulut asunnoittain
- asiakirjojen tiivisteet ja allekirjoitustapahtumien lokitiedot
  (aikaleimat, tila)

Sinetöinnin metatiedot eivät sisällä nimiä eivätkä tunnisteita
(Rekisterinpitäjän koodissa `certificates/seal.ts`, `tax/seal.ts`).

**Erityiset henkilötietoryhmät (9 art.):** eivät lähtökohtaisesti kuulu
käsittelyyn. Henkilötunnus käsitellään tietosuojalain 1050/2018 29 §:n
perusteella (DECISIONS.md 2026-09-11).

## 5. Rekisteröityjen ryhmät

- vuokranantajat ja heidän edustajansa (yrityksen allekirjoittaja)
- vuokralaiset
- [vaihe 6, kun käytössä:] vuokratodistuksesta kysyvät uudet vuokranantajat,
  jotka tunnistautuvat vahvasti

## 6. Käsittelyn kesto ja säilytys

Sopimus on voimassa niin kauan kuin Käsittelijä käsittelee
Rekisterinpitäjän lukuun henkilötietoja.

Asiakirjat säilytetään Käsittelijällä [valitse:] 

- (a) kunnes Rekisterinpitäjä on noutanut allekirjoitetun asiakirjan ja
  [X] päivää sen jälkeen, tai
- (b) Rekisterinpitäjän kutsussa ilmoittaman ajan (`retain_years`, 1–10
  vuotta).

Huom: Rekisterinpitäjän oma säilytyssääntö on vuokrasuhteen tiedoille
3 vuotta päättymisestä ja todistuksille pysyvä (CLAUDE.md kohta 2).
Aitouden tarkistus (tiiviste) vaatii, että tiivisteen tieto säilyy
Käsittelijällä vähintään yhtä kauan kuin todistus on käytössä.
[Päätä, säilyykö Käsittelijällä vain tiiviste ja allekirjoitustiedot vai
koko asiakirja.]

## 7. Käsittelijän velvollisuudet (28 art. 3 kohta)

Käsittelijä:

a) käsittelee henkilötietoja vain Rekisterinpitäjän dokumentoitujen
   ohjeiden mukaisesti. Ohjeet ovat tämä sopimus, eSinetin rajapinnan kautta
   tehdyt kutsut ja kirjallisesti annetut lisäohjeet. Jos Käsittelijä
   katsoo ohjeen olevan lainvastainen, se ilmoittaa siitä viipymättä.

b) varmistaa, että henkilötietoja käsittelevät henkilöt ovat sitoutuneet
   noudattamaan salassapitovelvollisuutta.

c) toteuttaa 32 artiklan mukaiset tekniset ja organisatoriset
   suojatoimet, vähintään liitteen 1 mukaiset.

d) käyttää alikäsittelijöitä vain kohdan 8 mukaisesti.

e) avustaa Rekisterinpitäjää rekisteröityjen oikeuksiin liittyvissä
   pyynnöissä (pääsy, oikaisu, poisto, rajoitus, siirto) [X] arkipäivän
   kuluessa pyynnöstä.

f) avustaa Rekisterinpitäjää 32–36 artiklan velvoitteissa: tietoturva,
   henkilötietojen tietoturvaloukkausten ilmoittaminen ja
   vaikutustenarviointi.

g) poistaa tai palauttaa henkilötiedot sopimuksen päättyessä
   Rekisterinpitäjän valinnan mukaan ja poistaa kopiot, ellei laki vaadi
   säilyttämään.

h) antaa Rekisterinpitäjän käyttöön tiedot, jotka tarvitaan tämän artiklan
   velvoitteiden noudattamisen osoittamiseen, ja sallii auditoinnit
   kohdan 10 mukaisesti.

## 8. Alikäsittelijät

Rekisterinpitäjä hyväksyy seuraavat alikäsittelijät:

| Alikäsittelijä | Tehtävä | Sijainti |
|---|---|---|
| [Tunnistusvälittäjä, esim. Telia Finland Oyj] | vahva tunnistautuminen | Suomi |
| [Tietokanta ja tallennus, esim. Supabase] | asiakirjat ja kierrokset | [EU-alue] |
| [Palvelin, esim. Vercel] | rajapinta | [alue] |
| [Asiakirjapalvelu (docservice)] | sinetöinti | [alue] |
| [Sähköposti, esim. Resend] | allekirjoituskutsut | [alue] |

Käsittelijä ilmoittaa uudesta tai vaihtuvasta alikäsittelijästä
[30] päivää etukäteen. Rekisterinpitäjä voi vastustaa muutosta perustellusta
syystä. Käsittelijä sitoo alikäsittelijän samoihin velvoitteisiin kuin
tässä sopimuksessa.

## 9. Siirrot EU:n ja ETA:n ulkopuolelle

Henkilötietoja ei siirretä EU:n tai ETA:n ulkopuolelle ilman
Rekisterinpitäjän kirjallista hyväksyntää ja V luvun mukaista siirtoperustetta.
[Tarkista, onko jollakin kohdan 8 alikäsittelijällä käsittelyä EU:n
ulkopuolella, esimerkiksi tukipalvelussa.]

## 10. Auditointi

Rekisterinpitäjällä on oikeus tarkastaa käsittely kerran vuodessa tai
tietoturvaloukkauksen jälkeen, [X] päivän ennakkoilmoituksella.
Ensisijaisesti tarkastus tehdään Käsittelijän toimittamien asiakirjojen
perusteella.

## 11. Tietoturvaloukkaukset

Käsittelijä ilmoittaa Rekisterinpitäjälle henkilötietojen
tietoturvaloukkauksesta ilman aiheetonta viivytystä ja viimeistään
[24/48] tunnin kuluessa siitä, kun se on havainnut loukkauksen. Ilmoitus
sisältää 33 artiklan 3 kohdan tiedot siltä osin kuin ne ovat tiedossa.

Ilmoitusosoite: [sähköposti].

## 12. Erityisehdot tälle käsittelylle

1. **Henkilötunnus ei saa päätyä metatietoihin eikä lokeihin.** Käsittelijä
   torjuu sinetöintipyynnön, jonka metatiedoissa on henkilötunnuksen
   näköinen arvo (eSinetin `hetu-guard`). Henkilötunnus saa esiintyä vain
   asiakirjan sisällössä.
2. **Julkinen aitoustarkistus.** eSinetin `GET /verify` palauttaa
   allekirjoittajien nimet kenelle tahansa, jolla on asiakirjan tiiviste.
   [Päätä: hyväksytäänkö tämä sellaisenaan, vai rajataanko Reilusopparin
   asiakirjoilla tulos niin, ettei nimiä palauteta.]
3. **Testaus.** Rekisterinpitäjän testit ja kehitys eivät käytä eSinetin
   tuotantoympäristöä; ilman API-avainta Reilusoppari käyttää mockia.

## 13. Vastuu

[Vastuunrajaus pääsopimuksen mukaan. Huom: 82 artiklan vastuu
rekisteröityä kohtaan ei ole sopimuksella rajattavissa.]

## 14. Voimassaolo ja päättyminen

Sopimus tulee voimaan, kun molemmat osapuolet ovat allekirjoittaneet sen,
ja on voimassa niin kauan kuin pääsopimus. Kohtien 7 g, 11 ja 12.1
velvoitteet jatkuvat, kunnes henkilötiedot on poistettu tai palautettu.

## 15. Sovellettava laki ja riidat

Sopimukseen sovelletaan Suomen lakia. Riidat ratkaistaan [Pirkanmaan /
Helsingin] käräjäoikeudessa.

---

## Liite 1. Tekniset ja organisatoriset suojatoimet [täydennä eSinetin tiedoilla]

- Rajapinta vain TLS-yhteydellä, tenant-kohtainen API-avain.
- Webhookit allekirjoitettu (`X-eSinetti-Signature`), Rekisterinpitäjä
  tarkistaa allekirjoituksen.
- Asiakirjojen tiivisteet (SHA-256) tallennetaan ja sinetti rikkoutuu
  tiedoston muuttuessa.
- Pääsynhallinta: [kenellä Adepta Oy:ssä on pääsy tuotantokantaan].
- Varmuuskopiot: [tiheys, sijainti, säilytys].
- Lokit: ei henkilötunnuksia, ei asiakirjojen sisältöä.

## Allekirjoitukset

Adepta Tilat Oy — [nimi, asema, päiväys]

Adepta Oy — [nimi, asema, päiväys]

Huom: sama henkilö allekirjoittaa kummankin puolesta. Se on sallittua, mutta
harkitse, allekirjoittaako toisen yhtiön puolesta toinen
nimenkirjoitusoikeudellinen henkilö [jos sellainen on].
