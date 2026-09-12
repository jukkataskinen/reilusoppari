# PLAN — reilusoppari (sovellus)

Tehtävälista `CLAUDE.md`:n kohdasta 8. Yksi rivi per noin 1–3 tunnin tehtävä.
Työskentelyprotokolla: `esinetti`-repon `CLAUDE.md` kohdat 0 ja 0.1 — lue ne
ennen aloitusta ja noudata sellaisenaan.

Merkitse `[x]` vasta kun tehtävä on kokonaan tehty: koodi + testit + migraatio
+ dokumentaatio, ja `npm run lint && npm run typecheck && npm run test` on
vihreä.

**Tavoite: lanseeraus lokakuussa 2026, täysi laajuus.** Jos aikataulu venyy,
tekstit muutetaan silloin — laajuutta ei karsita etukäteen.

---

## Riippuvuudet muualta

| Mitä | Tila | Estää |
|---|---|---|
| ~~eSinetin `POST /documents/render`~~ | **ei käytössä** — Reilusoppari renderöi itse | – |
| eSinetin `POST /documents/seal` | **valmis** (esinetti `96b4dd3`) | vaiheet 3 ja 4 |
| Migraatio `0009` live-Supabaseen | odottaa Jukkaa | `/documents/seal` ajossa |
| eSinetti-tenant `reilusoppari` + API-avain | odottaa Jukkaa | oikea eSinetti-yhteys (mock riittää siihen asti) |
| ~~Migraatio `0009`~~ tarvitaan yhä | odottaa Jukkaa | `/documents/seal` (allekirjoittamattomat todistukset) |
| Supabase, Auth0, Vercel, Stripe, VAPID | odottaa Jukkaa | vaihe 0:n DoD |

Mock-toteutus `lib/esinetti/`:ssä tarkoittaa, että vaiheet 0–1 etenevät ilman
eSinetti-tunnuksia. Vasta oikea läpivienti vaatii ne.

---

## Vaihe 0 — Runko

DoD: kirjautuminen onnistuu, asunnon luonti toimii, mock-render palauttaa PDF:n.

- [x] Next.js-runko (TypeScript, App Router, Tailwind v4), turvaotsakkeet
- [x] Paletti ja fontti sivustolta (`globals.css`, Plus Jakarta Sans itse
      hostattuna) — shadcn/ui lisätään kun ensimmäinen lomake tarvitsee sen
- [x] **Mobiili ensin:** 390 px perusleveys, kosketuskohde 44 px, zoomaus sallittu
- [x] CSP noncella ja `strict-dynamic`, Permissions-Policy (kamera sallittu,
      paikannus ei), 9 yksikkötestiä + e2e-savutesti tuotantokäännöstä vasten
- [x] PWA: service worker, kuvakkeet (192/512/maskable/apple-touch),
      manifest, offline-sivu. **HTML:ää ei välimuistiteta koskaan** —
      sivut sisältävät vuokrasuhteen tietoja. Pohja sovelluskaupoille,
      ks. vaihe 7
- [x] Supabase kytketty: `src/lib/db/supabase.ts` (service + anon) ja
      `src/lib/db/access.ts` (osapuolirajaus yhdessä paikassa), 4
      IDOR-integraatiotestiä live-kantaa vasten
- [x] Migraatio `0001_initial.sql`: 23 taulua, RLS, `rs_is_party`, GRANTit —
      **ajettu live-Supabaseen ja RLS todennettu oikealla rivillä**
- [x] Storage-bucketit `photos` ja `documents` (migraatio `0002`), private,
      kokorajat ja MIME-tyypit tietokannan tasolla
- [x] Auth0 passwordless (`connection=email`, `ui_locales=fi`, PKCE) —
      `/auth/login` ohjaa oikein Auth0:aan; selainläpivienti Jukan testattava
- [x] `rs_users`-rivin luonti ensimmäisellä kirjautumisella (`session.ts`,
      upsert `auth0_sub`-avaimella)
- [x] `lib/esinetti/`: rajapinta + **mock** + oikea client (render, seal,
      rounds, verify, webhookit) — 29 yksikkötestiä. Mock tuottaa aidon
      avautuvan PDF:n, joten vaiheet 0–1 etenevät ilman eSinetti-tunnuksia
- [x] ~~`templates/` ja `templates:push`~~ → **korvattu**: Reilusoppari tekee
      PDF:nsä itse (DECISIONS.md 2026-09-11). `src/documents/`: React-PDF,
      fontit, teema, deterministinen renderöinti ja 5 testiä
- [x] Asiakirjat `src/documents/`: **vuokrasopimus** ja **katselmuspöytäkirja**
      (alku ja loppu). Kuvitus Jukan luonnoksen mukaan; pöytäkirjassa ei
      kuvitusta, koska siinä kuva on todiste. Juridinen sisältö Jukan
      tarkistettavana
- [x] Asunnon luonti (`rs_properties`) ja lista: lomake, listaus, asunnon
      näkymä kohtalistoineen, arkistointi. 6 IDOR-integraatiotestiä ja 9
      lomaketestiä
- [x] Oletus-checkpointien generointi asuntotyypin ja huoneluvun mukaan,
      10 yksikkötestiä
- [x] CI: lint, typecheck, unit, build, e2e, audit + kaksi tarkistusta:
      selainpaketissa ei salaisuuksia, koodissa ei hetu-viittauksia
- [x] `.env.example` kaikilla muuttujilla selityksineen

## Sovelluksen ilme — Jukan havainto 2026-09-11

Ensimmäinen puhelintesti tuotannossa: *"Brändäystä puhelinnäkymäkin vaatii
vaikka olikin ihan siisti."*

Sovelluksessa ei ole tällä hetkellä tunnusta lainkaan — asiakirjoissa ja
sivustolla on merkki, tunnuslause ja väripaletti, mutta sovelluksen näkymät
ovat pelkkää tekstiä. Tehtävä:

- [x] Sovelluksen ylätunniste: merkki ja nimi, sama kuin asiakirjoissa
- [x] Navigaatio puhelimessa alalaidassa, työpöydällä ylätunnisteessa
- [x] Aloitussivu: kirjautumattomalle esittely, kirjautuneelle tilannekuva
- [x] ~~Kirjautumisnäkymän ilme~~ — Auth0:n kirjautumissivu on nyt suomeksi,
      logolla ja Reilusopparin väreillä (2026-09-11)

## Vaihe 1 — Sopimus, katselmus, allekirjoitus

Polut 5.1–5.4. DoD: e2e-alkukaari mockilla läpi.

- [x] Vuokrasuhteen luonti: vuokralaisen nimi ja sähköposti, alkupäivä, vuokra,
      eräpäivä, vakuus. 1–2 vuokralaista, määräaikainen tai toistaiseksi
- [x] **Ilmoitus loppuarviosta** luontinäkymässä ja kutsulinkin takana —
      sama komponentti kaikissa kolmessa paikassa, jottei teksti erkaannu
- [x] Sopimuslomake: irtisanomisaika, vuokrankorotusehto, avaimet, tupakointi,
      lemmikit, vesi ja sähkö, muut ehdot. Vain vuokranantaja muokkaa
- [x] Esikatselu PDF:nä omalla renderöijällä. Päiväys on vuokrasuhteen
      alkupäivä eikä kuluva päivä, jotta esikatselun tiiviste on vakaa
- [x] Kutsulinkki vuokralaiselle, `rs_tenancy_parties` + token. Tunniste vain
      tiivisteenä, uudelleenlähetys mitätöi vanhan, sähköpostin on täsmättävä
- [x] Vuokralaisen liittyminen: julkinen kutsusivu, kirjautuminen, liittyminen
- [x] Vuokralaisen näkymä sopimusluonnokseen
- [x] Vuokralaisen kommentointi sopimukseen — kumpikin osapuoli kommentoi,
      kumpikin näkee kaiken, kommenttia ei voi poistaa
- [x] Osapuolten tunnistetiedot: henkilö- tai y-tunnus, puhelin, sähköposti,
      maksutili. Tunnus salattuna, näytöllä aina peitettynä
- [x] Omat perustiedot, jotka kopioituvat uuteen vuokrasuhteeseen
- [x] **Alkukatselmus huoneittain** — huoneluettelo on kulkureitti, ei
      tarkistuslista. Kuvaa ei vaadita mistään tietystä kohdasta
      (Jukan linjaus 2026-09-11)
- [x] **Kumpi tahansa voi kuvata tilan, jota listalla ei ole.** Lisätty tila
      syntyy siitä, että joku kuvaa sen — erillistä riviä ei luoda
- [x] Kuvan vapaaehtoinen selite: miksi juuri tämä kohta kuvattiin
- [x] Kuvan otto selaimessa, pakkaus asiakaspäässä (max 2000 px)
- [x] Palvelin: EXIF pois (myös GPS) ilman kirjastoa, `taken_at_server`,
      SHA-256 tallennetusta tiedostosta, `rs_photos`
- [x] Katselmuksen lukitus — **lukitusnappi estetty** kunnes vuokralainen on
      valmis tai 24 h kulunut hänen ensimmäisestä käynnistään
- [x] Katselmuspöytäkirjan renderöinti huoneittain: kuvat, selite, kuvaaja,
      aika, tiiviste. Kuvaton tila jätetään pois. Täydet tiivisteet omalla
      sivullaan
- [x] Allekirjoituskierros eSinettiin: kaksi asiakirjaa, 2–3 allekirjoittajaa
- [x] Webhook `round.completed`: sinetöidyt PDF:t, `identity_verified_at`,
      tenancy → `active`, `rs_rent_periods` generoidaan. Idempotentti
- [ ] e2e mockilla: asunto → vuokrasuhde → kutsu → kuvat → lukitus → allekirjoitus
- [x] Kuvan merkintä "ei kuulu tähän" — kuva ei poistu, merkintä näkyy
      molemmille ja tulee pöytäkirjaan kuvan viereen

## Vaihe 2 — Kuittaus ja huoltokirja

Polut 5.5–5.6. DoD: kuittaus toimii pushista ja sähköpostista, historia näkyy molemmille.

- [x] Web push (VAPID): tilaus selaimessa, service workerin push-käsittely,
      lähetys ja vanhentuneen tilauksen siivous
- [x] **iPhone: ohjaus kotivalikkoon lisäämiseen** vuokranmaksusivulla, kun
      vuokrakausia on olemassa. Nappia ei näytetä siellä missä se ei voi
      toimia
- [x] Sähköposti varakanavana (Resend). Lähtee vain, jos push ei mennyt
      perille yhteenkään laitteeseen
- [x] Cron: päivittäin, tarkistuspyyntö vuokranantajalle 3 pv eräpäivästä ja
      toinen kierros 10 pv. Muistutus vuokralaiselle vain merkinnän
      perusteella (Jukan linjaus 2026-09-12)
- [x] Vuokranmaksun luokittelu todistusta varten: ajallaan / vähän myöhässä
      mutta ok / viivästynyt
- [x] Kuittaus: Kyllä / Ei vielä / Osittain + summa, muutettavissa 30 pv.
      Ikkuna lasketaan ensimmäisestä kuittauksesta, muutokset lokiin
- [x] Vuokralaisen näkymä ja kommentti (300 merkkiä)
- [x] Muistutusketju: 8. pv tarkistuspyyntö vuokranantajalle, 15. pv toinen
      kierros. Vuokralaiselle muistutus vain merkinnän perusteella — ensin
      ystävällinen, sitten napakka ja ohje sopia vuokranantajan kanssa.
      (Korvasi aiemman "ohje ja linkki neuvontaan", Jukan linjaus 2026-09-12)
- [x] Huoltokirja: vikailmoitus kuvineen, kommentit, korjatuksi merkintä.
      Merkintää ei poisteta — virheellisen voi perua, ja peruminen näkyy
- [x] Merkintöjä ei poisteta; virheellinen merkitään "peruttu" molempien nähden

## Vaihe 3 — Päättyminen ja todistukset

Polku 5.8. DoD: koko e2e-kaari läpi.

- [x] Irtisanomisen kirjaus, tila `ending`. Irtisanomisaika lasketaan
      kuukauden viimeisestä päivästä (AHVL), ja päivä näytetään ennen
      vahvistusta
- [x] Loppukatselmus samoista tiloista, alkukuvat rinnalla
- [x] Loppupöytäkirja: vakuuden palautusosio ja perusteet huoltokirjasta
- [ ] Vuokranantajan kirjaama vähennysehdotus — vaatisi oman sarakkeen JA
      juridisen sanamuodon tarkistuksen (Jukka): vähennysehdotus
      yhteisesti allekirjoitetussa asiakirjassa on oikeudellinen kannanotto
- [x] Allekirjoitus eSinetissä, tila `ended` (webhook)
- [x] Vakuuden palautuksen kirjaus (pvm, summa)
- [x] Vuokratodistus (`src/documents/TenancyCertificate.tsx`): molemmat roolit,
      QR-aitoustarkistus, tilastot ilman luottotietosanastoa
- [x] Arviot: **`recommend` tai ei arviota** — kielteistä vaihtoehtoa ei ole
- [x] Vastine 7 päivän kuluessa; todistus syntyy aina
- [x] **Puuttuva suositus ei näy todistuksessa mitenkään** — toteutettu ja
      testattu pikselitasolla: paneelin taustaväriä ei ole sivulla lainkaan,
      kun suositusta ei ole (DECISIONS.md: tämä on päätöksen ydin)
- [x] `stats` kuittauksista ja huoltokirjasta, vakuus päättymisestä
- [x] Sinetöinti eSinetin `/documents/seal`-kutsulla (mockia vasten)
- [x] Jakolinkit (30 pv, mitätöitävissä), katselukerrat omistajalle näkyviin
- [x] Julkinen aitoustarkistus tiivisteellä, ei paljasta sisältöä

## Vaihe 4 — Plus

Polku 5.7. DoD: laskelma vuodelle testidatasta, sinetöity, kuitit liitteenä.

- [x] Kulurivit luokittain (kohta 5.7), kuitti kuvana
- [x] Kertakulu myös ilman vuokrasuhdetta, suoraan asunnolle (migraatio 0014)
- [x] Kuvaa kuitti: kuva → luku Messages API:lla → asunnon valinta →
      esitäytetty lomake (migraatio 0015, kutsuraja)
- [x] Toistuvat kuukausikulut kausina: syötetään kerran, kone laskee
      vuosikulun; summan muutos aloittaa uuden kauden (Jukan linjaus
      2026-09-12, migraatio 0013)
- [x] Matkat km-taksalla (`content/tax-rates.ts`)
- [x] Vuokratulo kuittauksista (Kyllä + Osittain)
- [x] Vuosilaskelma OmaVeron kenttien järjestyksessä
- [x] Sinetöinti (mockia vasten), uudelleensinetöinti korvaa vanhan
- [x] Ohjetekstit luokan vieressä; jokaisessa "ei veroneuvontaa"
- [ ] Kuitit liitteenä — **toteutettu toisin**: kuitit säilyvät sovelluksessa
      ja laskelmassa kerrotaan niiden määrä (DECISIONS.md 2026-09-12)
- [ ] Ensimmäinen tulostus laukaisee Plus-maksun — odottaa vaihetta 5
- [ ] Ohjetekstien tarkistus (Jukka, `content/tax-guidance.fi.ts`)

## Tietosuoja ja kuormituksen rajaus

CLAUDE.md kohta 6. Nämä eivät ole oma vaiheensa vaan velvoitteita, jotka
kuuluvat valmiiseen tuotteeseen.

- [x] Kutsuraja kuvien lataukseen, 100/h/käyttäjä (migraatio 0015)
- [x] Kutsuraja kuitin luvulle, 20/min — ainoa reitti jossa kutsu maksaa rahaa
- [x] Omien tietojen vienti zipinä (tietosuoja-asetus art. 20)
- [x] Kaksi vahtia avaimen vuotamista vastaan: lähdekoodi ja selainpaketti
- [ ] Kutsulinkkien kutsuraja — vaatii IP-kohtaisen rajan, jota nykyinen
      käyttäjäkohtainen taulu ei ilmaise. Tunnus on 256-bittinen ja
      tiivisteenä, joten arvaaminen ei ole realistinen uhka; kyse olisi
      kuormituksen rajaamisesta
- [x] Säilytysajan sääntö kirjoitettu ja testattu (`lib/retention/rules.ts`)
- [x] Kuivaharjoitus: `npm run raportti:sailytys` kertoo mitä poistettaisiin
- [ ] Poiston käyttöönotto — odottaa Jukan katsausta. Poisto on
      peruuttamaton, ja ensimmäinen poistettava rivi syntyy aikaisintaan 2029
- [ ] Tietosuojaselosteeseen maininta viennin peitetystä henkilötunnuksesta
      ja kuitin käsittelystä palvelun ulkopuolella (Jukka)

## Vaihe 5 — Laskutus, suosittelu, salkku

- [x] Stripe Checkout + Customer Portal (REST-rajapinta, ei kirjastoa; mock
      ilman avainta samalla säännöllä kuin eSinetti)
- [x] Tuotteet `tenancy_29`, `plus_yearly`, `portfolio_yearly`
- [x] Ensimmäinen vuokrasuhde ilmainen (`free_tenancy_used`)
- [x] Suosittelu ja krediitit (`rs_referrals`, `rs_credits`)
- [x] Salkkuhinnan laskenta ja rehellinen kannattavuusvertailu
- [x] Kuluttajakauppa: peruutusoikeus 14 pv ja sen menetys nimenomaisella
      suostumuksella; suostumus ehtona maksulle
- [x] Webhook allekirjoitustarkistuksella ja toiston estolla
- [x] Salkkutilaus: `/laskutus`, rehellinen vertailu toteutuneella käytöllä,
      asuntomäärän päivitys napin takana, Customer Portal laskuille
- [ ] Tilausvahvistus sähköpostiin — odottaa `RESEND_API_KEY`:tä
- [ ] Testaus Stripe test modessa — odottaa avaimia (Jukka)

## Vaihe 6 — Yhteydenottolupa (lisäominaisuus)

Polku 5.10. DoD: kysyjä pääsee keskusteluun vasta tunnistauduttuaan,
yhteystiedot eivät paljastu, vuokralainen näkee keskustelun.

- [x] Lupa todistuksessa, näkyy omistajalle ennen jakamista
- [x] Jakolinkin "Kysy lisää" → kirjautuminen → tunnistautumisen tarkistus
- [x] Tunnistautuminen **kerran per henkilö** (`identity_verified_at`)
- [x] Keskustelu portaalissa, ei yhteystietoja kummallekaan
- [x] Vuokralainen näkee keskustelun kokonaisuudessaan, muttei kirjoita siihen
- [x] Luvan peruminen sulkee avoimet keskustelut; rajat (`max_messages`)
- [ ] **Tunnistautumisen päätepiste puuttuu eSinetistä.** Sääntö on
      paikallaan ja testattu; kysyjä ei pääse keskusteluun ilman
      `identity_verified_at`:ia. Päätepisteen valmistuttua tarvitaan vain
      linkki tunnistautumiseen (BLOCKERS.md)
- [ ] Käyttöehtoihin maininta siitä, että keskustelu voi siirtyä puhelimeen
      eikä palvelu estä sitä (Jukka)

## Vaihe 7 — Sovelluskaupat (VALINNAINEN, ei lanseerauksen edellytys)

**Muutettu 2026-09-11:** Jukan korjaus — vaatimus ei ole sovelluskauppa vaan
ilmoitus puhelimeen, ja se onnistuu PWA:lla. iPhonella se vaatii, että
käyttäjä lisää sovelluksen kotivalikkoon; Androidilla toimii suoraan.
Ks. DECISIONS.md.

Tämä vaihe tehdään vain, jos PWA-push osoittautuu käytännössä riittämättömäksi.

DoD: sama koodi, kaksi julkaisua kaupoissa, kirjautuminen ja kamera toimivat
molemmissa.

- [ ] Capacitor-kuori olemassa olevan Next.js-sovelluksen ympärille
      (ei erillistä natiivikoodikantaa — yksi sovellus, kaksi pakkausta)
- [ ] Natiivikamera Capacitorin kautta: selaimen kameralla ei saa iOS:llä
      luotettavaa kuvanlaatua eikä taustalataus toimi
- [ ] Natiivipush (APNs ja FCM) web pushin rinnalle; **iOS-Safari-web push
      vaatii, että käyttäjä on lisännyt PWA:n kotivalikkoon** — kaupasta
      ladatussa sovelluksessa tätä ongelmaa ei ole
- [ ] Auth0-kirjautuminen kuoressa: universal links (iOS) ja App Links
      (Android), custom scheme vain varalle
- [ ] Offline-tila: katselmuksen kuvat jonoon, lähetys kun verkko palaa
- [ ] Apple: tietosuojaseloste, "App Privacy" -lomake, ikärajaus
- [ ] Google Play: Data safety -lomake, arkaluonteisten lupien perustelu
- [ ] Kaupan kuvaukset ja kuvakaappaukset suomeksi
- [ ] Tilit: Apple Developer 99 $/v, Google Play 25 $ kertamaksu
      (`KUSTANNUKSET.md`)

## ~~Vaihe 7 vaikuttaa vaiheeseen 5~~ — ratkennut

Applen 15–30 %:n provisio digitaalisesta sisällöstä koski vain
sovelluskaupasta ladattua sovellusta. Kun kauppoja ei tarvita, Stripe riittää
eikä maksunäkymää tarvitse rakentaa kahdesti.

---

## Jukan tehtävät

Ks. `BLOCKERS.md` kohta 4. Nämä eivät ole Claude Coden tehtävissä.
