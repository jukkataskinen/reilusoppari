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
| eSinetin `POST /documents/render` | **valmis** (esinetti `96b4dd3`) | vaihe 1 |
| eSinetin `POST /documents/seal` | **valmis** (esinetti `96b4dd3`) | vaiheet 3 ja 4 |
| Migraatio `0009` live-Supabaseen | odottaa Jukkaa | `/documents/seal` ajossa |
| eSinetti-tenant `reilusoppari` + API-avain | odottaa Jukkaa | oikea eSinetti-yhteys (mock riittää siihen asti) |
| Supabase, Auth0, Vercel, Stripe, VAPID | odottaa Jukkaa | vaihe 0:n DoD |

Mock-toteutus `lib/esinetti/`:ssä tarkoittaa, että vaiheet 0–1 etenevät ilman
eSinetti-tunnuksia. Vasta oikea läpivienti vaatii ne.

---

## Vaihe 0 — Runko

DoD: kirjautuminen onnistuu, asunnon luonti toimii, mock-render palauttaa PDF:n.

- [ ] `npx create-next-app` (TypeScript, App Router, Tailwind) ja perussiivous
- [ ] shadcn/ui käyttöön, perusteemat Reilusopparin paletilla (ks. sivuston
      `globals.css`: ink/sky/coral/paper/cloud/moss — sama paletti, sama fontti)
- [ ] **Mobiili ensin:** perusnäkymät suunnitellaan 390 px leveydelle
- [ ] PWA: manifest, service worker, ikonit, asennettavuus
- [ ] Supabase-projekti kytketty, `src/lib/db/` clientit (anon + service)
- [ ] Migraatio `0001_initial.sql`: kaikki `rs_`-taulut, RLS päälle,
      `rs_is_party(tenancy_id)` -funktio, eksplisiittiset GRANTit
- [ ] Storage-bucketit `photos` ja `documents`, molemmat private
- [ ] Auth0 passwordless (sähköpostikoodi), molemmat roolit, ei salasanoja
- [ ] `rs_users`-rivin luonti ensimmäisellä kirjautumisella
- [ ] `lib/esinetti/`: rajapinta + **mock** + oikea client (render, seal,
      rounds, verify, webhookit)
- [ ] `templates/`-hakemisto ja `npm run templates:push` -skripti
- [ ] Asunnon luonti (`rs_properties`) ja lista
- [ ] Oletus-checkpointien generointi asuntotyypin mukaan (kohta 5.3)
- [ ] CI: lint, typecheck, unit, e2e
- [ ] `.env.example` kaikilla muuttujilla selityksineen

## Vaihe 1 — Sopimus, katselmus, allekirjoitus

Polut 5.1–5.4. DoD: e2e-alkukaari mockilla läpi.

- [ ] Vuokrasuhteen luonti: vuokralaisen nimi ja sähköposti, alkupäivä, vuokra,
      eräpäivä, vakuus
- [ ] **Ilmoitus loppuarviosta** luontinäkymässä ja kutsulinkin takana
      (DECISIONS.md: tämä ei saa tulla yllätyksenä lopussa)
- [ ] Sopimuslomake `vuokrasopimus_asuinhuoneisto`-schemalla
- [ ] Esikatselu PDF:nä eSinetin `/documents/render`-kutsulla
- [ ] Kutsulinkki vuokralaiselle, `rs_tenancy_parties` + token
- [ ] Vuokralaisen liittyminen: kirjautuminen, sopimusluonnos, kommentointi
- [ ] Alkukatselmus: checkpoint-lista huoneittain, kummankin oma kuvausnäkymä
- [ ] **Kumpi tahansa voi lisätä oman kohtansa** (`added_by_user_id`) ja kuvata
      ilman checkpointia — oletuslista on muistin tueksi, ei rajoite
- [ ] Kuvan otto selaimessa, pakkaus asiakaspäässä, signed upload URL
- [ ] Palvelin: EXIF pois (myös GPS), `taken_at_server`, SHA-256, `rs_photos`
- [ ] Katselmuksen lukitus — **lukitusnappi estetty** kunnes vuokralainen on
      valmis tai 24 h kulunut hänen ensimmäisestä kirjautumisestaan
- [ ] Katselmuspöytäkirjan renderöinti: kohta, kuvat, kuvaaja, aika, tiiviste;
      pöytäkirjasta käy ilmi kumpi lisäsi kohdan ja kumpi otti kuvan
- [ ] Allekirjoituskierros eSinettiin: kaksi asiakirjaa, 2–3 allekirjoittajaa
- [ ] Webhook `round.completed`: sinetöidyt PDF:t, `identity_verified_at`,
      tenancy → `active`, `rs_rent_periods` generoidaan
- [ ] e2e mockilla: asunto → vuokrasuhde → kutsu → kuvat → lukitus → allekirjoitus

## Vaihe 2 — Kuittaus ja huoltokirja

Polut 5.5–5.6. DoD: kuittaus toimii pushista ja sähköpostista, historia näkyy molemmille.

- [ ] Web push (VAPID), tilaus ja vastaanotto PWA:ssa
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
- [ ] Arviot: **`recommend` tai ei arviota** — kielteistä vaihtoehtoa ei ole
- [ ] Vastine 7 päivän kuluessa; todistus syntyy aina
- [ ] **Puuttuva suositus ei näy todistuksessa mitenkään** — ei tyhjää kohtaa,
      ei mainintaa, ei eri asettelua (DECISIONS.md: tämä on päätöksen ydin)
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

---

## Jukan tehtävät

Ks. `BLOCKERS.md` kohta 4. Nämä eivät ole Claude Coden tehtävissä.
