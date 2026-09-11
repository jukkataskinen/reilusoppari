# DECISIONS — reilusoppari (sovellus)

Päätökset, jotka eivät ole CLAUDE.md:n alkuperäisessä tekstissä tai jotka
muuttavat sitä. Uusin ensin.

---

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
