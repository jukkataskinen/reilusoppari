# DECISIONS — reilusoppari (sovellus)

Päätökset, jotka eivät ole CLAUDE.md:n alkuperäisessä tekstissä tai jotka
muuttavat sitä. Uusin ensin.

---

## Identifier First -kirjautumistyyli koko tenantille (2026-09-11)

Passwordless-sähköpostikirjautuminen ei toiminut, vaikka yhteys oli kytketty
Reilusopparille ja tietokantayhteys kytketty siltä pois. Auth0 pudotti
`connection=email`-parametrin ja näytti salasanalomakkeen.

Syy: Auth0:n **Authentication Profile** oli oletusarvossa *Identifier +
Password*, jossa sähköposti ja salasana ovat samalla ruudulla. Siihen ei mahdu
passwordless-vaihtoehtoa, joten se ohitetaan hiljaisesti. Passwordless vaatii
**Identifier First** -tyylin.

Vaihdettu Identifier Firstiin. Kirjautuminen todennettu toimivaksi päästä
päähän: koodi sähköpostiin, paluu sovellukseen ja `rs_users`-rivin luonti.

**Tämä on tenant-tason asetus ja koskee myös muita projekteja.** Sama Auth0-
tenant palvelee sovelluksia Adepta PPR, Adepta SKOG, Adepta SKOG Backend ja
eSinetti. Niiden kirjautuminen muuttui yksivaiheisesta kaksivaiheiseksi: ensin
sähköposti, sitten salasana. Salasanakirjautuminen toimii edelleen eikä
käyttäjätilejä menetetty — vain ruutu näyttää erilaiselta.

Jos jokin niistä projekteista rikkoutuu odottamattomasti, tämä on
ensimmäinen paikka johon katsoa. Asetus on palautettavissa, mutta silloin
Reilusopparin passwordless lakkaa toimimasta.

## Auth0-tenant siirretään EU:hun (2026-09-11, Jukan päätös)

Tenant `dev-qanv0hdzfjjsybgm` on alueella **US-5**. Auth0 säilöö kirjautuvien
käyttäjien sähköpostit, nimet ja kirjautumistiedot siellä.

Kaksi julkaistua sivustoa lupaa toisin:

- `esinetti.fi` ja `reilusoppari.fi` alatunnisteessa: *"Suomalainen palvelu,
  tiedot EU:ssa"*
- Reilusopparin tietosuojaseloste: käsittely EU:ssa

Siirto EU-alueelle ei ole mahdollista jälkikäteen — alue on tenantin pysyvä
ominaisuus. Se tarkoittaisi uutta tenanttia ja **viiden sovelluksen ja neljän
projektin** uudelleenkonfigurointia sekä käyttäjien siirtoa. Auth0:n ilmaistaso
sallii lisäksi vain yhden tenantin, joten siirto olisi tehtävä kertarysäyksellä.

Vaihtoehdot ennen lanseerausta:

1. Siirto EU-tenanttiin, kaikki projektit kerralla
2. Tekstien korjaus molemmilla sivustoilla ja siirron dokumentointi
   tietosuojaselosteisiin

**Päätös: vaihtoehto 1.** Kaikki siirretään uuteen EU-tenanttiin ennen
lanseerausta. Silloin tenantteja on yhä yksi ja ilmaistaso riittää; erillinen
tenant Reilusopparille olisi maksanut 35 $/kk eikä olisi ratkaissut aluetta.

Sivustojen tekstejä ei siis muuteta — ne pitävät paikkansa siirron jälkeen.

Siirtosuunnitelma, riskit ja tehtävälista ovat `BLOCKERS.md`:ssä. Kaksi
olennaista kohtaa: ilmaistasolla vanhaa ja uutta ei voi ajaa rinnakkain, ja
`auth0_sub` muuttuu niin että tietokantojen käyttäjärivit on kartoitettava
uudelleen sähköpostin perusteella.

## Katselmus: molemmat kuvaavat mitä itse pitävät tärkeänä (2026-09-10, Jukan päätös)

Rakennusohjeen alkuperäinen malli oli checkpoint-vetoinen: vuokranantaja
hallitsee listaa ja vuokralainen kuvaa samoja kohtia. Tämä oli ristiriidassa
sivuston kanssa (ks. `reilusoppari-web/DECISIONS.md`).

Päätös: **oletuslista on muistin tueksi, ei rajoite.** Kumpi tahansa osapuoli
voi lisätä oman kohtansa, ja kuvan voi ottaa myös ilman checkpointia pelkällä
huomautuksella. Vuokralaisen lisäämä kohta on samanarvoinen vuokranantajan
lisäämän kanssa — se näkyy pöytäkirjassa samalla tavalla ja käydään läpi myös
loppukatselmuksessa.

**Allekirjoitus vasta kun kuvat on tallennettu ja katselmus lukittu.** Tämä oli
jo ohjeessa, mutta se on nyt myös se, mikä tekee kuvista sitovia: todistusarvo
syntyy siitä, että molemmat hyväksyvät kokoelman allekirjoituksellaan.

Toteutuksen kaksi seurausta:

1. `rs_checkpoints` saa `added_by_user_id`- ja `added_for_tenancy_id`-sarakkeet.
2. Vuokranantaja ei voi lukita katselmusta ennen kuin vuokralainen on merkinnyt
   olevansa valmis tai 24 h on kulunut hänen ensimmäisestä kirjautumisestaan.
   Ilman tätä lukitus olisi tapa ohittaa vuokralaisen lisäykset.

Käyttöliittymä ei saa esittää vuokranantajan listaa "oikeana" ja vuokralaisen
lisäyksiä poikkeuksena.

## Yhteydenotto käydään portaalissa, ei sähköpostissa (2026-09-10, Jukan tarkennus)

Alkuperäinen luonnokseni välitti yhteydenoton sähköpostitse. Jukan tarkennus:
kysyjä **kirjautuu ja tunnistautuu vahvasti**, ja keskustelu käydään
Reilusopparissa.

Kolme syytä, jotka tekevät tästä paremman:

1. **Kysyjä on todennettu.** Keskustelu koskee kolmannen osapuolen
   (vuokralaisen) henkilötietoja, joten on perusteltua tietää kuka tiedon saa.
   Sähköpostilomake ei estä ketään esiintymästä vuokranantajana.
2. **Vuokralainen näkee keskustelun.** Sähköpostissa se olisi ollut hänen
   ulottumattomissaan. Portaalissa se on hänen nähtävissään kokonaisuudessaan —
   sama periaate kuin kuittauksissa ja huoltokirjassa.
3. **Hankintakanava.** Kysyjällä on tämän jälkeen tili ja todennettu
   henkilöllisyys, ja hänen ensimmäinen vuokrasuhteensa on ilmainen. Todistuksen
   jakamisesta tulee tapa, jolla uusia vuokranantajia ohjautuu palveluun.

**Kustannushuomio:** vahva tunnistautuminen maksaa per tapahtuma. Siksi se
tehdään **kerran per henkilö** — tulos tallentuu `rs_users.identity_verified_at`,
joka on jo tietomallissa, eikä sitä pyydetä uudelleen. Kysyjä, joka ei koskaan
tule asiakkaaksi, maksaa yhden tunnistautumisen. Se on hyväksyttävä hinta
hankintakanavasta, mutta se on syytä seurata.

**Jäljelle jäävä rajoite:** kaksi ihmistä voi aina siirtyä puhelimeen. Portaali
ei estä sitä eikä yritä; se tekee palvelun sisäisestä keskustelusta helpomman
vaihtoehdon ja pitää sen läpinäkyvänä sille, jota se koskee.

## Loppuarviosta kerrotaan alusta asti (2026-09-10, Jukan linjaus)

Molemmille kerrotaan **jo vuokrasuhdetta luotaessa**, että sen päättyessä
kumpikin antaa toisestaan arvion ja saa oman todistuksensa. Vuokranantaja
näkee tämän vuokrasuhteen luonnissa (kohta 5.1), vuokralainen kutsulinkin
kautta (kohta 5.2), ja se toistetaan sopimuksen esikatselussa.

Tämä on se, mikä tekee päätöksestä B (todistus syntyy aina) reilun. Todistus
ei ole yllätys lopussa vaan osa sitä, mihin allekirjoituksella sitoudutaan.

Sivuvaikutus, joka on tuotteen kannalta tärkeämpi kuin itse todistus: kun
molemmat tietävät alusta asti, että lopussa katsotaan taaksepäin, asiat tulee
useammin hoidettua silloin kun ne ovat pieniä.

## Yhteydenottolupa todistuksessa (2026-09-10, Jukan idea — lisäominaisuus, vaihe 6)

Todistuksen **antaja** voi sallia, että todistuksen saaja välittää hänelle
yhteydenoton — käytännössä että uusi vuokranantaja voi kysyä lisää.

Reunaehdot, jotka ratkaisevat onko ominaisuus reilu vai ei:

1. **Yhteystietoja ei luovuteta.** Viesti välitetään Reilusopparin omasta
   osoitteesta. Antaja päättää itse vastaako ja paljastaako osoitteensa.
2. **Omistaja näkee luvan ennen jakamista.** Hänen on tiedettävä mitä jakaa.
3. **Lupa on peruttavissa milloin vain**, jolloin nappi katoaa kaikista jo
   jaetuista linkeistä.
4. **Rajattu määrä viestejä** (oletus 3) ja rate limit; kaikki lokiin ja
   omistajan nähtäväksi.
5. **Symmetrinen:** myös vuokralainen voi sallia yhteydenoton vuokranantajan
   todistukseen.

**Tiedostettu rajoite:** kanava voi kuljettaa myös kielteistä, jota todistus
itse ei kuljeta. Tätä ei voi estää teknisesti eikä kannata yrittää. Suoja on
siinä, että omistaja näkee luvan olevan päällä ja päättää itse jakaako
todistusta lainkaan. Tämä kirjataan myös käyttöehtoihin.

## Todistuksen arvio: kaksiarvoinen ja aina syntyvä (2026-09-10, Jukan päätös)

Rakennusohjeen alkuperäinen malli oli kolmiportainen arvio
(`recommend` / `recommend_with_reservations` / `not_recommend`), ja todistus
syntyi joka tapauksessa. Tämä oli ristiriidassa sivuston julkaistujen tekstien
kanssa. Jukka ratkaisi ristiriidan näin:

**A. Asteikko säilyy, mutta vain myönteisenä.**
Arvo on `recommend` tai ei arviota lainkaan. Kielteistä vaihtoehtoa ei ole.

**B. Todistus syntyy aina.**
Vastaanottaja ei voi estää sen syntymistä. Hän näkee sen ennen sinetöintiä ja
voi liittää 300 merkin vastineen 7 päivän kuluessa.

### Miksi nämä kaksi yhdessä toimivat

Erikseen kumpikin olisi ongelmallinen. B yksin tarkoittaisi, että kielteinen
leima syntyy ilman suostumusta. A yksin jättäisi vuokralaiselle veto-oikeuden,
jota harva käyttäisi hyvään todistukseen — jolloin kieltäytyminen itsessään
alkaisi viestiä jotain.

Yhdessä ne muodostavat paketin, jossa pahin mahdollinen lopputulos on todistus,
jossa on tilastot, vapaa teksti ja vastine — mutta ei suositusta. Ja koska
todistus on vastaanottajan oma eikä palvelu näytä sitä kenellekään muulle, hän
päättää yksin, näyttääkö sitä.

### Sitova toteutussääntö

Jos `rating is null`, todistuksessa **ei ole suositusosiota lainkaan**: ei
tyhjää kohtaa, ei tekstiä "ei suositusta", ei paikanvaraajaa, ei eri
asettelua. Puuttuva suositus ei saa olla luettavissa todistuksesta.

Ilman tätä sääntöä kaksiarvoisuus muuttuu kiertoteitse kolmiportaiseksi:
lukija päättelisi puuttuvasta osiosta saman kuin "en suosittele" -merkinnästä.
Tämä on koko päätöksen ydin, ei yksityiskohta.

### Jäljelle jäävä riski

Vapaa teksti (300 merkkiä) on edelleen kanava, johon voi kirjoittaa kielteistä.
Sitä ei rajoiteta teknisesti. Riski on rajattu kolmella tavalla: vastaanottaja
näkee tekstin ennen sinetöintiä, voi liittää vastineen, ja päättää yksin
näyttääkö todistusta kenellekään. Kielteinen vapaa teksti päätyy siis
käytännössä vain sen luettavaksi, jota se koskee.

### Mitä tämä muutti

Sovelluksen `CLAUDE.md`: kohdan 2 Todistus-rivi, `rs_certificates.rating`
-sarakkeen check-ehto ja kohta 5.8.

Sivusto (`reilusoppari-web`), julkaistuja tekstejä korjattiin:

- `/todistus` — "jos hän ei halua ottaa sitä vastaan, todistusta ei synny"
  poistettu; tilalle suosituksen kaksiarvoisuus.
- Blogiartikkeli "Mitä vuokranantaja saa kirjoittaa suositukseen" — kolme
  kohtaa: yleinen väite myönteisen arvion ongelmallisuudesta tarkennettiin
  koskemaan asteikkoa, ei yksittäistä myönteistä sanaa; Askeleet-kohta 4;
  UKK-vastaus poistamisesta.


## Sovellus julkaistaan App Storessa ja Google Playssa (2026-09-11, Jukan vaatimus)

Jukka: "tämän sovelluksen pitää luonnollisesti olla ladattavissa aidosti
äppinä iOS:lle ja androideille."

PWA ei siis riitä. Tekninen tapa on Capacitor-kuori saman Next.js-sovelluksen
ympärillä: yksi koodikanta, kolme julkaisua (web, iOS, Android). Erillistä
natiivisovellusta ei kirjoiteta.

**Tämä ei ole pelkkä pakkausmuoto — se muuttaa kahta asiaa.**

**1. Maksut.** Apple vaatii digitaalisen sisällön myynnin kulkevan oman
maksujärjestelmänsä kautta, provisio 15–30 %. Reilusopparin 29 €:n
vuokrasuhde ja Plus ovat digitaalista sisältöä. Vaihtoehdot:

| | Provisio | Seuraus |
|---|---|---|
| Applen IAP sovelluksessa | 15–30 % | 29 €:sta jää ~22 €; kaksi rinnakkaista maksujärjestelmää ylläpidettäväksi |
| **Ei myyntiä sovelluksessa** | 0 % | Osto verkossa, sovellus näyttää vain mitä on ostettu. Sovelluksesta ei saa linkittää ostosivulle. |

Suositus on jälkimmäinen, sama kuin Netflixillä ja Spotifylla. Päätös on
tehtävä ennen vaihetta 5, koska maksunäkymä rakennetaan sen mukaan.

**2. Apple hylkää pelkät verkkosivukuoret** (App Store Review Guideline 4.2).
Reilusoppari läpäisee tämän, koska siinä on kamera, push-ilmoitukset ja
offline-tila — mutta ne on toteutettava natiivisti Capacitorin kautta, ei
selaimen rajapinnoilla. Se on työtä, ei muotoseikka.

**Aikataulu.** Ensimmäinen App Store -katselmus kestää päiviä ja menee usein
kerran läpi hylättynä. Lokakuun lanseeraus tarkoittaa käytännössä, että
**web ja PWA julkaistaan ensin ja kaupat perässä** — tai että kauppatilit ja
kuoret aloitetaan heti rinnalla. Tämä on Jukan valinta; `PLAN.md` vaihe 7 on
kirjoitettu niin, että se voi tapahtua kummin päin tahansa.


## Asiakirjat eivät saa näyttää viranomaispapereilta (2026-09-11, Jukan linjaus)

Jukka: "kaikkien dokumenttien pitää olla niin sanotusti mukavia: niiden ei
siis tule näyttää viranomaisdokumenteilta vaikka asiaa ovatkin."

Tämä koskee kaikkia `templates/`-pohjia: vuokrasopimusta, katselmus-
pöytäkirjoja, todistuksia ja verolaskelmaa.

**Miksi tämä ei ole makuasia.** Vuokrasopimus allekirjoitetaan tilanteessa,
jossa toinen osapuoli on usein nuori ja ensi kertaa vuokralla, ja toinen on
yksityishenkilö eikä ammattivuokranantaja. Viranomaisen näköinen paperi tekee
tilanteesta vastakkainasettelun: se viestii, että nyt varaudutaan riitaan.
Reilusopparin koko lupaus on päinvastainen — sovitaan asiat etukäteen, jotta
riitaa ei tule. Asiakirjan ulkoasu on osa sitä lupausta.

**Mitä se tarkoittaa käytännössä.**

| Ei | Vaan |
|---|---|
| Versaalit otsikot, "LIITE 1 / KOHTA 3.2" | Selkeät suomenkieliset otsikot |
| Viitenumerot ja pykäläviittaukset joka rivillä | Lakiviittaus vain siellä missä se oikeasti pitää olla |
| Tiheä, harmaa, marginaaliton taitto | Ilmava taitto, riittävä riviväli |
| Times New Roman ja kehykset | Sama Plus Jakarta Sans kuin sovelluksessa ja sivustolla |
| "Allekirjoittaja vakuuttaa täten…" | "Olemme käyneet asunnon yhdessä läpi." |
| Harmaa ja musta | Sama paletti kuin sovelluksessa, maltillisesti |

**Mikä ei jousta.** Asiakirjan on silti oltava todistusvoimainen: kaikki
juridisesti tarpeellinen sisältö, päiväykset, tiivisteet ja allekirjoitus-
tiedot ovat mukana. "Mukava" koskee ulkoasua ja kieltä, ei sisältöä. Jos
jokin tieto on oltava, se on — mutta se kirjoitetaan ihmiselle luettavaksi.

**Mittari.** Katselmuspöytäkirja pitää voida lähettää vuokralaiselle ilman,
että hän säikähtää sitä. Jos asiakirja näyttää siltä, että sen voisi saada
ulosottovirastolta, se on väärä.

Pohjien juridinen sisältö on Jukan vastuulla, ulkoasu ja kieli tämän
linjauksen mukaan.


## Asiakirjojen ulkoasu: Jukan luonnos on lähtökohta (2026-09-11)

Jukka toimitti visuaalisen luonnoksen vuokrasopimuksesta ja
vuokrasuhdetodistuksesta. Se on `templates/`-pohjien ulkoasun perusta, ja
rakenne on luettu auki `templates/README.md`:hen, jotta pohjat voidaan
kirjoittaa ilman että kuvaa tarvitsee katsoa rinnalla.

Luonnos vastaa suoraan linjaukseen "ei viranomaispaperia": iso ystävällinen
otsikko, yksi selittävä lause ihmisen kielellä, avaintiedot pehmeässä
paneelissa kuvakkeineen, ehdot lyhyinä otsikoituina kohtina, lämmin loppusana
ja tunnuslause *Reilua asumista. Yhdessä.*

**Neljä asiaa luonnoksesta, jotka vaativat oman päätöksensä:**

1. **Ei korallinpunaista asiakirjoissa.** Luonnos on kokonaan sinisen
   sävyissä, ja se on oikein — sovelluksen `--color-coral` luetaan
   asiakirjassa varoitukseksi.

2. **Koristekuva vain sopimukseen ja todistukseen, ei pöytäkirjaan.**
   Katselmuspöytäkirjassa kuva on todiste. Koristekuva samalla sivulla
   tekisi rajasta epäselvän.

3. **"Vuokranantajan tervehdys" on luonnoksessa näkyvä paneeli.** Kun
   suositusta ei anneta, koko paneelin on kadottava jäljettömiin — ei tyhjää
   laatikkoa eikä eri asettelua. Tämä on aiemman päätöksen (2026-09-10) ydin,
   ja taitto on rakennettava sen mukaan.

4. **QR-koodi generoidaan Reilusopparissa** ja välitetään kuvana. Ulkoista
   QR-palvelua ei voi käyttää: renderöijä ei hae ulkoisia resursseja, eikä
   todistuksen tunnistetta lähetetä kolmannelle osapuolelle.

Avoin kysymys: korostusrivin käsinkirjoitusfontti vaatii toisen upotetun
fontin jokaiseen PDF:ään. Halvempi vaihtoehto on Plus Jakarta Sansin
kursiivi. Päätetään ennen ensimmäistä pohjaa.


## Reilusoppari tekee PDF:nsä itse (2026-09-11, Jukan päätös)

Jukan linjaus eSinetin arkkitehtuurista: *"eSinetin tarkoitus on olla 1.
pöytäkirjakone 2. asennettavissa mihin tahansa palveluun, jolloin dokumentit
luodaan ulkoisessa palvelussa ja vain allekirjoitetaan eSinetissä.
Reilusoppari on yksi eSinetin asiakkaista."*

Reilusoppari on siis **käyttötapa 2**: se tekee allekirjoitettavan PDF:n
täysin valmiiksi, ja eSinetti kerää allekirjoitukset ja toimittaa
allekirjoitetut asiakirjat allekirjoittajille.

### Mitä tästä seurasi

`CLAUDE.md` kohta 2 sanoi, että pohjat ylläpidetään `templates/`-hakemistossa
ja synkronoidaan eSinettiin `npm run templates:push` -skriptillä. **Tämä ei
enää pidä paikkaansa.** Pohjahakemisto, push-skripti, `ESINETTI_TEMPLATE_IDS`
ja `lib/esinetti`:n `renderDocument`, `listTemplates` ja `upsertTemplate` on
poistettu. Asiakirjat ovat `src/documents/`.

eSinetistä käytetään vain: `POST /rounds`, `GET /rounds/{id}`, asiakirjan
lataus, `POST /documents/seal`, `GET /verify` ja webhookit.

### Miksi React-PDF eikä oma renderöintipalvelu

Vaihtoehtoina olivat asiakirjan rakentaminen sovelluksen sisällä (React-PDF)
tai erillinen HTML→PDF-palvelu (WeasyPrint, kuten eSinetissä). Jälkimmäinen
olisi antanut luonnoksen HTML:n ja CSS:n sellaisenaan sekä paremman
sivunvaihtojen hallinnan, mutta maksanut 5–10 €/kk ja tuonut toisen
ylläpidettävän palvelimen ja toisen ohjelmointikielen.

Jukan valinta: React-PDF. Perustelu on se, ettei Jukalla ole kehittäjää
paikalla korjaamassa rikkinäistä palvelinta, eikä sivunvaihtojen hienosäätö
ole sen arvoista.

### Fontti ratkesi ilman latausta

React-PDF ei lue woff2-muotoa eikä osaa muuttuvia fontteja, ja repossa oli
vain `sans-variable.woff2`. Staattiset leikkaukset (400, 600, 700) saatiin
npm-paketista `@fontsource/plus-jakarta-sans` ja muunnettiin TTF:ksi
(`wawoff2`). Tiedostot ovat `src/documents/fonts/`, noin 30 kt kukin, ja
kaikki tarvittavat merkit ovat mukana — myös ä, ö, å, €, – ja —.

### Todistukset kulkevat molempia reittejä

Jukan tarkennus: optimitilanteessa todistuskin allekirjoitetaan — vuokralainen
esimerkiksi kuittaa saaneensa vakuutensa takaisin. Riitaisaa loppuraporttia ei
kuittaa kukaan, joten se syntyy ilman allekirjoituksia.

Molemmat reitit ovat siis käytössä: allekirjoitettava asiakirja menee
`POST /rounds`-kierrokselle, allekirjoittamaton `POST /documents/seal`-reitille.
Kumpikin löytyy jälkeenpäin `GET /verify`-haulla tiivisteellä.

### Determinismi on rakenteellinen, ei sopimus

Asiakirjasta lasketaan SHA-256, ja se päätyy pöytäkirjaan, webhookiin ja
todistukseen. PDF:ään päätyy oletuksena luontiaika, joka muuttuisi joka
ajolla. `renderDocumentPdf` asettaa aikaleimat itse kutsujan antamasta
päiväyksestä — kutsuja ei voi unohtaa sitä. Testit varmistavat, että sama
sisältö ja päiväys tuottavat samat tavut ja että eri päiväys tuottaa eri
tiivisteen.


## Koristekuvitus: valokuvat myöhemmin, vektori nyt (2026-09-11)

Jukka: *"Edelleen haluaisin koristeiksi oikeita kuvia vektoreiden sijaan,
mutta sen voi tehdä jossakin myöhemmässä vaiheessa. Voin ostaa jotain kuvia
ettei copyright-asiat muodostu ongelmaksi. Tai voin kuvata itse jotain kotini
nurkkaa sopimuksen koristeeksi."*

Vektorikuvitus on siis väliaikainen. Kun valokuvat vaihdetaan tilalle, neljä
asiaa on hoidettava — ne on helpompi tietää etukäteen kuin selvittää silloin.

**1. Kuva on upotettava, ei linkitettävä.** Sama sääntö kuin nyt: asiakirja ei
saa hakea mitään verkosta. Tiedosto tulee repoon (`src/documents/photos/`) ja
`next.config.ts`:n `outputFileTracingIncludes`-listalle, kuten fontit.

**2. Lisenssi talteen repoon.** Jos kuva ostetaan, lisenssitodistus samaan
hakemistoon. Asiakirja on juridinen ja se päätyy tuhansiin koteihin; kolmen
vuoden päästä kukaan ei muista mistä kuva tuli.

**3. Kuvan on oltava yksityiskohta, ei huone.** Tämä on se, mitä vektorissa ei
tarvinnut miettiä: **vuokrasopimuksessa oleva sisustuskuva voi näyttää siltä,
että se on kuva vuokrattavasta asunnosta.** Se ei ole, ja väärinkäsitys olisi
ikävä juuri tässä asiakirjassa. Turvallinen valinta on rajattu yksityiskohta —
ikkunanurkka, huonekasvi, kahvikuppi pöydällä — ei tunnistettava huone.
Jukan oman kodin nurkka käy hyvin, kunhan se on yksityiskohta.

**4. Ei koskaan katselmuspöytäkirjaan.** Sama raja kuin nyt ja tärkeämpi
valokuvien kanssa: pöytäkirjassa kuva on todiste.

Tekniset mitat kun ajankohtaista: vinjetti on 118 × 118 pt, eli 150 dpi:llä
noin 250 × 250 px. JPEG, alle 100 kt. Kuva rajataan aina samaan laatikkoon
(`objectFit: "cover"`), joten kuvasuhde ei ole kriittinen.


## Sovelluskaupat eivät ole välttämättömiä (2026-09-11, Jukan korjaus)

Jukka korjasi aiempaa linjaustaan: *"Tämän ei tarvitse toimia äppinä, jos se
skaalautuu mukavasti puhelimeen ja push-ilmoitukset saa jollakin muulla tavalla
toimimaan. Se ei ole hyvä ratkaisu, että vuokranantaja saa sähköpostin jossa
pyydetään tarkastamaan vuokranmaksu. Herätys puhelimeen on parempi."*

Vaatimus ei siis ole sovelluskauppa vaan **ilmoitus puhelimeen**. Se onnistuu
ilman natiivisovellusta — yhdellä ehdolla.

### Mikä toimii ja missä

| | Android | iPhone |
|---|---|---|
| Selaimesta ilman mitään | ✅ push toimii | ❌ ei ilmoituksia |
| Kotivalikkoon lisättynä | ✅ | ✅ push toimii |

**iPhonella push-ilmoitukset vaativat, että käyttäjä lisää sovelluksen
kotivalikkoon** (Safari → Jaa → Lisää Koti-valikkoon). Tämä on Applen sääntö,
ei tekninen puute, eikä sitä voi kiertää. Toiminto on ollut iOS 16.4:stä
(maaliskuu 2023), joten laitekanta ei ole ongelma lokakuussa 2026.

Käytännössä: **iPhone-käyttäjä on ohjattava lisäämään sovellus kotivalikkoon
siinä hetkessä, kun ilmoituksilla alkaa olla merkitystä** — eli kun
vuokrasuhde muuttuu aktiiviseksi ja ensimmäinen kuittauspyyntö on tulossa.
Ei heti ensimmäisellä käynnillä, jolloin hyötyä ei vielä näe.

### Mitä tästä seuraa

**Vaihe 7 (sovelluskaupat) muuttuu valinnaiseksi.** Se ei ole lanseerauksen
edellytys. Samalla poistuu:

- Apple Developer 99 $/v ja Google Play 25 $
- App Store -katselmus ja sen hylkäyskierrokset
- **Applen 15–30 % provisio digitaalisesta sisällöstä.** Tämä oli vaiheen 5
  suurin avoin kysymys: 29 €:n vuokrasuhteesta olisi jäänyt noin 22 €.
  Nyt Stripe riittää eikä maksunäkymää tarvitse rakentaa kahdesti.

**Vaatimukset PWA:lle kiristyvät vastaavasti.** Sovelluksen on skaalauduttava
puhelimeen kunnolla — se on jo suunnitteluperiaate (mobiili ensin, 390 px) —
ja kotivalikkoon lisäämisen on oltava sujuva ja selitetty.

### Jäljelle jäävä riski

iOS:n PWA-push on vähemmän luotettava kuin natiivisovelluksen: käyttöjärjestelmä
voi viivästyttää ilmoituksia, eikä taustapäivitykselle ole takeita. Kerran
kuussa lähtevälle kuittauspyynnölle se riittää.

Jos käytännössä osoittautuu, ettei se riitä, vaihtoehdot ovat tekstiviesti tai
paluu sovelluskauppoihin. Sähköposti on varakanava, ei ensisijainen — juuri
siitä Jukka huomautti.


## Avoimet kysymykset vaiheesta 1 (2026-09-11)

Nämä tulivat vastaan rakentaessa eikä ohjeessa ole niistä linjausta. Tein
turvallisimman valinnan ja jatkoin; korjaa jos tarkoitit toisin.

**1. Vajaan ensimmäisen kuukauden vuokra.** Jos vuokrasuhde alkaa kesken
kuukauden, ensimmäiselle kuukaudelle generoituu täysi vuokra. Suhteuttaminen
vaatisi päätöksen laskutavasta (päivät/30 vai päivät kuukaudessa). Kunnes se
ratkaistaan, vajaasta kuukaudesta voi sopia sopimuksen muissa ehdoissa.

**2. Kutsun voimassaolo on 30 päivää.** Vuokrasuhde luodaan usein hyvissä
ajoin, ja lyhyempi aika tarkoittaisi vanhentuneita kutsuja. Vanhentuneen
tilalle voi luoda uuden.

**3. Kutsutun sähköpostin on täsmättävä kirjautumiseen.** Muuten eteenpäin
välitetty linkki liittäisi väärän ihmisen vuokrasuhteeseen, ja hänen nimensä
päätyisi allekirjoitettuun sopimukseen. Väärällä tilillä avattu kutsu ei kulu.

**4. Osapuolten nimet ovat sopimuksen dataa.** `rs_users.name` täyttyy vasta
eSinetin tunnistuksesta, mutta sopimus on kirjoitettava ennen sitä.
Vuokranantaja kirjoittaa nimet itse; allekirjoituksen jälkeen tunnistuksesta
saatu nimi on se, joka pätee.

**5. Sopimuksen oletusehdot on valittu niin, etteivät ne yllätä
vuokralaista.** Vesi kuuluu vuokraan oletuksena — jos vuokranantaja ei huomaa
muuttaa sitä, seurauksena ei ole yllätyslaskua.

**6. Vuokralainen ei muokkaa sopimusta.** Hän näkee luonnoksen ja kertoo
toiveensa vuokranantajalle, joka muuttaa ehtoja. Muuten sopimus voisi muuttua
sen jälkeen, kun toinen on sen lukenut. Kommentointi portaalissa on vielä
tekemättä.


## Sopimuksen sisältö oikeasta mallisopimuksesta, kieli omaa (2026-09-11, Jukan linjaus)

Jukka antoi mallikappaleeksi käyttämänsä oikean vuokrasopimuksen ja sanoi:
*"tuo sopimus on sisällöltään hyvä mutta se on juuri sellaisella
virkamieskielellä kirjoitettu, jota yritetään tässä sovelluksessa välttää."*

**Sisältö otetaan, sanamuodot ei.** Mallista tulivat ne kohdat, jotka meiltä
puuttuivat: muuttopäivä, muutostyöt, loppusiivous, kotivakuutus,
jälleenvuokraus, viivästyskorko, vakuuden eräpäivä ja sen käyttö
maksamattomiin eriin. Ehtoja on nyt 18–19 aiemman 12:n sijaan.

Kieli on kirjoitettu kokonaan uudelleen. Esimerkki samasta asiasta:

> **Malli:** "Vuokranantajalla on oikeus ilman tuomiota tai päätöstä
> realisoida vakuus vuokrasaatavien kattamiseksi."
>
> **Meillä:** "Jos vuokraa tai muuta sovittua maksua jää maksamatta
> kirjallisesta muistutuksesta huolimatta, vuokranantaja voi käyttää vakuutta
> niiden kattamiseen."

Sisältö ei kevene. Se, mitä osapuolet tosiasiassa sopivat, pysyy samana —
vain lukukelpoisuus muuttuu. Tämä on sama linjaus kuin *"Asiakirjat eivät saa
näyttää viranomaispapereilta"*, mutta koskee tekstiä eikä ulkoasua.

Testi `tests/unit/rental-agreement.test.tsx` vartioi tätä: se hylkää
sopimuksen, jos teksteihin ilmestyy virkakielen vakiofraaseja
("edellä mainittu", "täten", "kyseinen", "ilman tuomiota").


## Sitoutumisaika: toistaiseksi voimassa, mutta ei heti irtisanottavissa (2026-09-11, Jukan pyyntö)

*"Irtisanomisessa voisi olla äpissä valintana suoraan, että ensimmäisen 12 kk
aikana ei voi sanoa sopimusta irti."*

Lomakkeella on nyt rasti **"Sopimusta ei voi irtisanoa heti"** ja sen alla
kuukausimäärä (oletus 12). Tämä on **eri asia kuin määräaikainen sopimus**, ja
ero sanotaan sekä lomakkeella että asiakirjassa ääneen: määräaikainen päättyy
sovittuna päivänä, tämä jatkuu sen jälkeen normaalisti.

Asiakirjaan ei kirjoiteta pelkkää kuukausimäärää vaan **laskettu päivämäärä**:
"Ensimmäiset 12 kuukautta kumpikaan ei kuitenkaan voi irtisanoa sitä: aikaisin
mahdollinen irtisanomispäivä on 1.9.2027." Kuukausimäärä vaatisi lukijalta
laskutoimituksen, päivämäärä ei. Sama tieto on myös etusivun tietolaatikossa
vuokran vieressä — sitä ei pidä joutua etsimään ehtojen joukosta.

Jos sopimus on määräaikainen, sitoutumisaikaa ei toisteta: sopimus päättyy
joka tapauksessa sovittuna päivänä.


## Henkilötunnus sopimukseen, salattuna kantaan (2026-09-11, Jukan päätös)

Aiempi linjaus oli ehdoton: *"Ei henkilötunnuksia missään Reilusopparin
taulussa"* (CLAUDE.md kohta 6), ja sitä vartioi CI-työ, joka kaatoi buildin
pelkästä sanasta. Jukka muutti linjausta: sopimukseen tarvitaan kummankin
osapuolen henkilö- tai y-tunnus, puhelin ja sähköposti.

**Miksi.** Suomalaisessa vuokrasopimuksessa osapuolet yksilöidään
henkilötunnuksella. Ilman sitä sopimus on juuri siinä tilanteessa heikko,
jota varten se on kirjoitettu: perinnässä ja käräjäoikeudessa. Käsittelyn
peruste on tietosuojalaki 1050/2018 § 29 — tunnusta saa käsitellä, kun
rekisteröidyn yksiselitteinen yksilöinti on tärkeää osapuolten oikeuksien ja
velvollisuuksien toteuttamiseksi.

**Miten riski pidetään pienenä.** Vaihtoehto ei ollut "tallennetaan tai ei"
vaan "tallennetaan huolimattomasti tai huolellisesti":

1. **Salattuna, avain kannan ulkopuolella.** AES-256-GCM
   (`src/lib/identity/crypto.ts`), avain `PERSON_DATA_KEY`-ympäristö-
   muuttujassa. Tietokantavedos ei sisällä henkilötunnuksia, vain
   `v1:`-alkuisia merkkijonoja. Salaus on sovelluksessa eikä `pgcrypto`-
   funktioissa, koska SQL-parametrit päätyvät kannan kyselylokiin.
2. **Satunnainen alkuvektori joka riville.** Sama tunnus salautuu eri arvoksi
   eri riveillä, joten kannasta ei näe, ketkä kaksi osapuolta ovat sama
   ihminen.
3. **Käyttöliittymässä aina peitetty** (`131052-***T`), ja peittäminen
   tehdään palvelimella. Selaimeen lähetetty kokonainen tunnus olisi sivun
   lähdekoodissa riippumatta siitä, mitä ruudulla näkyy.
4. **Kaksi erillistä lukufunktiota.** `listPartyDetails` peittää,
   `partyDetailsForDocument` ei. Ne ovat eri funktioita eivätkä yksi funktio
   `{ full: true }` -valitsimella: valitsin päätyisi ennen pitkää
   listanäkymään.
5. **Ei lokiin.** `npm run tarkista:tunnisteet` hylkää lokirivin, jolla
   esiintyy tunniste, ja rajaa purkufunktion sallittuihin tiedostoihin.
   CI-työ `ei-henkilotunnuksia` korvattiin työllä `tunnisteet-eivat-vuoda`:
   kielto ei enää koske tunnuksen olemassaoloa vaan sen vuotamista.

**Tarkistusmerkki lasketaan.** Sopimus allekirjoitetaan kerran; näppäilyvirhe
jää sinetöityyn asiakirjaan pysyvästi. Sekä henkilötunnuksen että y-tunnuksen
tarkistusmerkki lasketaan lomakkeella. Tarkistus ei kerro, onko tunnus
olemassa — sen tekee vasta eSinetin vahva tunnistautuminen.

**Tyhjä kenttä ei poista.** Tallennettu tunnus säilyy, jos kenttä jätetään
tyhjäksi; poistaminen on oma valintansa. Muuten puhelinnumeron muutos
pyyhkisi tunnuksen mennessään.

**Jäljelle jäävä riski.** Avaimen ja tietokannan haltija saa tunnukset auki.
Salaus siirtää riskin tietokantavedoksesta ympäristömuuttujien hallintaan —
se on parempi paikka, muttei tyhjä.


## Osapuolten tiedot ovat osapuoliriveillä, eivät sopimuksen ehdoissa (2026-09-11)

Nimet olivat aiemmin `rs_contracts.template_data`-kentässä. Nyt ne ovat
`rs_tenancy_parties`-riveillä tunnistetietojen kanssa, ja sopimuspohjan versio
nousi 3:een.

Syy on sama, jonka vuoksi osoite ja vuokra eivät ole sopimuksen ehdoissa: jos
sama tieto on kahdessa paikassa, ne eroavat ennen pitkää toisistaan. Silloin
sopimuksen allekirjoitusrivillä voisi lukea eri nimi kuin osapuolitiedoissa.

Vuokranantajan tiedot syötetään **omissa perustiedoissa** (`/omat-tiedot`) ja
kopioidaan uuden vuokrasuhteen osapuoliriville. Kopio on tarkoituksella kopio:
perustietojen muokkaus ei muuta jo allekirjoitettuja sopimuksia takautuvasti.

Vuokralainen näkee molempien tiedot mutta muokkaa vain omiaan. Vuokranantaja
saa täyttää myös vuokralaisen tiedot — sopimus kirjoitetaan käytännössä
valmiiksi ennen kuin vuokralainen on kirjautunut.


## CI:n e2e-työ tarvitsee tietokanta-avaimet (2026-09-11)

E2E kaatui `kutsulinkki aukeaa ilman kirjautumista` -testeihin. Syy ei ollut
testeissä: e2e ajaa oikeaa sovellusta (`npm run build && npm run start`),
ja kutsusivu kysyy kutsun tietokannasta ennen kuin se voi näyttää mitään.
Ilman avaimia `getServiceClient()` heittää, ja sivu vastaa 500 sen sijaan
että kertoisi kutsun vanhentuneen.

**Ensimmäinen korjaus ei toiminut.** E2E-työlle annettiin samat
`TEST_SUPABASE_*`-avaimet kuin yksikkötyölle, mutta niitä ei ole olemassa:
salaisuuksia ei ole koskaan luotu. Yksikkötyö on silti vihreä, koska
tietokantatestit ovat `describe.skipIf`-ohituksen takana — CI on siis ollut
vihreä myös silloin, kun 17 integraatiotestiä ei ole ajanut lainkaan.

**Toinen korjaus: puuttuva kokoonpano ja katkos ovat eri asioita.**
`findTenancyByInvite` erottaa ne nyt:

- **Ei Supabase-avaimia lainkaan** → `null`, eli "kutsu ei ole voimassa".
  Tämä ei ole katkoksen vaimennus vaan puuttuva asennus: ilman avaimia
  sovellusta ei ole asennettu loppuun eikä yksikään sen sivu toimisi. CI ajaa
  savutestit juuri tässä tilassa.
- **Kyselyvirhe** → heitetään. Aiemmin se palautti hiljaa `null`:in, jolloin
  oikea vuokralainen olisi saanut tietokantakatkoksesta viestin, että hänen
  kutsunsa on kuollut — ja luopunut linkistä, joka on kunnossa. Tämä oli
  olemassa oleva vika, jonka CI-selvittely paljasti.

Näin kaikki kolme kutsusivun e2e-testiä ajetaan myös CI:ssä ilman
tietokantaa, eikä yhtäkään tarvitse ohittaa. Todennettu ajamalla e2e
paikallisesti tyhjennetyillä Supabase-muuttujilla: 26 läpi, 2 ohitettu
(Auth0).

**Jäljelle jäävä aukko:** ne 17 integraatiotestiä ajetaan edelleen vain
paikallisesti. Jukan päätös 2026-09-11: erillistä testikantaa ei perusteta
nyt. Tämä on tiedossa oleva aukko, ei unohdus.


## Maksutili sopimukseen, ei salattuna (2026-09-11, Jukan pyyntö)

*"vuokrasopimuksessa pitää olla myös maksutili näkyvillä."*

Tili on **ehdossa "Vuokra ja maksaminen"**, ei osapuolitiedoissa: tiliä
etsitään silloin, kun ollaan maksamassa, ja silloin katse on siinä kohdassa,
joka kertoo maksamisesta.

Tarkistusluku lasketaan (ISO 13616, mod 97). Väärä tilinumero on ikävämpi
kuin väärä henkilötunnus: sen mukaan maksetaan, ja maksu joko ei mene läpi tai
menee jonnekin muualle.

**Ei salattu**, toisin kuin henkilötunnus. Tilinumero on jokaisessa laskussa
ja jokaisessa tilisiirrossa; salaus antaisi väärän kuvan siitä, kuinka
salainen se on, ja monimutkaistaisi koodia ilman hyötyä. Osapuolirajaus
koskee sitä silti kuten kaikkea muutakin.

Tili luetaan **vuokranantajan** riviltä. Vuokralaisen riville kirjattu tili
ohjaisi maksun väärään paikkaan, joten sitä ei lueta lainkaan, ja lomakkeella
kenttä näkyy vain vuokranantajalle. Testi vartioi tätä.

Numerossa on sitovat välilyönnit (`FI21 1234…`), koska rivinvaihto
keskellä tilinumeroa tekee siitä vaikean lukea ja kopioida.


## PostgREST täyttää puuttuvan avaimen NULLilla, ei oletusarvolla (2026-09-11)

Vuokrasuhteen luonti alkoi kaatua virheeseen `null value in column
"party_type" violates not-null constraint`, vaikka sarakkeella on
`default 'henkilo'`.

Syy: `insert`-taulukon objekteilla oli **eri avaimet**. Vuokranantajan rivillä
oli `party_type` (perustiedoista kopioituna), vuokralaisen rivillä ei.
PostgREST muodostaa taulukosta avainten yhdisteen ja täyttää puuttuvan avaimen
**NULLilla** — ei sarakkeen oletusarvolla, jota se ei edes kysy kannasta.

Korjaus: `TYHJA_OSAPUOLI`-pohja, jonka päälle molempien rivien tiedot
kirjoitetaan. Sääntö on yleinen: **saman insert-taulukon riveillä on oltava
samat avaimet.** Tämä ei ole tämän taulun erityispiirre vaan koskee jokaista
monirivistä inserttiä.


## Sovelluksen hitaus: funktiot väärällä mantereella (2026-09-11, Jukan havainto)

*"Äppi reagoi aika hitaasti."*

Vercelin funktiot ajavat oletuksena `iad1`-alueella eli Washingtonissa.
Supabase on EU:ssa (CLAUDE.md kohta 2). Jokainen tietokantakysely ylitti siis
Atlantin kahdesti, noin 100 ms suuntaansa — ja yksi sivu tekee useita
kyselyjä peräkkäin, koska osapuolirajaus on oma kyselynsä ennen varsinaista
hakua.

Sivulataus, jossa on kolme kyselyä, maksoi pelkkää verkkoviivettä yli puoli
sekuntia ennen kuin mitään ehti tapahtua.

`vercel.json` asettaa alueeksi `arn1` (Tukholma). Se on lähin alue Suomeen ja
samalla mantereella tietokannan kanssa.

Samalla `getCurrentUser` muutettiin: se teki `upsert`-kirjoituksen
**jokaisella sivulatauksella**, vaikka mikään ei muuttunut. Nyt rivi luetaan
ja kirjoitetaan vain ensimmäisellä kirjautumisella. Kierroksia on yhtä monta,
mutta kirjoitus on kalliimpi kuin luku.

Jäljelle jää kylmäkäynnistys: harvoin käytetty funktio herää sekunnissa tai
kahdessa. Sitä ei poisteta koodilla.


## Esikatselusta on päästävä takaisin (2026-09-11, Jukan havainto)

*"Vuokrasopimus-esikatselusta ei voi peruuttaa pois."*

Linkki vei suoraan PDF-reittiin. Kotinäytölle asennetussa sovelluksessa ei ole
selaimen osoiteriviä eikä takaisin-painiketta, joten asiakirja avautui
näkymään, josta ei päässyt pois muuten kuin sulkemalla koko sovellus.

PDF siirtyi osoitteeseen `.../esikatselu/pdf`, ja `.../esikatselu` on nyt
sovelluksen sivu, jolla on aina tie takaisin. Asiakirja näytetään siinä
upotettuna `object`-elementissä — ei `iframe`, koska `object` näyttää
varatekstin, jos selain ei osaa näyttää PDF:ää; tyhjä laatikko ei kertoisi
mitään.

**Ensimmäinen yritys oli väärä.** Jätin sivulle linkin `target="_blank"` ja
kirjoitin ohjeeksi, että erillisestä näkymästä pääsee pois sen omalla
Valmis- tai ✕-painikkeella. Jukan puhelimessa sellaista painiketta ei ole
lainkaan: *"vasemmassa yläkulmassa on sivunumerointi, ei muuta."* Ohje oli
siis väärä, ja umpikuja oli edelleen olemassa.

Linkki on nyt **lataus** (`download`) eikä avaus. Lataus ei korvaa näkymää,
joten umpikujaa ei voi syntyä: asiakirja menee laitteen tiedostoihin ja
sovellus jää auki siihen mihin se jäi.

Opetus, joka kannattaa muistaa muissakin kohdissa: käyttöjärjestelmän omaan
näkymään ei voi lisätä omaa takaisin-painiketta, eikä sen olemassaoloon voi
luottaa. Jos sovelluksesta poistutaan, siitä on päästävä takaisin ilman
sovelluksen sulkemista.


## Katselmus kuvataan huoneittain, ei kohta kerrallaan (2026-09-11, Jukan linjaus)

*"Alkukatselmuksessa sen verran, että voit ohjeistaa ottamaan kuvia
huoneittain, mutta älä pakota ottamaan kuvia mistään tietystä kohdasta, vaan
molemmat osapuolet saavat ottaa haluamansa kuvat."*

Ohjeteksti on Jukan sanamuoto ja se näkyy jokaisessa huoneessa:

> Ota yleiskuva huoneesta ja lisäksi niistä kohdista, joiden kunnon haluat
> muistaa riitojen välttämiseksi.

Ohjeessa on sekä tekeminen että syy. Syy on tärkeämpi: se on ainoa, minkä
vuoksi kukaan jaksaa kuvata kotiaan.

**Kuva kiinnittyy huoneeseen, ei checkpointiin.** Migraatio 0005 lisää
`rs_photos.room`-sarakkeen. Huoneluettelo on kulkureitti asunnon läpi, ei
tarkistuslista: mitään ei voi merkitä tehdyksi, mikään ei laske
"tekemättömiä", eikä mikään tarkista onko jostakin kuva. Vanha malli olisi
johtanut siihen, mihin pitkät lomakkeet aina johtavat — loppupää kuitataan
katsomatta.

Huoneella on **vihjelista** siitä, mitä siinä yleensä kannattaa katsoa. Ne
ovat tekstiä eivätkä ruutuja. Ne ovat siellä, koska silikonisaumat tulevat
mieleen vasta kun joku mainitsee ne.

**Itse lisätty tila ei vaadi riviä mihinkään.** Se syntyy siitä, että joku
kuvaa sen: huoneluettelo on oletushuoneet plus ne, joista on kuvia. Tyhjä
lisätty huone ei ole mitään, joten sitä ei tarvitse tallentaa.

**Kuvalla on vapaaehtoinen selite** (Jukan lisäys): miksi juuri tämä kohta
kuvattiin. Kenttä on lomakkeella kameran yläpuolella, koska asunnossa
seisten kukaan ei palaa kirjoittamaan selitettä jälkikäteen. Pakollinen
kenttä tuottaisi tekstejä kuten "ok", ja tyhjä selite on rehellisempi kuin
merkityksetön.

**Pöytäkirjassa ei ole tyhjiä kohtia.** Se kertoo mitä kuvattiin, ei sitä
mitä jäi kuvaamatta. Lista, jossa on kymmenen "ei kuvia" -riviä, näyttää
huolimattomalta katselmukselta, vaikka osapuolet olisivat kuvanneet juuri
sen, mikä heidän mielestään merkitsee.


## EXIF poistetaan palvelimella ja ilman kirjastoa (2026-09-12)

Selain poistaa EXIF:n jo pakatessaan kuvan canvasin kautta. Siihen ei
kuitenkaan luoteta: selaimessa ajettavan koodin voi ohittaa ja kuvan lähettää
rajapintaan sellaisenaan. Jos poisto olisi vain siellä, GPS-koordinaatit
olisivat tallessa aina kun joku niin haluaa.

Kuva kodista, jossa on koordinaatit, on eri asia kuin kuva kodista.
Vuokralainen ei ole antanut kotinsa sijaintia vuokranantajalle sillä, että
hän kuvasi keittiön lattian.

**Ilman `sharp`ia.** Se osaisi tämän, mutta on iso natiiviriippuvuus ja toisi
mukanaan kuvankäsittelyn, jota ei tarvita. `strip-metadata.ts` poistaa
tavutasolla JPEG:n APPn- ja COM-lohkot sekä PNG:n sivulohkot **sallittujen
listalla** (tuntematon lohkotyyppi on tuntematon eikä siksi luotettava).

Pikselit eivät muutu lainkaan. Se on tarkoitus: tiiviste lasketaan siitä
tiedostosta, joka tallennetaan, ja sen on oltava sama asiakirjassa ja
levyllä. Väriprofiili säilytetään — todistekuvassa väri on sisältöä.

**Lataus kulkee oman reitin kautta** eikä signed upload URL:lla, vaikka
CLAUDE.md mainitsee jälkimmäisen. Signed URL:lla tiedosto menisi suoraan
Storageen, eikä palvelin voisi poistaa metatietoja. Kuvat pakataan
selaimessa noin megatavuun, joten Vercelin 4,5 MB:n rungon raja riittää.


## Lukituksen ehto on vuokralaisen aito mahdollisuus (2026-09-12)

Vuokranantaja ei voi lukita katselmusta ennen kuin vuokralainen on joko
merkinnyt olevansa valmis tai hänen ensimmäisestä käynnistään on kulunut 24
tuntia.

Ilman tätä vuokranantaja voisi kuvata asunnon itse ja lukita sen ennen kuin
vuokralainen ehtii paikalle. Pöytäkirja kertoisi vain toisen osapuolen
näkemyksen — ja sellainen pöytäkirja on riidassa arvottomampi kuin ei mitään,
koska se näyttää yhteiseltä olematta sitä.

24 tunnin ehto ei ole porsaanreikä: laskuri alkaa vasta kun vuokralainen on
nähnyt näkymän, ja kahden vuokralaisen tapauksessa odotetaan hitainta.

Sääntö on **puhdas funktio** (`inspection/lock.ts`) ilman tietokantaa, jotta
se on luettavissa ja testattavissa kokonaan. Käyttöliittymä näyttää syyn eikä
piilota nappia: piilotettu nappi näyttäisi siltä, ettei ominaisuutta ole.


## Allekirjoituskierros: molemmat asiakirjat kerralla (2026-09-12)

Sopimus ja alkukatselmuksen pöytäkirja lähtevät samalla kierroksella, yhdellä
tunnistautumisella. Ne kuuluvat yhteen: sopimus kertoo mistä sovittiin,
pöytäkirja missä kunnossa koti oli silloin. Erikseen allekirjoitettuina
jälkimmäinen jäisi tekemättä.

**Kierrosta ei voi lähettää ennen kuin** katselmus on lukittu ja osapuolten
tiedot ovat kunnossa. Allekirjoituksen jälkeen sopimusta ei voi korjata.

**Tila luetaan eSinetiltä, ei peilata omaan kantaan.** Kuka on avannut, kuka
tunnistautunut — kaikki haetaan sivua ladattaessa. Vain `round.completed`
muuttaa omaa tilaa. Kahden totuuden ylläpito olisi pahin mahdollinen asia
juuri siinä kysymyksessä, kuka on allekirjoittanut.

**Käsittely on idempotentti.** eSinetti toistaa tapahtuman, jos vastauksemme
ei mennyt perille. Ilman idempotenssia toisto tuottaisi kaksinkertaiset
vuokrakaudet — eli vuokralaiselle kaksi laskua kuukaudessa.

Ensimmäinen toteutus oli tässä rikki, ja testi löysi sen: `signed_at`
kirjoitettiin asiakirjasilmukan sisällä, joten idempotenssin vahti riippui
siitä, tunnistettiinko asiakirjat. Tapahtuma, jonka asiakirjoja emme
tunnista — tai jossa niitä ei ole — ei jättänyt leimaa, ja jokainen toisto
olisi generoinut vuokrakaudet uudelleen. Kierros on valmis silloin kun se on
valmis, riippumatta siitä montako tiedostoa siitä osasimme lukea.

**Vuokrakaudet syntyvät vasta allekirjoituksesta**, ei sopimusta luotaessa:
ennen allekirjoitusta vuokra ja eräpäivä voivat vielä muuttua.


## Puuttuva migraatio näkyy testeissä nimeltä (2026-09-12)

Migraatiot ajetaan Supabasen SQL-editorissa käsin, eikä testiajo voi tehdä
sitä puolestaan. Ilman apua uuden sarakkeen varassa oleva testi kaatui
viestiin "kuvien haku epäonnistui", joka ei kerro lukijalle mitään siitä,
mikä oikeasti puuttuu.

`tests/migration-probe.ts` tarkistaa sarakkeen olemassaolon, ja testi
ohitetaan **näkyvästi**: konsoliin tulee rivi, joka nimeää migraation. Tämä
ei ole lupa jättää migraatioita ajamatta vaan tapa kertoa siitä selvästi
silloin, kun niin on käynyt.


## Sopimusluonnoksesta keskustellaan palvelussa, ei puhelimessa (2026-09-12)

CLAUDE.md 5.2 sanoo, että vuokralainen voi ehdottaa muutosta kommenttina.
Toteutin sen keskusteluna, jossa **kumpikin osapuoli saa kommentoida**:
yksisuuntainen kanava olisi outo, koska vuokranantajan on voitava vastata.

Kumpikin näkee keskustelun kokonaisuudessaan. Sama periaate kuin
kuittauksissa ja huoltokirjassa — kummastakaan osapuolesta ei puhuta hänen
selkänsä takana palvelun sisällä.

**Kommenttia ei voi poistaa.** Ei poisto-operaatiota eikä `deleted_at`-
saraketta. Jos kommentin voisi poistaa, keskustelu kertoisi vain sen, mitä
poistamatta jättänyt halusi sen kertovan — sama sääntö kuin katselmuksen
kuvilla.

**Liian pitkä kommentti katkaistaan 300 merkkiin eikä hylätä.** Hylkäys
hukkaisi kirjoitetun tekstin, ja raja on sama kuin muissa kommenttikentissä.

Vuokralainen ei edelleenkään muokkaa sopimusta. Hän kertoo mitä haluaisi
muuttaa; vuokranantaja muuttaa ehtoja ja esikatselu päivittyy. Muuten sopimus
voisi muuttua sen jälkeen, kun toinen on sen lukenut.


## "Ei kuulu tähän" on virheen korjaus, ei mielipide toisen kuvasta (2026-09-12)

Kuvaa ei voi poistaa kumpikaan osapuoli. Virheellisen kuvan voi merkitä, ja
merkintä näkyy molemmille sekä tulee pöytäkirjaan **kuvan viereen** — kuva
jää siis pöytäkirjaan merkittynä.

Siksi merkintää ei voi käyttää toisen havainnon hiljentämiseen: lukija näkee
sekä kuvan että merkinnän ja päättää itse. Lomake on suljettuna oletuksena ja
avautuu erikseen; se on tarkoituksella hieman hankalampi kuin kuvan
ottaminen.


## Kuittaus on merkintä, ei maksujärjestelmä (2026-09-12)

Reilusoppari ei näe tilitapahtumia eikä peri mitään. Kuittaus on
vuokranantajan oma merkintä siitä, tuliko vuokra — siis mielipide
tosiasiasta, ei tosiasia. Juuri siksi vuokralainen näkee sen ja voi
kommentoida.

Sanamuodot on valittu sen mukaan: **"Ei vielä" eikä "maksamatta".**
Ensimmäinen kuvaa hetkeä, jälkimmäinen ihmistä. Kuittaus voi olla väärässä —
maksu on voinut olla matkalla — ja sanamuodon on kestettävä se.

**Roolit eivät sekoitu.** Vain vuokranantaja kuittaa: hän on se, joka näkee
tilinsä. Vain vuokralainen kommentoi: kommentti on vastine, ei toinen
kuittaus. Jos kumpikin voisi tehdä molempia, historia ei kertoisi kumman
näkemys se on.

**30 päivän ikkuna lasketaan ensimmäisestä kuittauksesta**, ei viimeisestä
muutoksesta. Muuten merkintää voisi pitää auki loputtomiin muuttamalla sitä
kerran kuussa. Aikaraja on olemassa, koska vuokratodistus rakentuu näiden
merkintöjen varaan: jos vuosien takaisia kuittauksia voisi muuttaa, todistus
kertoisi siitä mitä vuokranantaja nyt ajattelee, ei siitä mitä silloin
tapahtui. Jokainen muutos menee `rs_audit_log`-tauluun.

**Osittainen maksu vaatii summan.** Ilman sitä "osittain" ei kerro mitään:
sekä 10 € että 840 € 850 eurosta olisivat "osittain". Nolla ohjataan
merkintään "Ei vielä" ja täysi summa merkintään "Kyllä" — kolme merkintää
riittää, kun ne tarkoittavat eri asioita.

**Ohje maksuvaikeuksista näytetään vuokralaiselle, ei vuokranantajalle.**
Kahden peräkkäisen "Ei vielä" jälkeen näkyy ohje ja linkki maksuttomaan
talous- ja velkaneuvontaan — eikä muuta. Ei muistutuksia, ei perintää, ei
merkintää mihinkään rekisteriin. Ohje on sille, joka sitä tarvitsee; se ei
ole vuokranantajalle tarkoitettu painostuskeino, eikä sen näkymistä siksi
kerrota hänelle.

**Osittainen maksu ei laske maksamattomuudeksi** ohjetta laskettaessa. Se on
yritys maksaa, ja sen kohteleminen maksamattomuutena olisi väärin sitä
kohtaan, joka yritti.


## Muistutusketju: merkintä ohjaa, ei kello (2026-09-12, Jukan linjaus)

Ohjelaatikko maksuvaikeuksista poistettiin sivulta. Tilalle tuli ketju, jonka
Jukka määritteli. Esimerkki, kun vuokra erääntyy kuun 5. päivä:

| Päivä | Kenelle | Mitä |
|---|---|---|
| 5. | — | Ei mitään. Maksu voi olla matkalla. |
| 8. | Vuokranantaja | "Tarkista vuokranmaksutilanne." |
| 8. | Vuokralainen | **Jos merkintä on "ei vielä"**: ystävällinen muistutus. |
| 15. | Vuokranantaja | Toinen tarkistuskierros. |
| 15. | Vuokralainen | **Jos yhä maksamatta**: napakka viesti ja ohje ottaa yhteyttä vuokranantajaan. |

**Muistutus seuraa merkintää eikä kelloa.** Vuokralaiselle ei lähde mitään
ennen kuin vuokranantaja on nimenomaisesti merkinnyt, ettei vuokraa ole
saatu. Aikaan perustuva muistutus tavoittaisi myös ne, jotka ovat maksaneet
ajallaan — ja perusteeton muistutus maksamattomasta vuokrasta on loukkaus, ei
palvelu.

Hinta on se, että jos vuokranantaja ei merkitse mitään, vuokralainen ei saa
muistutusta. Se on oikea suunta: palvelu ei väitä vuokralaisesta mitään, mitä
kukaan ei ole sanonut.

**Napakka viesti ei uhkaa.** Se ohjaa yhteen asiaan: ota yhteyttä
vuokranantajaan ja sopikaa. Ei perintää, ei rekisterimerkintää, ei ilmoitusta
kolmannelle. Testi hylkää viestin, jos siihen ilmestyy sana "perintä",
"luottotieto", "maksuhäiriö", "ulosotto" tai "irtisanominen".

**Osittainen maksu muistuttaa vain puuttuvasta osasta.** 850 euron vuokrasta
400 maksettuna muistutus koskee 450:tä eikä 850:tä.

Toiston esto on `dedupe_key`-sarakkeen uniikkirajoitteessa (migraatio 0007),
ja tunniste sisältää vastaanottajan: kahden vuokralaisen tapauksessa sama
viesti menee molemmille, eikä toinen saa jäädä ilman.


## Vuokranmaksun kolme luokkaa todistukseen (2026-09-12, Jukan linjaus)

> 1. Vuokra maksettu ensimmäisellä tarkastuksella (0–3 pv): **maksettu ajallaan**
> 2. Muistutuksen jälkeen: **vähän myöhässä mutta ok**
> 3. Muissa tapauksissa: **vuokranmaksu viivästynyt**

Rajat ovat samat kuin muistutusketjun rajat, eikä se ole sattumaa: "vähän
myöhässä mutta ok" tarkoittaa nimenomaan sitä, että vuokralainen hoiti asian
heti kun siitä huomautettiin. Jos rajat erkanisivat ketjusta, luokka
menettäisi merkityksensä.

Luokkia on kolme eikä viittä, koska todistuksen lukija tekee niiden
perusteella yhden päätöksen. Hienojakoisempi asteikko antaisi vaikutelman
mittaustarkkuudesta, jota tässä ei ole: tieto on vuokranantajan merkintä
siitä, milloin hän näki maksun tilillään.

**Uusi sarake `paid_at` (migraatio 0008).** `confirmed_at` on ensimmäisen
kuittauksen hetki eikä muutu — 30 päivän muutosikkuna lasketaan siitä.
Luokittelu tarvitsee eri tiedon: milloin merkintä muuttui maksetuksi. Ilman
omaa saraketta tieto olisi vain lokissa, ja loki on todiste tapahtumista, ei
tietolähde laskennalle.

Merkinnän muuttaminen ei siirrä maksupäivää: jos merkintä pysyy maksettuna,
aiempi `paid_at` säilyy. Jos se muuttuu pois maksetusta, `paid_at` nollataan.

**Yhteenveto kertoo luvut eikä tulkitse niitä.** "34 kuukaudesta 32 ajallaan"
on tosiasia, "erinomainen maksaja" on arvio — ja arvion antaa ihminen
suosituksellaan, ei palvelu laskutoimituksella.


## Tunnistevahti osui julkiseen avaimeen (2026-09-12)

`tarkista:tunnisteet` kaatui riviin, jossa luetaan
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Sääntö oli "mikä tahansa
`NEXT_PUBLIC_*KEY`", ja VAPIDin julkinen avain on tarkoituksella julkinen —
kuten Supabasen anon-avain ja Stripen publishable-avain.

Sääntö sanoo nyt sen, mitä se tarkoittaa: salaiselta kuulostava nimi
(`PERSON`, `SECRET`, `PRIVATE`, `SERVICE_ROLE`) ei saa olla
`NEXT_PUBLIC`-etuliitteen takana. Todennettu molempiin suuntiin.


## Ilmoituslupaa ei kysytä sivun latauksessa (2026-09-12)

Selain kysyy luvan vasta kun käyttäjä painaa nappia. Latauksessa kysytty lupa
on se, johon vastataan "estä" — ja estetty lupa on vaikea perua, koska
peruminen tapahtuu selaimen asetuksissa eikä sovelluksessa. Yksi harkitsematon
"estä" veisi ilmoitukset pysyvästi.

**iPhonella näytetään ohje, ei nappia.** Applen sääntö: selaimessa avattu
sivusto ei saa lähettää ilmoituksia lainkaan, vaikka käyttäjä antaisi luvan —
vasta kotivalikkoon lisätty sovellus voi. Nappi, joka ei voi toimia, on
pahempi kuin ei nappia.

**Kehotus näkyy vuokranmaksusivulla**, kun vuokrakausia on olemassa. Siinä
hetkessä ilmoituksilla alkaa olla merkitystä. Asennuskehotus tuntemattomasta
palvelusta ensimmäisellä kirjautumisella on se, joka suljetaan katsomatta.

**Vanhentunut tilaus siivotaan.** 404 ja 410 tarkoittavat, ettei tilaus ole
enää voimassa: selain on poistanut sen tai sovellus on poistettu laitteelta.
Sellaista ei yritetä loputtomiin. Muut virheet eivät kaada ajoa — yksi
rikkinäinen laite ei saa estää muiden ilmoituksia.


## Huoltokirja: merkintää ei poisteta, vain perutaan (2026-09-12)

Kumpi tahansa osapuoli kirjaa vian, korjauksen tai merkinnän, ja molemmat
näkevät kaiken. Huoltokirja on se, johon loppukatselmuksessa nojataan:
milloin vika ilmoitettiin, milloin se korjattiin, ja mitä siitä sanottiin
matkan varrella.

**Merkintää ei poisteta.** Virheellisen voi perua, ja peruminen näkyy:
merkintä jää listaan yliviivattuna ja syy tallentuu kommenttina, jonka
molemmat näkevät. Peruminen on merkinnän korjaamista, ei sen pyyhkimistä.

**Vain kirjoittaja voi perua oman merkintänsä.** Toisen merkinnän peruminen
olisi sen hiljentämistä, ja huoltokirjan arvo perustuu siihen, ettei kumpikaan
voi poistaa toisen havaintoa.

**Korjatuksi merkitseminen on vuokranantajan** — hän vastaa korjauksesta
(AHVL) ja tietää milloin se on tehty. Se ei kuitenkaan sulje keskustelua:
vuokralainen voi kommentoida senkin jälkeen, ja juuri se erimielisyys on se,
joka loppukatselmuksessa halutaan nähdä.

**Kuvat lisätään vasta tallennuksen jälkeen.** Kuvan lähetys kestää, ja jos
se epäonnistuisi kesken lomakkeen, myös kirjoitettu teksti katoaisi. Näin
teksti on tallessa heti ja kuvan voi yrittää uudelleen rauhassa.

Peruttuun merkintään ei voi lisätä kuvia: lukija ei tietäisi, koskeeko kuva
perumista edeltävää vai sen jälkeistä tilannetta.


## Satunnaisesti kaatuva testi: syy oli aikaraja (2026-09-12)

Testiajo kaatui kertaalleen aiemmin ilman selitystä, ja raportoin sen
avoimena. Syy selvisi, kun sama toistui: vitestin oletusaikaraja on 5
sekuntia, eikä se riitä live-Supabasea vasten ajettaville testeille. Yksi
testi tekee helposti kymmenen verkkokierrosta — käyttäjä, asunto,
vuokrasuhde, osapuolet — ja kun palvelu vastaa tavallista hitaammin, testi
kaatui ilman että mikään oli rikki.

Aikaraja on nyt 20 sekuntia koko ajolle (`vitest.config.mts`). Satunnaisesti
kaatuva testi on pahempi kuin hidas: se opettaa sivuuttamaan punaisen.

Todennettu kolmella peräkkäisellä ajolla: 331 testiä läpi joka kerta.


## Sähköposti on varakanava, ei rinnakkainen (2026-09-12)

Sähköposti lähtee vain silloin, kun push ei mennyt perille yhteenkään
laitteeseen — ei tilausta, vanhentunut tilaus tai epäonnistunut lähetys.
Molempien lähettäminen tarkoittaisi kahta ilmoitusta samasta asiasta, ja
Jukka linjasi tästä suoraan (2026-09-11):

> "Se ei ole hyvä ratkaisu, että vuokranantaja saa sähköpostin jossa
> pyydetään tarkastamaan vuokranmaksu. Heräte puhelimeen on parempi."

Sähköposti on siis sitä varten, ettei ilmoitus katoa kokonaan.

Viestissä ei ole painikkeita eikä kuittausta: kuittaus tehdään kirjautuneena,
koska se on merkintä, jonka toinen osapuoli näkee. Sähköpostissa on sama
teksti kuin ilmoituksessa ja linkki sovellukseen.

Ilman `RESEND_API_KEY`-avainta ei lähetetä mitään eikä kaaduta. Ilmoitus on
silti kirjattu, ja sovelluksessa se näkyy joka tapauksessa.


## Kulukysely korjauksen kuittaamisen yhteydessä (2026-09-12, Jukan pyyntö)

> "Kun vuokranantaja kuittaa vian hoidetuksi, voisi tulla kysely
> kustannuksista ja matkakuluista. Tässä vaiheessa laskut voi kuvata
> talteen. Ei näy tietenkään vuokralaiselle."

**Hetki on olennainen.** Kysely ilmestyy siinä hetkessä, kun vika merkitään
korjatuksi — se on ainoa hetki, jolloin kuitti on vielä taskussa ja
ajokilometrit muistissa. Keväällä veroilmoitusta tehdessä kumpikaan ei ole.

Lomake on suljettuna oletuksena: kaikista korjauksista ei tule kuluja, ja
aina auki oleva lomake olisi kysymys, johon vastataan ohittamalla.

**Matkakuluissa riittävät kilometrit.** Summa lasketaan verottajan taksalla
sen vuoden mukaan, jolle kulu kirjataan — laskelma tehdään usein seuraavana
keväänä, eikä silloin saa käyttää uutta taksaa vanhan vuoden ajoihin. Taksa
on siksi vuosikohtainen taulukko eikä yksi luku.

**Rajaus on asunnon omistajuudessa, ei osapuoliasemassa.** Tämä on koko
ominaisuuden tärkein kohta: vuokralainen on vuokrasuhteen osapuoli, joten
tavallinen osapuolitarkistus päästäisi hänet kuluihin. Kulut ja kuitit
rajataan `requireExpenseAccess`-tarkistuksella, joka kysyy asunnon
omistajuutta. Vuokralainen saa 404:n eikä "ei oikeutta" -sivua — hänen ei
kuulu tietää, että sivu on olemassa.

Kuitissa voi olla vuokranantajan kotiosoite, kortin loppunumerot tai muun
asunnon tietoja. Kuitti tallentuu `expense_id`-viitteellä, eivätkä katselmus-
ja huoltokirjanäkymät hae kuvia sillä viitteellä — kuitti ei siis voi
vahingossa päätyä pöytäkirjaan.

Kulu linkitetään huoltokirjan merkintään (`expense_id`), jotta
vuosilaskelmasta näkee mihin korjaukseen kulu liittyi. Linkki on kannassa
molempiin suuntiin, mutta huoltokirjan näkymä ei lue sitä — testi vartioi
tätä.

**Kululuokat ovat verottajan, eivät meidän.** Nimet ja jaottelu seuraavat
vuokratulon veroilmoituslomaketta, jotta rivit voi siirtää OmaVeroon ilman
tulkintaa. Rahastoitu rahoitusvastike, perusparannus ja korot on merkitty
erikseen: ne eivät ole vuosikuluja, ja jos ne summautuisivat muiden joukkoon,
laskelma olisi väärä juuri siinä kohdassa, jossa virhe maksaa.


## Vuokratodistukset: arviot, sinetöinti ja jakolinkit (2026-09-12)

**Todistus kuuluu sille, josta se kertoo.** `for_role` on todistuksen kohde,
ei sen kirjoittaja: vuokranantajan arvio päätyy vuokralaisen todistukseen, ja
vuokralainen jakaa sitä eteenpäin seuraavalle vuokranantajalle.

**Arvio on kaksiarvoinen.** "Suosittelen" tai "En anna arviota". Kielteistä
vaihtoehtoa ei ole (Jukan päätös 2026-09-10), eikä puuttuva arvio näy
todistuksessa mitenkään. Lomake sanoo sen ääneen — ilman sitä moni valitsisi
"en anna arviota" luullen sen olevan kohtelias tapa antaa kielteinen arvio.

**Kaksi määräaikaa, molemmat 7 päivää.** Arviolle allekirjoituksesta,
vastineelle arvion antamisesta. Määräajat ovat olemassa, jotta todistus
valmistuu: ilman niitä toinen osapuoli voisi jättää sen roikkumaan
loputtomiin olemalla tekemättä mitään — ja juuri silloin todistusta eniten
tarvitaan.

**Arviota ei voi muuttaa vastineen jälkeen.** Vastine on kirjoitettu siihen
arvioon, joka silloin oli; muuttaminen tekisi vastineesta käsittämättömän.

**Tilastot ovat tosiasioita, arvio on mielipide.** Luvut kootaan
kuittauksista (kolme maksuluokkaa), huoltokirjasta ja vakuuden palautuksesta.
Mitään ei syötetä käsin eikä mitään voi muokata. Peruttuja vikailmoituksia ei
lasketa: peruttu ilmoitus ei ole vika.

**Sinetöinti ei ole allekirjoitus.** Todistusta ei allekirjoita kukaan —
antaja on jo tunnistautunut vahvasti loppukatselmuksessa, eikä uutta
tunnistautumista pyydetä, koska se olisi este joka jättäisi todistukset
syntymättä. Sinetöinti kiinnittää sisällön.

**Vuokrasuhde on `certified` vasta kun molemmat todistukset on sinetöity.**
Yksi ei riitä: toisen osapuolen todistus on yhtä lailla osa päättymistä.


## QR-koodi ei voi sisältää asiakirjan omaa tiivistettä (2026-09-12)

Ensimmäinen versio sinetöinnistä yritti laittaa QR-koodiin osoitteen, jossa
on asiakirjan tiiviste. Se on mahdotonta: tiiviste lasketaan sisällöstä,
johon QR-koodi kuuluu — sisältö riippuisi omasta tiivisteestään.

Osoitteessa ei myöskään voi olla todistuksen tunnistetta: silloin kuka
tahansa linkin nähnyt pääsisi lukemaan todistuksen ilman jakolinkkiä, ja
tiivisteitä liikkuu sähköposteissa.

QR vie siis tarkistussivulle, jolla tiiviste syötetään käsin. Se on yksi
askel enemmän, mutta se on ainoa tapa, jossa tarkistus ei vaadi luottamusta
Reilusopparin linkkeihin. Tarkistuksen vastaus kertoo vain, onko asiakirja
sinetöity ja milloin — ei nimiä, ei osoitetta, ei arviota.

Jakaminen tapahtuu erikseen mitätöitävällä jakolinkillä, jonka tunniste
tallennetaan vain tiivisteenä. Linkki näytetään kerran: sitä ei voi katsoa
myöhemmin uudelleen, koska sitä ei ole missään. Katselukerrat näkyvät
omistajalle, ja jos niitä on enemmän kuin hän jakoi linkkejä, se on tieto,
jonka perusteella linkin voi mitätöidä.


## Pöytäkirjaan upotetaan pienoiskuva, ei täysikokoista kuvaa (2026-09-12)

Jukka kysyi kapasiteetista: 20 kuvaa sopimusta kohden, paljon käyttäjiä
yhtä aikaa, tavoitteena 5000 vuokrasopimusta vuodessa.

Käyttäjämäärä ei ole ongelma. 5000 sopimusta on ~14 päivässä, ja huippuina
kuunvaihteessa ehkä 150 — Vercelin funktiot ja Supabasen HTTP-rajapinta
kestävät sen ilman muutoksia. Tallennustila on ~125 GB vuodessa, mikä maksaa
kymppejä kuussa.

Vika oli asiakirjassa. Katselmuspöytäkirja upotti kuvat täydessä koossa
(2000 px), vaikka ne piirretään 158 × 96 pisteen kokoisina. Kahdenkymmenen
kuvan pöytäkirja olisi ollut noin 13 MB — yli `documents`-ämpärin 25 MB:n
rajan heti kun kuvia on 40, funktion muistin ja aikarajan äärellä, ja ikävä
lataus vuokralaisen puhelimeen mobiiliverkossa. Lisäksi kuvat ladattiin
Storagesta peräkkäin, mikä on kaksikymmentä sarjassa olevaa kierrosta ennen
kuin renderöinti alkaa.

**Ratkaisu:** selain tallentaa kuvasta myös pienoiskuvan (500 px) samalla kun
se pakkaa alkuperäisen, ja asiakirja upottaa sen. Lataukset menevät
kahdeksan rinnakkain. Pöytäkirja kutistuu ~13 MB:sta ~600 kt:aan.

**Miksi tämä ei heikennä todistusarvoa:** `sha256` lasketaan edelleen
täysikokoisesta tiedostosta, ja se on se tiiviste, joka pöytäkirjassa lukee.
Pöytäkirjan kuva on aina ollut pienennetty esitys siitä, mihin tiiviste
viittaa — täysikokoinen kuva on tallessa sovelluksessa. Pienoiskuvan
puuttuminen ei pudota kuvaa pöytäkirjasta: silloin upotetaan täysikokoinen
kuten ennen tätä otetuilla kuvilla.


## Kuitit eivät ole verolaskelman sisällä (2026-09-12)

CLAUDE.md 5.7 sanoo "liitteenä kuitit". Toteutin sen niin, että kuitit
säilyvät sovelluksessa ja sinetöidyssä laskelmassa kerrotaan niiden määrä.

Kaksi syytä. Vuoden kuitit ovat helposti 50 kuvaa, mikä upotettuna on
kymmeniä megatavuja — sama ongelma kuin pöytäkirjassa yllä, mutta pahempi,
koska kuitin tekstin on pysyttävä luettavana eikä pienoiskuva riitä.
Ja Verohallinto ei pyydä kuitteja veroilmoituksen liitteeksi: ne on
säilytettävä ja esitettävä pyydettäessä, mikä on juuri se mitä sovellus
tekee.

Tämä on poikkeama CLAUDE.md:n sanamuodosta. Jukka voi linjata toisin;
silloin kuiteille tarvitaan oma, isompi pienoiskuvakoko.


## Verolaskelma on asunnon eikä vuokrasuhteen (2026-09-12)

Yhdessä vuodessa voi olla kaksi vuokralaista peräkkäin, ja hoitovastike
juoksee myös tyhjän kuukauden yli. Vuokrasuhdekohtainen laskelma antaisi
kaksi puolikasta eikä yhtäkään, jonka voi siirtää OmaVeroon.

Siksi laskelma on asunnon alla, ja vuokratulo kootaan asunnon KAIKKIEN
vuokrasuhteiden kuittauksista. Pääsy on omistajatarkistuksen takana
(`requireExpenseAccess`), ei osapuolitarkistuksen — vuokralainen on
vuokrasuhteen osapuoli muttei näe kuluja eikä laskelmaa.

**Kuittaamaton kuukausi on nolla.** Ei oletusta koko vuokrasta: laskelma ei
saa kertoa tulosta, jota kukaan ei ole merkinnyt saaneensa. Se sanotaan
näkymässä ääneen, koska luku voi muuten näyttää liian pieneltä ilman että
syy näkyy.

**Uudelleensinetöinti on sallittu.** Kirjaus voi puuttua tai olla väärässä
luokassa, ja korjattu laskelma on parempi kuin väärä. Vanha korvautuu — kaksi
ristiriitaista laskelmaa samalta vuodelta olisi pahempi ongelma.


## Maksu on allekirjoituksen VIIMEINEN portti (2026-09-12)

`signingReadiness` tarkistaa ensin katselmuksen lukituksen ja osapuolten
tiedot, ja vasta viimeisenä maksun. Järjestys on tarkoituksellinen: rahaa ei
oteta ennen kuin kaikki muu on valmista. Jos maksu kysyttäisiin ensin,
käyttäjä voisi maksaa ja törmätä vasta sen jälkeen puuttuviin
osapuolitietoihin — ja maksu olisi tehty asiasta, jota ei voi vielä lähettää.

Ilmainen ensimmäinen, salkku ja krediitti merkitään kaikki samaan
`paid_via`-sarakkeeseen, joten yksi tarkistus riittää kaikkiin.

**Hinnoittelun järjestys: ilmainen → salkku → krediitti → maksu.** Jos
krediitti kuluisi ennen ilmaista ensimmäistä, käyttäjä menettäisi
suositteluetunsa siihen, mikä oli muutenkin ilmaista — ja huomaisi sen vasta
kun seuraava vuokrasuhde yllättäen maksaa.

**Käyttöoikeus myönnetään webhookissa, ei paluuosoitteessa.** `success_url` on
pelkkä uudelleenohjaus selaimessa; kuka tahansa voi avata sen ilman että
mitään on maksettu.

**Peruutusoikeus raukeaa allekirjoituskierroksen lähetyksessä.** Siinä
hetkessä vuokralaiselle lähtee kutsu ja tunnistautuminen maksaa. Suostumus
kysytään ENNEN maksua eikä kuitissa: kuluttajansuojalaki 6:14 vaatii, että
tieto oikeuden raukeamisesta on annettu ennen palvelun aloittamista.
Valintaruutu näytetään vain silloin, kun maksettavaa on — turha valintaruutu
opettaa klikkaamaan läpi lukematta.

**Krediitti syntyy vasta kun suositeltu lähettää ensimmäisen kierroksensa**,
ei rekisteröitymisestä. Rekisteröitymisestä palkitseminen tekisi tilien
luomisesta kannattavaa, ja silloin krediittejä kerättäisiin tekemällä tilejä.

**Stripe-kirjastoa ei oteta riippuvuudeksi.** Tuote tarvitsee neljä kutsua ja
HMAC-tarkistuksen; sama ratkaisu kuin eSinetti-clientissä ja samasta syystä.


## Yhteydenottoluvan omistajuus ja keskustelun näkyvyys (2026-09-12)

**Luvan antaa todistuksen KIRJOITTAJA, ei sen omistaja.** Vuokranantaja
kirjoittaa todistuksen vuokralaisesta; lupa siihen, että häneen saa ottaa
yhteyttä, on hänen omansa. Tämä on helppo sekoittaa, koska todistus on
vuokralaisen omaisuutta — siksi se on koodissa oma funktionsa (`issuerOf`)
eikä ehtolause.

**Omistaja näkee luvan tilan ennen kuin jakaa todistuksen.** Hänen on
tiedettävä, mitä hän jakaa.

**Kolme näkee, kaksi kirjoittaa.** Kysyjä ja luvan antaja keskustelevat. Se,
JOSTA keskustellaan, näkee keskustelun kokonaisuudessaan muttei kirjoita
siihen. Näkyvyys on tarkoituksellinen: vaihtoehto olisi ensimmäinen kohta
koko tuotteessa, jossa toisesta kerätään tietoa hänen tietämättään.
Kirjoitusoikeuden rajaus on yhtä tarkoituksellinen: jos kolmas voisi
kirjoittaa, keskustelu muuttuisi joksikin muuksi kuin miksi se luvattiin.

**Puuttuvasta luvasta kerrotaan ENNEN tunnistautumista.** Muuten ihminen
tunnistautuisi pankkitunnuksilla ja saisi vasta sen jälkeen kuulla, ettei
lupaa ole. Järjestys on `canOpenConversation`issa ja testattu erikseen.

**Peruminen sulkee keskustelut muttei poista viestejä.** Viestit jäävät
näkyviin myös sille, jota keskustelu koskee — poisto olisi tiedon vieminen
häneltä.

**Todistuksen id ei kulje osoitteissa.** Keskustelu avataan jakolinkin
tunnisteella, ja todistus ratkaistaan siitä palvelimella. Katselulaskuria ei
kasvateta keskustelua avattaessa: se ei ole todistuksen katselu.

**Sinetöimättömästä todistuksesta ei keskustella.** Sen sisältö voi vielä
muuttua, eikä keskustelu saa koskea jotain, mitä ei ole lyöty lukkoon.


## Toistuva kulu on kausi, ei tapahtuma (2026-09-12)

Jukan huomio: kulut kohdistuvat asuntoon riippumatta vuokralaisesta, ja
kuukausikulut kuten vastike pitäisi voida syöttää kerran niin että kone
laskee vuosikulut. Jos vastike muuttuu, siitä eteenpäin uusi kulu.

**Toistuva kulu on kuukausisumma ja väli, jolla se on voimassa.** Ei
kaksitoista kirjausta vuodessa: jokainen niistä olisi tilaisuus unohtaa yksi,
eikä unohdus näkyisi laskelmassa virheenä — se vain tekisi vuosikuluista
liian pienet.

**Muutos on uusi kausi, ei vanhan muokkaus.** Kun vastike nousee
maaliskuussa, tammi–helmikuu on maksettu vanhalla summalla. Jos summaa
muutettaisiin paikalleen, koko vuosi laskettaisiin uudella — ja vuosikulu
olisi väärä juuri siltä vuodelta, jolta se ilmoitetaan. Käyttöliittymässä ei
siksi ole muokkausnappia vaan "Summa muuttui".

**Takautuva muutos nykyisen kauden sisälle on estetty.** Se muuttaisi jo
lasketut vuodet, ja jos laskelma on ehditty sinetöidä, sinetöity ja näytöllä
näkyvä eroaisivat ilman että kumpikaan on väärin.

**Kuukausi on pienin yksikkö, ei päivä.** Vastike on kuukausimaksu: se joko
maksetaan siltä kuukaudelta tai ei. Päivätarkkuus pakottaisi keksimään
säännön sille, lasketaanko 15. päivä alkanut kuukausi — ja mikä tahansa
sääntö olisi väärä jossain tapauksessa.

**Ei `tenancy_id`-saraketta lainkaan.** Vastike juoksee tyhjän kuukauden yli
ja vuokralainen voi vaihtua kesken vuoden. Vuokrasuhteeseen sidottu toistuva
kulu katkeaisi vaihdon kohdalla ilman että kukaan huomaa.

**Yksi avoin kausi per sarja, tietokannan pakottamana.** Osittainen uniikki
indeksi (`where ends_month is null`). Kaksi avointa kautta laskisi saman
kuukauden kahdesti, eikä se näkyisi laskelmassa virheenä — vain liian
suurina vuosikuluina. Päättäminen tehdään ennen uuden luontia, koska aukko
on korjattavissa ja näkyy `seriesProblems`issa; kaksinkertainen kuukausi ei
näy mitenkään.

**Laskelmassa kuukaudet ja kirjaukset erikseen.** "12 kuukautta" ja "12
kirjausta" tarkoittavat eri asiaa. Jos ne näyttäisivät samalta, lukija ei
voisi tarkistaa kumpaakaan — hän ei tietäisi, onko vastike kirjattu kerran
kaudeksi vai kaksitoista kertaa.

**`rs_expenses.recurring_monthly` ja `recurring_until` poistettiin.** Ne
olivat migraatiosta 0001 asti, mutta mikään koodi ei koskaan kirjoittanut
niihin. Kahden tavan ilmaista sama asia on juuri sellainen epäselvyys, joka
tuottaa myöhemmin väärän summan.


## Kertakulu voidaan kirjata pelkälle asunnolle (2026-09-12)

Jatkoa toistuvien kulujen linjaukseen. Kertakulun kirjaaminen kulki yhä
vuokrasuhteen kautta, joten asunnon remonttia vuokralaisten välissä ei voinut
kirjata mihinkään. Se olisi pitänyt kirjata jonkun vuokralaisen alle — väärin
kahdesti: kulu näyttäisi liittyvän häneen, ja se kertoisi hänen
vuokrasuhteestaan jotain, mitä siihen ei kuulu.

`createPropertyExpense` kirjaa kulun asunnolle ilman vuokrasuhdetta.
Asunnon kululista näyttää MOLEMMAT — myös vuokrasuhteisiin kirjatut — koska
verolaskelma kokoaa ne yhteen asunnon kautta. Jos lista näyttäisi vähemmän
kuin laskelma, käyttäjä ei löytäisi riviä, jonka hän laskelmasta näkee.
Vuokrasuhteeseen kirjattu rivi on merkitty listalla.

**Kuitti tarvitsi oman migraationsa (0014).** `rs_photos.tenancy_id` oli
pakollinen, joten asunnon kulun kuitille ei ollut paikkaa. Nyt taulussa on
`property_id`, `tenancy_id` on valinnainen, ja check-rajoite vaatii
täsmälleen toisen. Jos molemmat voisivat olla tyhjiä, kuva jäisi ilman
omistajaa eikä näkyisi kenellekään; jos molemmat asetettuja, sama kuva
näkyisi kahdella eri säännöllä.

**Kuitti kirjataan sille kohteelle, jolle kulu on kirjattu.**
Vuokrasuhteeseen kirjatun kulun voi avata myös asunnon listalta, ja silloin
sen kuitti kuuluu samaan vuokrasuhteeseen kuin kulu — muuten sama kulu
näkyisi kahdella eri rajauksella.

**Toistuvat kulut eivät ole samassa listassa.** Hoitovastike on kausi eikä
kirjaus. Samassa listassa kausi näyttäisi yhdeltä kirjaukselta, ja lukija
luulisi vastiketta kertamaksuksi.


## Kuitin luku Anthropicin Messages API:lla (2026-09-12)

Jukalla on toinen järjestelmä (KasaMaster), joka lukee vaakalappuja samalla
rajapinnalla. Sen toteutus katsottiin läpi ja kolme kalliisti opittua asiaa
siirrettiin tänne sellaisenaan:

1. **Avain vain palvelimella.** KasaMasterissa kutsu tehtiin aluksi
   selaimesta avaimella, jonka nimi alkoi Viten etuliitteellä — ja Vite
   kirjoittaa sellaiset muuttujat käännösaikana selaimeen ladattavaan
   koodiin. Avain oli kenen tahansa luettavissa. Tässä `ANTHROPIC_API_KEY`
   luetaan vain palvelinpuolella, eikä `NEXT_PUBLIC_`-etuliitettä ole.
2. **`max_tokens` kattaa ajattelun JA vastauksen.** Uusissa malleissa
   ajattelu on oletuksena päällä, joten pelkälle JSON-vastaukselle riittävä
   arvo katkaisisi vastauksen kesken — usein niin, ettei tekstiä tulisi
   lainkaan. 1024 on sama arvo, jolla KasaMaster toimii.
3. **Tilakoodi virheviestiin.** Ilman sitä vianetsintä on arvailua: 401 on
   avain, 404 malli, 429 ruuhka.

**SDK eikä REST, poikkeuksena tämän repon tapaan.** Stripe puhutaan täällä
REST:llä ilman kirjastoa. Tässä otetaan `@anthropic-ai/sdk`, koska sen
`maxRetries` uusii 429-, 529- ja 5xx-tilanteet kasvavalla odotuksella — juuri
sitä logiikkaa ei kannata kirjoittaa itse maksavalle reitille — ja koska
Jukan toinen järjestelmä käyttää samaa kirjastoa, jolloin korjaus toiseen on
ymmärrettävissä toisessa.

**Kululuokkaa EI lueta kuitilta.** Raja vuosikorjauksen ja perusparannuksen
välillä on verotuksellinen arvio, ja väärin esitäytetty luokka siirtäisi
summan hiljaa väärään osioon laskelmassa — juuri siihen, jonka erottelun
rakensin erikseen. Malli lukee tosiasioita (summa, päivä, alv, myyjä), ihminen
tekee päätökset.

**Luettu arvo on ehdotus, ei tallennus.** Kentät ovat esitäytettyjä mutta
muokattavia, ja tallennus vaatii painalluksen. Jäsennys hylkää lisäksi arvon,
joka ei ole järkevä: negatiivinen summa, tulevaisuuden päivä, alv joka on
suurempi kuin summa. Tyhjä kenttä on rehellinen; väärä luku valuisi
verolaskelmaan asti.

**Kuva ei tallennu lukuvaiheessa.** Se pysyy selaimen muistissa, kunnes kulu
tallennetaan — muuten jokainen keskeytetty kuvaus jättäisi orvon tiedoston
Storageen. Hinta on se, että selaimen sulkeminen kesken kadottaa kuvan; kulku
on yksi näkymä, ja kuitti on yhä olemassa.

**Kuitti ensin, kulu sitten.** Vanha järjestys oli nurinkurinen: ensin
kirjattiin kulu ja sitten kuvattiin kuitti. Todellisuudessa kuitti on
kädessä.


## Kutsuraja (2026-09-12)

Kuitin luku on ensimmäinen reitti, jossa yksi kutsu maksaa suoraan oikeaa
rahaa. Kuvakoon raja rajoittaa yhden kutsun hintaa muttei kutsujen määrää.

`rs_kutsurajat` + `rs_kasvata_kutsuraja` (migraatio 0015), rivi per
(käyttäjä, endpoint, minuutti). Kasvatus tehdään tietokantafunktiossa, koska
kaksi rinnakkaista pyyntöä voisi muuten lukea saman luvun ja päättää
kumpikin, että tilaa on vielä yksi.

**Puuttuva raja on parempi kuin rikki oleva toiminto.** Jos tarkistus
epäonnistuu, kutsu päästetään läpi — vaihtoehto olisi, että tietokantahäiriö
estäisi kuvaamisen keskellä katselmusta. Mutta se kirjataan lokiin, koska se
tarkoittaa, ettei raja sillä hetkellä suojaa mitään. Sama linjaus kuin
KasaMasterissa.

Taulu on yhteinen kaikille rajoille: `endpoint` erottaa ne, joten CLAUDE.md
kohdan 6 vaatimat rajat kuvien lataukseen ja kutsulinkkeihin eivät tarvitse
uutta taulua.


## Kaksi vahtia avaimen vuotamista vastaan (2026-09-12)

Jukan linjaus: avain EI saa karata. Hanen toisessa jarjestelmassaan vuotanut
tunnus tuotti kerran kolminumeroisen laskun, ja syy oli Viten etuliite, joka
kirjoitti ymparistomuuttujan selaimeen ladattavaan koodiin.

Suojaus on kolmessa kerroksessa, ja ne on kaikki TESTATTU hälyttämään:

1. **Lahdekoodin vahti** (`tarkista-tunnisteet.mjs`) kieltaa kolme asiaa:
   palvelimen salaisuuden lukemisen selainkomponentissa, salaiselta
   kuulostavan nimen `NEXT_PUBLIC_`-etuliitteen takana, ja oikean avaimen
   nakoisen merkkijonon koodissa.
2. **Selainpaketin vahti** (`tarkista-selainpaketti.mjs`) lukee ne tiedostot,
   jotka selain oikeasti lataa, ja etsii niista avaimen muotoisia
   merkkijonoja. Tama on eri asia kuin edellinen: lahdekoodin vahti loytaa
   vain sen, minka tiedan vaaralliseksi. Tama katsoo lopputulosta ja
   loytaisi myos sen, mita en osannut odottaa.
3. **Kutsuraja** (20/min per kayttaja) ja pakollinen kirjautuminen rajaavat
   vahingon siina tapauksessa, etta avain silti paasee vuotamaan.

Neljas kerros on Jukan asettama kulutusraja Anthropicin konsolissa. Se on
ainoa suoja, joka toimii myos silloin, kun vika on koodissa.

**Saannolliset lausekkeet kirjoitettiin ilman kenoviivoja** (`[^A-Z_]`
sanarajan sijaan, `[.]` pisteen sijaan). Syy on konkreettinen: `` muuttui
tiedostoa muokatessa oikeaksi askelpalautinmerkiksi, ja vahti naytti
toimivalta halyttamatta koskaan. Rikkoutunut vahti on pahempi kuin ei
vahtia, koska siihen luotetaan.


## Omien tietojen vienti zipinä (2026-09-12)

CLAUDE.md kohta 2 lupaa sen ja tietosuoja-asetuksen 20 artikla vaatii sen.
Toteutus oli tekemättä.

**ZIP kirjoitetaan käsin ilman kirjastoa.** Sama peruste kuin metatietojen
poistossa ja Stripe-liitännässä: muoto on pieni ja tarkasti määritelty.
Tarvittava osa on kolme tietuetta, ja pakkaus tulee Noden omasta `zlib`:stä.

**Testit avaavat tiedoston Pythonin `zipfile`-moduulilla.** Itse kirjoitetun
ja itse luetun tiedoston pyöräytys ei todistaisi mitään: sama väärinkäsitys
olisi molemmissa päissä, ja testi menisi läpi vaikka tiedosto ei avautuisi
millään oikealla ohjelmalla. `testzip()` tarkistaa myös jokaisen tiedoston
CRC:n.

**Henkilötunnus tulee peitettynä.** Vaikka se on käyttäjän omaa tietoa ja hän
on siihen oikeutettu, paketti päätyy lataushakemistoon salaamattomana.
Kokonainen tunnus siellä olisi uusi riski ilman uutta hyötyä: käyttäjä tietää
oman tunnuksensa jo, ja kokonaisena se on sopimuksessa, joka on paketissa
mukana. **Tämä on kirjattava tietosuojaselosteeseen.**

**Vain OMA todistus.** Toisen osapuolen vuokratodistus on hänen omaisuuttaan
ja hän päättää kenelle se näytetään (CLAUDE.md 5.8). Sen liittäminen
pakettiin olisi kiertotie sen ympäri.

**Paketti kulkee Storagen kautta, ei vastauksena.** Kuvineen se on kymmeniä
megatavuja ja ylittäisi funktion vastauksen koon. Paketti tallennetaan
käyttäjän omaan polkuun ja hänet ohjataan tunnin voimassa olevaan
allekirjoitettuun osoitteeseen. Edellinen paketti korvautuu joka viennillä.

**Tiedossa oleva raja:** paketti kootaan muistissa, joten hyvin suuri tili voi
osua funktion aika- tai muistirajaan. Jos siihen törmätään, ratkaisu on
pakettien jakaminen vuokrasuhteittain eikä muistin kasvattaminen.

**Kutsuraja 3/tunti.** Vienti lukee kaikki käyttäjän kuvat ja asiakirjat; se
on raskain yksittäinen toiminto koko sovelluksessa. Rajan tarkoitus ei ole
rajoittaa oikeutta omiin tietoihin vaan estää sen käyttäminen
kuormitusvälineenä.

**Lukuohje paketin juuressa.** Zip, jossa on pelkkiä JSON-tiedostoja, on
kirjanpitäjälle käyttökelpoinen ja kaikille muille läpinäkymätön.


## Säilytysaika: sääntö nyt, poisto myöhemmin (2026-09-12)

CLAUDE.md kohta 2: vuokrasuhteen tiedot ja kuvat säilytetään kolme vuotta
päättymisestä, sitten poistetaan; todistukset ja tiivisteet pysyvästi.
Toteutus oli tekemättä.

**Sääntö on kirjoitettu ja testattu, poistoa ei ole.** Poisto on
peruuttamaton, ja ensimmäinen poistettava rivi syntyy aikaisintaan 2029 —
kiirettä ei ole, mutta sääntö on lupaus tietosuojaselosteessa, ja lupaus
jonka toteutusta ei ole edes suunniteltu on tyhjä.

Käytössä on `npm run raportti:sailytys`, joka kertoo mitä poistettaisiin jos
poisto ajettaisiin nyt. Raportti tuo säännön sovelluskoodista eikä kirjoita
sitä uudelleen: kaksi kopiota ajautuisi erilleen, ja silloin raportti
näyttäisi eri asiaa kuin mitä poisto tekisi — pahin mahdollinen tilanne
peruuttamattomassa toiminnossa.

**Poistettavien luettelo on nimenomainen eikä "kaikki paitsi".** Jos uusi
taulu unohtuisi lisätä, nimenomaisesta listasta se jäisi poistamatta ja
säilyisi liian kauan. Päinvastainen virhe poistaisi sen, mitä ei saa
poistaa — ja todistus on toisen ihmisen ansio, jota hän voi tarvita vielä
vuosien päästä.

**Kolme vuotta lasketaan kalenterista eikä 1095 päivänä.** Karkausvuosi
tekisi päivälaskennasta epätarkan, ja epätarkkuus olisi käyttäjän tappioksi:
tiedot poistuisivat päivää liian aikaisin.

**Päättymätön vuokrasuhde ei ole koskaan poistokelpoinen**, kesti se kuinka
kauan tahansa. Sama koskee rikkinäistä päivämäärää: epäselvässä tapauksessa
säilytetään.


## Painikepalaute ja sivunvaihdon palkki (2026-09-12)

Jukan havainto: napit eivat reagoi tarpeeksi nopeasti, eika mikaan kerro
osuiko painallus vai onko sovellus jumissa.

Syita oli kaksi. Napeilla ei ollut lainkaan painallustilaa — painettu nappi
nayttti tasmalleen samalta kuin painamaton. Ja sivut renderoidaan
palvelimella, joten linkin painamisen ja uuden nakymän valissa on
verkkopyynto, jonka aikana mikaan ei liikkunut.

**`:active`-tila on pelkkaa CSS:aa tarkoituksella.** Se reagoi samalla
millisekunnilla eika odota JavaScriptin latautumista. Se ei nopeuta mitaan;
se kertoo etta painallus rekisteroityi. Odottaminen on siedettavaa,
epatietoisuus ei.

**`loading.tsx` kokeiltiin ja hylattiin.** Se olisi ollut Next.js:n oma
ratkaisu ja yksinkertaisempi, mutta se rikkoi suojattujen sivujen
uudelleenohjauksen: streamattu sivu ei voi enaa asettaa vastauksen
tilakoodia, joten `/asunnot` palautti kirjautumattomalle 200:n
latausnakymalla eika 307:aa kirjautumiseen. Suojaus sailyi, mutta vastaus
oli huonompi — ja e2e-testi huomasi sen.

Vaihtoehto olisi ollut siirtaa suojaus middlewareen, mutta middleware sanoo
nimenomaisesti ettei suojaus ole siella, ja syy on kirjattu: osa reiteista
on tarkoituksella julkisia. Arkkitehtuuria ei muuteta latausilmeen takia.

**`NavigationProgress` ei koske reittien vastauksiin.** Se kuuntelee
linkkien painalluksia selaimessa ja piilottaa palkin kun osoite vaihtuu.
Palkki liikkuu tasaisesti eika tayty: emme tieda kauanko palvelimella
kestaa, eika palkki saa vaittaa tietavansa. Ajastin piilottaa sen
viimeistaan 15 sekunnissa, jottei peruuntunut sivunvaihto jata sita
ruudulle nayttamaan jumilta.

Samalla loytyi kaksi nappia ilman odotustilaa: katselmuksen "Kuvaa tama
tila" ja todistuksen jakolinkin "Mitatoi".


## Salkkutilaus (2026-09-12)

Vaiheen 5 viimeinen kesken ollut osa. Laskenta oli valmiina; käyttöliittymä
ja tilauksen hallinta puuttuivat.

**Salkkua ei tarjota, jos se on käyttäjälle kalliimpi.** Vertailu tehdään
TOTEUTUNEELLA käytöllä: montako vuokrasuhdetta viimeisen vuoden aikana ja
monestako asunnosta laskelma on tulostettu. Tämä on se kohta, jossa oma etu
ja käyttäjän etu ovat eri suuntiin, ja siksi se on testattu tiheimmin.

**Molemmat luvut näytetään, ei pelkkää säästöä.** "Säästät salkulla" on
väite, jonka voi vain uskoa tai olla uskomatta. Luvut rinnakkain on laskelma,
jonka voi tarkistaa. Näkymä kertoo myös mistä luvut tulevat, jotta käyttäjä
voi olla eri mieltä, jos hän tietää suunnitelmistaan jotain mitä historia ei
kerro.

**Kun salkku ei kannata, se kerrotaan silti.** Vaihtoehto — jättää asia
mainitsematta — tarkoittaisi, että käyttäjä kuulee salkusta vasta kun se
sattuu olemaan meille edullista.

**Asuntomäärän muutosta EI päivitetä automaattisesti.** Salkun hinta riippuu
asuntojen määrästä, ja hiljainen päivitys olisi veloitus, jota käyttäjä ei
ole hyväksynyt. Ero näytetään ja päivitys on yhden napin takana. Siihen asti
tilauksen ulkopuoliset asunnot laskutetaan vuokrasuhteittain.

**Salkkutilaus ei kuluta peruutusoikeutta.** Toisin kuin kertamaksu, tilaus
laskutetaan kaudittain ja sen voi irtisanoa asiakasportaalista, joten
suostumusta palvelun välittömään aloittamiseen ei kysytä.

**Laskut ja maksutapa hoidetaan Stripen asiakasportaalissa.** Niitä ei
rakenneta tänne: maksuvälineen käsittely omassa käyttöliittymässä
tarkoittaisi korttitietojen kulkemista tämän palvelun läpi.

**Toiminnot eivät ota lomakedataa.** Asuntomäärä, tilaus ja hinta luetaan
palvelimella; lomakkeesta tuleva luku olisi selaimen kertoma, eikä sellaista
haluta hinnoitteluun. Siksi ne ovat tavallisia funktioita eivätkä
`useActionState`-toimintoja, ja odotustila hoidetaan `useTransition`illa.

**Tilauksen määrä päivitetään omaan kantaan heti, ei vain webhookista.**
Webhook on lopullinen totuus, mutta se voi tulla sekuntien päästä — ja siihen
asti näkymä näyttäisi, ettei painallus tehnyt mitään. Webhook kirjoittaa
saman arvon uudelleen, joten kahta totuutta ei synny.


## Vakuuden palautusosio ei ehdota vähennystä (2026-09-12)

CLAUDE.md 5.8 vaatii loppupöytäkirjaan vakuuden palautusehdotuksen ja
perusteet huoltokirjasta. Osio puuttui kokonaan.

**Perusteet tulevat huoltokirjasta eivätkä kuluista.** Loppupöytäkirjan
allekirjoittavat molemmat osapuolet, joten se on vuokralaiselle näkyvä
asiakirja — ja kulut ovat vuokranantajan kirjanpitoa, rajattuna asunnon
omistajuuden kautta koko sovelluksessa. Korjauksen hinnan liittäminen
tähän vuotaisi kulutiedon reittiä, jota kukaan ei tarkista. Rakenteessa ei
siksi ole kenttää summalle lainkaan, ja testi tarkistaa sen.

**Palvelu ei ehdota vähennystä.** Se ei voi tietää, kuuluuko avoin vika
vuokralaisen vastuulle vai tavanomaiseen kulumiseen — se on osapuolten
sovittava ja tarvittaessa tuomioistuimen ratkaistava. Pöytäkirja kokoaa sen,
mikä on kirjattu: vakuuden määrä ja avoimet vikailmoitukset ajankohtineen.
Lähtökohdaksi sanotaan täysi palautus.

**Molempien osapuolten kirjaamat viat ovat mukana.** Vain toisen
huomioiminen tekisi pöytäkirjasta yksipuolisen listan. Korjattu vika ja
peruttu ilmoitus jäävät pois: edellinen on hoidettu, jälkimmäinen ei ole
vika lainkaan.

**Vuokranantajan kirjaama vähennysehdotus jätettiin tekemättä.** Se vaatisi
oman sarakkeen ja ennen kaikkea juridisen sanamuodon tarkistuksen:
vähennysehdotus yhteisesti allekirjoitetussa asiakirjassa on oikeudellinen
kannanotto, ja sen muotoilu on CLAUDE.md kohdan 9.4 mukaan Jukan vastuulla.

Sanamuodot ovat `DEPOSIT_TEXTS`-vakiossa yhdessä paikassa juuri siksi, että
ne on helppo löytää ja korjata.
