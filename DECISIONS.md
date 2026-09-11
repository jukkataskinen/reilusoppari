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
