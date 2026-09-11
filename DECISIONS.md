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
