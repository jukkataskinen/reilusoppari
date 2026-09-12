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

- [ ] Web push (VAPID), tilaus ja vastaanotto PWA:ssa
- [ ] **iPhone: ohjaus kotivalikkoon lisäämiseen** siinä hetkessä, kun
      ilmoituksilla alkaa olla merkitystä (vuokrasuhde aktivoituu). Ilman
      sitä iPhone ei näytä ilmoituksia lainkaan — Applen sääntö
- [ ] Sähköposti varakanavana (Resend)
- [ ] Cron: eräpäivänä klo 9 Europe/Helsinki, muistutus 3 pv myöhemmin
- [ ] Kuittaus: Kyllä / Ei vielä / Osittain + summa, muutettavissa 30 pv
- [ ] Vuokralaisen näkymä ja kommentti (300 merkkiä)
- [ ] Kaksi peräkkäistä "Ei vielä" → ohje ja linkki neuvontaan, ei muuta
- [ ] Huoltokirja: vikailmoitus kuvineen, kommentit, korjatuksi merkintä
- [ ] Merkintöjä ei poisteta; virheellinen merkitään "peruttu" molempien nähden

## Vaihe 3 — Päättyminen ja todistukset

Polku 5.8. DoD: koko e2e-kaari läpi.

- [ ] Irtisanomisen kirjaus, tila `ending`
- [ ] Loppukatselmus samoista kohdista, alkukuvat rinnalla
- [ ] Loppupöytäkirja: vakuuden palautusehdotus ja perusteet huoltokirjasta
- [ ] Allekirjoitus eSinetissä, tila `ended`
- [ ] Vakuuden palautuksen kirjaus (pvm, summa)
- [x] Vuokratodistus (`src/documents/TenancyCertificate.tsx`): molemmat roolit,
      QR-aitoustarkistus, tilastot ilman luottotietosanastoa
- [ ] Arviot: **`recommend` tai ei arviota** — kielteistä vaihtoehtoa ei ole
- [ ] Vastine 7 päivän kuluessa; todistus syntyy aina
- [x] **Puuttuva suositus ei näy todistuksessa mitenkään** — toteutettu ja
      testattu pikselitasolla: paneelin taustaväriä ei ole sivulla lainkaan,
      kun suositusta ei ole (DECISIONS.md: tämä on päätöksen ydin)
- [ ] `stats` kuittauksista ja katselmuksista
- [ ] Sinetöinti eSinetin `/documents/seal`-kutsulla
- [ ] Jakolinkit (30 pv, mitätöitävissä), katselukerrat omistajalle näkyviin

## Vaihe 4 — Plus

Polku 5.7. DoD: laskelma vuodelle testidatasta, sinetöity, kuitit liitteenä.

- [ ] Kulurivit luokittain (kohta 5.7), kuitti kuvana
- [ ] Toistuvat kulut, matkat km-taksalla (`content/tax-rates.ts`)
- [ ] Vuokratulo kuittauksista (Kyllä + Osittain)
- [ ] Vuosilaskelma OmaVeron kenttien järjestyksessä, kuitit liitteenä
- [ ] Sinetöinti, ensimmäinen tulostus laukaisee Plus-maksun
- [ ] Ohjetekstit luokan vieressä; jokaisessa "ei veroneuvontaa"

## Vaihe 5 — Laskutus, suosittelu, salkku

- [ ] Stripe Checkout + Customer Portal
- [ ] Tuotteet `tenancy_29`, `plus_yearly`, `portfolio_yearly`
- [ ] Ensimmäinen vuokrasuhde ilmainen (`free_tenancy_used`)
- [ ] Suosittelu ja krediitit (`rs_referrals`, `rs_credits`)
- [ ] Salkkutilaus 5+ asunnolle
- [ ] Kuluttajakauppa: tilausvahvistus, peruutusoikeus 14 pv ja sen menetys
      nimenomaisella suostumuksella

## Vaihe 6 — Yhteydenottolupa (lisäominaisuus)

Polku 5.10. DoD: kysyjä pääsee keskusteluun vasta tunnistauduttuaan,
yhteystiedot eivät paljastu, vuokralainen näkee keskustelun.

- [ ] Lupa todistuksen luonnissa, näkyy omistajalle ennen jakamista
- [ ] Jakolinkin "Kysy lisää" → kirjautuminen → vahva tunnistautuminen
- [ ] Tunnistautuminen **kerran per henkilö** (`identity_verified_at`)
- [ ] Keskustelu portaalissa, ei yhteystietoja kummallekaan
- [ ] Vuokralainen näkee keskustelun kokonaisuudessaan
- [ ] Luvan peruminen sulkee avoimet keskustelut, rajat ja loki

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
