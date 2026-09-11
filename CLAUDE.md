# Reilusoppari – sovelluksen rakennusohje Claude Codelle

Tämä on repon `reilusoppari` `CLAUDE.md`. Reilusoppari on vuokranantajan ja vuokralaisen yhteinen sovellus koko vuokrasuhteen ajaksi. Se **ei toteuta tunnistusta, allekirjoitusta eikä sinetöintiä itse**, vaan käyttää eSinettiä API:n kautta (eSinetti-tenant `reilusoppari`). Työskentelyprotokolla, tietoturvakysymykset jokaiselle tehtävälle (kohta 0.1) ja `PLAN.md`/`DECISIONS.md`/`BLOCKERS.md`-käytäntö ovat **samat kuin `esinetti`-repossa** – lue sen `CLAUDE.md` kohdat 0 ja 0.1 ennen aloitusta ja noudata niitä sellaisenaan.

---

## 1. Tuote yhdellä kappaleella

Vuokranantaja luo asunnon ja vuokrasuhteen, täyttää huoneenvuokralain mukaisen sopimuksen lomakkeella ja kutsuu vuokralaisen. Ennen allekirjoitusta molemmat kuvaavat asunnosta ne kohdat, jotka itse katsovat tärkeiksi (alkukatselmus) – oletuslista on muistin tueksi, ei rajoite. Allekirjoitus on mahdollinen vasta kun kuvat on tallennettu ja katselmus lukittu. Sopimus ja katselmuspöytäkirja allekirjoitetaan pankkitunnuksilla eSinetin kautta yhdellä tunnistautumisella. Vuokrasuhteen aikana vuokranantaja kuittaa vuokran kerran kuussa ilmoituksesta, molemmat kirjaavat vikoja ja korjauksia huoltokirjaan kuvineen, ja vuokranantaja voi tallentaa kuluja verolaskelmaa varten (Plus). Vuokrasuhteen päättyessä tehdään loppukatselmus samoista kohdista, ja molemmat saavat sinetöidyn todistuksen. Vuokralainen ei maksa koskaan; ensimmäinen vuokrasuhde on vuokranantajalle ilmainen.

---

## 2. Lukitut päätökset

| Aihe | Päätös |
|---|---|
| Repo ja runko | `reilusoppari`, Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui, PWA (`next-pwa` tai manuaalinen manifest + service worker). Mobiili ensin: kaikki näkymät suunnitellaan 390 px leveydelle, työpöytä on laajennus. |
| Tietokanta | Oma Supabase-projekti (EU), taulut etuliitteellä `rs_`, RLS ja eksplisiittiset GRANTit. Storage-bucketit `photos` ja `documents`, molemmat private. |
| Kirjautuminen | Auth0 passwordless (sähköpostikoodi) molemmille rooleille. Ei salasanoja. Vuokralaiselle tili syntyy automaattisesti, kun hän avaa kutsulinkin; vahva henkilöllisyys tulee eSinetin tunnistuksesta allekirjoituksen yhteydessä ja tallennetaan tiliin (`identity_verified_at`, nimi, syntymäaika – ei hetua). |
| eSinetti-liitäntä | eSinetin REST-API tenantille `reilusoppari` API-avaimella. Käytettävät endpointit: `POST /rounds` (allekirjoituskierrokset), `GET /rounds/{id}`, download, `POST /documents/render` (HTML → PDF, tenantin pohjat), `POST /documents/seal` (sinetöinti ilman allekirjoittajia, audit-metadata), `GET /verify`. Webhookit kierrosten tiloista. **Nämä kaksi documents-endpointia lisätään eSinetin API:in** (ks. eSinetin CLAUDE.md, lisäys 5.6). Kaikki eSinetti-kutsut moduulissa `lib/esinetti/`, jolla on mock-toteutus testeihin. |
| Sopimus- ja pöytäkirjapohjat | eSinetin `sin_document_templates` tenantille `reilusoppari`: `vuokrasopimus_asuinhuoneisto`, `alkukatselmus`, `loppukatselmus`, `vuokratodistus_vuokralainen`, `vuokratodistus_vuokranantaja`, `verolaskelma`. Pohjien HTML ja schema ylläpidetään **tässä repossa** (`templates/`) ja synkronoidaan eSinettiin skriptillä `npm run templates:push`. Juridinen sisältö Jukan vastuulla; julkaisu vasta hyväksynnän jälkeen. |
| Kuvat | Otetaan selaimessa (`<input capture="environment">`), pakataan asiakaspäässä max 2000 px / ~1 MB, ladataan signed upload URL:lla. Palvelin poistaa EXIF:n (mukaan lukien sijainnin), tallentaa `taken_at_server = now()`, laskee SHA-256 tallennetusta tiedostosta ja kirjoittaa rivin `rs_photos`. Kuvaa ei voi muokata eikä poistaa kumpikaan osapuoli; virheellisen kuvan voi merkitä "ei kuulu tähän" molempien nähden. |
| Katselmuksen sitovuus | Alkukatselmus lukitaan ennen allekirjoitusta; lukituksen jälkeen kuvia ei voi lisätä siihen (uudet kuvat menevät huoltokirjaan). Katselmuspöytäkirja renderöidään PDF:ksi (kuvien pienoiskuvat + tiivisteet + huomautukset) ja allekirjoitetaan samassa kierroksessa sopimuksen kanssa. |
| Kuittaus | Vuokranantajan oma merkintä (Kyllä / Ei vielä / Osittain + summa), aikaleima, näkyy vuokralaiselle, joka voi kommentoida (300 merkkiä). Ei pankkiliittymää, ei perintää. Kaksi peräkkäistä "Ei vielä" → näytetään ohje ja linkki neuvontaan, ei muuta. |
| Todistus | **Molemmille kerrotaan jo vuokrasuhdetta luotaessa, että lopuksi kumpikin antaa toisestaan arvion ja saa oman todistuksensa** – tämä ei saa tulla yllätyksenä lopussa, ja se on osa sitä mihin allekirjoituksella sitoudutaan. Generoidaan loppukatselmuksen allekirjoituksen jälkeen, AINA (vastaanottaja ei voi estää syntymistä). Rakenteinen arvio on **kaksiarvoinen: `recommend` tai ei arviota** – kielteistä vaihtoehtoa ei ole, eikä todistukseen tule merkintää puuttuvasta suosituksesta (Jukan päätös 2026-09-10, ks. DECISIONS.md). Lisäksi 300 merkkiä vapaata tekstiä; vastaanottaja näkee sen ja voi liittää 300 merkin vastineen 7 päivän kuluessa; sitten sinetöidään (`/documents/seal`), ei uutta tunnistusta. Vuokralaisen todistus näkyy vain vuokralaiselle; hän jakaa sen allekirjoitetulla linkillä (30 pv, mitätöitävissä). Vuokranantajan todistus symmetrisesti. Sanasto: *vuokratodistus*, ei luottotieto/maksuhäiriö/maksumoraali. |
| Yhteydenottolupa todistuksessa (lisäominaisuus, vaihe 6) | Todistuksen antaja voi sallia, että uusi vuokranantaja voi kysyä häneltä lisää. Keskustelu käydään **portaalissa**, ei sähköpostissa: kysyjä kirjautuu ja tunnistautuu vahvasti (kerran per henkilö, `identity_verified_at`), eikä kummankaan yhteystietoja näytetä toiselle. Vuokralainen näkee keskustelun kokonaisuudessaan. Lupa peruttavissa milloin vain. Sivutuote: uusi vuokranantaja ohjautuu palveluun ja hänen ensimmäinen vuokrasuhteensa on ilmainen. Ks. kohta 5.10. |
| Plus (kulut ja verolaskelma) | Kuluriveillä luokat verottajan vuokratulolomakkeen mukaan (kohta 5.7). Vuosilaskelma renderöidään ja sinetöidään; veloitus 12 €/asunto/v vasta ensimmäistä laskelmaa tulostettaessa. Ohjetekstit Jukan kirjoittamia (`content/tax-guidance.fi.ts`). Ei veroilmoituksen lähetystä. |
| Laskutus | Stripe Checkout + Customer Portal (kuluttajat maksavat kortilla). Tuotteet: `tenancy_29` (kertamaksu, 29 € sis. ALV 25,5 %), `plus_yearly` (12 €/asunto/v), `portfolio_yearly` (15 €/asunto/v, vähintään 5 asuntoa). Ensimmäinen vuokrasuhde per vuokranantaja ilmainen (`rs_users.free_tenancy_used`). Suosittelu: kumpikin saa krediitin `rs_credits`, joka kuluu seuraavaan `tenancy_29`-maksuun. Kuluttajakauppa: tilausvahvistus sähköpostiin, peruutusoikeus 14 pv ellei palvelua ole aloitettu (allekirjoituskierros lähetetty = aloitettu; kerrotaan ennen maksua). |
| Ilmoitukset | Web push (VAPID) PWA:ssa, varakanavana sähköposti (Resend). Ei SMS:ää vaiheissa 1–4. Kuittausilmoitus eräpäivänä klo 9 Europe/Helsinki ja uudelleen 3 päivää myöhemmin, jos kuittaamatta. |
| Säilytys | Vuokrasuhteen tiedot ja kuvat säilytetään vuokrasuhteen päättymisestä 3 vuotta (yleinen vanhentumisaika), sitten poistetaan; todistukset ja tiivisteet pysyvästi. Molemmat osapuolet voivat viedä omat tietonsa zipinä milloin vain. |
| Kieli | UI suomi, `src/i18n/fi.ts`. Sävy kuten sivustolla: sinuttelu, rauhallinen, ei huutomerkkejä. |
| Hosting | Vercel (`app.reilusoppari.fi`). Ei omaa konttia – renderöinti ja sinetöinti eSinetissä. |

---

## 3. Käsitteet ja tilat

- **User** (`rs_users`): henkilö; sama henkilö voi olla vuokranantaja yhdessä ja vuokralainen toisessa vuokrasuhteessa.
- **Property** (`rs_properties`): asunto (osoite, tyyppi, huoneluku, pinta-ala, taloyhtiö, hallintamuoto). Omistaja = vuokranantaja-user. Salkkulaskutus perustuu näihin.
- **Checkpoint** (`rs_checkpoints`): kuvattava kohta asunnossa (esim. "Keittiö – lattia", "Kylpyhuone – silikonisaumat"). Oletuslista asuntotyypin mukaan; **kumpi tahansa osapuoli voi lisätä omia kohtiaan**, ja lisätty kohta on samanarvoinen oletuslistan kanssa.
- **Tenancy** (`rs_tenancies`, vuokrasuhde): tilat `draft → inspection → signing → active → ending → ended → certified`. Yksi property, yksi vuokranantaja, 1–2 vuokralaista.
- **Contract** (`rs_contracts`): sopimuksen lomaketiedot (`template_data`), eSinetin round id, sinetöidyn PDF:n viite.
- **Inspection** (`rs_inspections`): tyyppi `initial | final`, tila `open → locked → signed`, pöytäkirjan PDF-viite.
- **Photo** (`rs_photos`): inspection tai maintenance entry, checkpoint, uploader, polku, sha256, `taken_at_server`, huomautus, `flagged`.
- **Maintenance entry** (`rs_maintenance_entries`, huoltokirja): tyyppi `defect | repair | note`, kirjaaja, kuvat, kommentit, linkki kuluriviin.
- **Rent schedule / confirmation** (`rs_rent_periods`, `rs_rent_confirmations`): kuukausi, eräpäivä, summa, kuittaus, vuokralaisen kommentti.
- **Expense** (`rs_expenses`): property, päivä, summa, luokka, kuitti (photo), km-määrä matkoille, toistuvuus.
- **Tax report** (`rs_tax_reports`): property, vuosi, rivit, sinetöity PDF.
- **Certificate** (`rs_certificates`): tenancy, kenelle (`tenant | landlord`), rakenteinen arvio, kommentti, vastine, sinetöity PDF, jakolinkit.
- **Referral / Credit** (`rs_referrals`, `rs_credits`).
- **Push subscription** (`rs_push_subscriptions`).
- **Audit log** (`rs_audit_log`): kaikki osapuolten toimet, joilla on merkitystä riidassa (kuvan lisäys, lukitus, kuittaus, kommentti, jakolinkki).

---

## 4. Tietomalli (migraatio `0001_initial.sql`)

Kaikissa tauluissa `id uuid`, `created_at`, `updated_at`; RLS päällä; GRANTit eksplisiittisesti. Pääsysääntö: rivin näkee vain se, joka on kyseisen tenancyn osapuoli (`rs_tenancy_parties`) tai propertyn omistaja. Toteuta yhtenä SQL-funktiona `rs_is_party(tenancy_id)` ja käytä sitä kaikissa policyissä.

```sql
rs_users (id, auth0_sub unique, email, name, phone, birthdate date null,
          identity_verified_at timestamptz null, free_tenancy_used bool default false,
          stripe_customer_id, locale default 'fi')

rs_properties (id, owner_user_id fk, name, street, postal_code, city, property_type text
               check (property_type in ('kerrostalo','rivitalo','omakotitalo','muu')),
               rooms int, area_m2 numeric, housing_company text, tenure text
               check (tenure in ('osake','kiinteisto','muu')), archived_at)

-- added_by_user_id: kumpi osapuoli kohdan lisasi. NULL = oletuslistalta
-- generoitu. Vuokralaisen lisaama kohta on samanarvoinen (ks. DECISIONS.md).
rs_checkpoints (id, property_id fk, room text, item text, position int, active bool default true,
                added_by_user_id fk null, added_for_tenancy_id fk null)

rs_tenancies (id, property_id fk, landlord_user_id fk, status text, start_date date, end_date date null,
              rent_amount numeric, rent_due_day int, deposit_amount numeric, deposit_returned_at date null,
              deposit_returned_amount numeric null, notice_given_at date null, notice_by text null,
              paid_via text check (paid_via in ('free','tenancy_29','portfolio','credit')), stripe_payment_id)

rs_tenancy_parties (id, tenancy_id fk, user_id fk null, role text check (role in ('landlord','tenant')),
                    invite_email text, invite_token_hash text, invite_expires_at, joined_at, position int,
                    unique (tenancy_id, role, position))

rs_contracts (id, tenancy_id fk unique, template_key text, template_version int, template_data jsonb,
              esinetti_round_id text, esinetti_document_id text, sealed_sha256 text, sealed_path text,
              signed_at timestamptz)

rs_inspections (id, tenancy_id fk, kind text check (kind in ('initial','final')), status text,
                locked_at, locked_by fk, esinetti_round_id text, esinetti_document_id text,
                sealed_sha256, sealed_path, signed_at, summary jsonb, unique (tenancy_id, kind))

rs_photos (id, tenancy_id fk, inspection_id fk null, maintenance_entry_id fk null, expense_id fk null,
           checkpoint_id fk null, uploader_user_id fk, storage_path, sha256, bytes int, width int, height int,
           taken_at_server timestamptz default now(), note text, flagged_by fk null, flagged_reason text)

rs_maintenance_entries (id, tenancy_id fk, kind text check (kind in ('defect','repair','note')),
                        author_user_id fk, title, body, resolved_at, resolved_by fk, expense_id fk null)

rs_maintenance_comments (id, entry_id fk, author_user_id fk, body)

rs_rent_periods (id, tenancy_id fk, period_month date, due_date date, amount numeric, unique (tenancy_id, period_month))
rs_rent_confirmations (id, rent_period_id fk unique, confirmed_by fk, status text
                       check (status in ('paid','not_yet','partial')), amount_paid numeric null,
                       confirmed_at, tenant_comment text, tenant_commented_at)

rs_expenses (id, property_id fk, tenancy_id fk null, date date, amount numeric, vat_included bool default true,
             category text, description, km numeric null, recurring_monthly bool default false,
             recurring_until date null, receipt_photo_id fk null)

rs_tax_reports (id, property_id fk, year int, lines jsonb, rental_income numeric, total_expenses numeric,
                sealed_path, sealed_sha256, generated_at, paid_via text, unique (property_id, year))

rs_certificates (id, tenancy_id fk, for_role text check (for_role in ('tenant','landlord')),
                 -- Kaksiarvoinen: 'recommend' tai NULL (= ei suositusta). Kielteista arvoa
                 -- EI ole, eika NULL nay todistuksessa mitenkaan. Ks. DECISIONS.md.
                 rating text null check (rating in ('recommend')),
                 comment text, comment_by fk, comment_at, reply text null, reply_at,
                 reply_deadline timestamptz, sealed_path, sealed_sha256, sealed_at,
                 stats jsonb,             -- {"months": 24, "on_time": 22, "late_under_7d": 2, "unpaid": 0, "deposit_returned_full": true, "defects_resolved": "3/3"}
                 unique (tenancy_id, for_role))

rs_certificate_shares (id, certificate_id fk, token_hash, expires_at, revoked_at, viewed_count int default 0)

-- Yhteydenottolupa (lisaominaisuus, vaihe 6). Luvan antaa todistuksen ANTAJA,
-- ei sen omistaja. Yhteystietoja ei tallenneta tanne eika luovuteta eteenpain.
rs_certificate_contact (id, certificate_id fk unique, allowed_by_user_id fk,
                        allowed_at, revoked_at null, max_messages int default 3)

-- Keskustelu kaydaan portaalissa. Osallistujat ovat rs_users-rivaja, joilla
-- MOLEMMILLA on identity_verified_at - yhteystietoja ei tallenneta tanne eika
-- nayteta toiselle osapuolelle, vain tunnistautumisesta todennettu nimi.
rs_certificate_conversations (id, certificate_id fk, share_id fk null,
                              initiator_user_id fk, opened_at, closed_at null,
                              unique (certificate_id, initiator_user_id))

rs_certificate_conversation_messages (id, conversation_id fk, author_user_id fk,
                                      body text, sent_at, read_at null)

rs_referrals (id, referrer_user_id fk, referred_email, referred_user_id fk null, completed_at)
rs_credits (id, user_id fk, kind text, source_referral_id fk null, used_on_tenancy_id fk null, used_at)

rs_push_subscriptions (id, user_id fk, endpoint text unique, keys jsonb, user_agent, last_success_at)
rs_notifications (id, user_id fk, kind, payload jsonb, channel text, sent_at, opened_at)

rs_audit_log (id, tenancy_id fk null, actor_user_id fk null, action, target_type, target_id, details jsonb)
```

---

## 5. Toiminnalliset polut

### 5.1 Vuokranantajan aloitus
Passwordless-kirjautuminen → "Lisää asunto" (osoite, tyyppi, huoneet) → oletus-checkpointit generoidaan (kohta 5.3) → "Uusi vuokrasuhde": vuokralaisen nimi ja sähköposti, alkupäivä, vuokra, eräpäivä, vakuus → näkymässä kerrotaan selkeästi, että vuokrasuhteen päättyessä kumpikin antaa toisestaan arvion ja saa oman todistuksensa (sama teksti näytetään vuokralaiselle kohdassa 5.2, ja se toistetaan sopimuksen esikatselussa) → sopimuslomake (`vuokrasopimus_asuinhuoneisto`-schema: määräaikainen/toistaiseksi, irtisanomisaika, vuokrankorotusehto, vakuus, avaimet, tupakointi, lemmikit, vesi/sähkö, muut ehdot vapaatekstinä) → esikatselu PDF:nä (eSinetti `/documents/render`) → maksu tai ilmainen ensimmäinen → kutsu lähtee vuokralaiselle. Tila `inspection`.

### 5.2 Vuokralaisen liittyminen
Kutsulinkki → passwordless-kirjautuminen samalla sähköpostilla → näkee sopimusluonnoksen ja asunnon checkpointit → **näkee myös saman ilmoituksen loppuarvioista kuin vuokranantaja (kohta 5.1)** → voi kuvata heti. Vuokralainen voi ehdottaa muutosta sopimukseen kommenttina; vuokranantaja muokkaa ja esikatselu päivittyy. Kumpikaan ei allekirjoita ennen kuin alkukatselmus on lukittu.

### 5.3 Alkukatselmus
Checkpoint-lista huoneittain. Oletuslista asuntotyypin ja huoneluvun mukaan (esim. jokaiselle huoneelle lattia, seinät, ikkunat, ovi; keittiölle lisäksi tasot, kaapit, liesi, jääkaappi, astianpesukoneen liitäntä; kylpyhuoneelle lattiakaivo, silikonisaumat, hanat, wc-istuin, pesukoneliitäntä; yleisille avaimet, ovikello, palovaroitin, sauna).

**Oletuslista on muistin tueksi, EI rajoite (Jukan päätös, ks. DECISIONS.md).**
Kumpi tahansa osapuoli voi lisätä oman kohtansa (`rs_checkpoints.added_by_user_id`),
ja kuvan voi ottaa myös ilman checkpointia pelkällä huomautuksella
(`rs_photos.checkpoint_id = null`). Vuokralaisen lisäämä kohta on samanarvoinen
vuokranantajan lisäämän kanssa: se näkyy pöytäkirjassa samalla tavalla ja se
käydään läpi myös loppukatselmuksessa. Käyttöliittymä ei saa esittää
vuokranantajan listaa "oikeana" ja vuokralaisen lisäyksiä poikkeuksena.

Kummallakin osapuolella oma kuvausnäkymä: checkpoint → kamera → kuva + huomautus.
Toisen kuvat näkyvät reaaliajassa. Vuokranantaja lukitsee, kun molemmat ovat
valmiita – lukitusnappi on kuitenkin pois käytöstä, kunnes vuokralainen on joko
merkinnyt olevansa valmis tai 24 h on kulunut hänen ensimmäisestä kirjautumisestaan
katselmukseen. Vuokranantaja ei siis voi lukita katselmusta ennen kuin
vuokralaisella on ollut aito mahdollisuus lisätä omansa.

Lukituksen jälkeen palvelu renderöi katselmuspöytäkirjan: kohta, kuvat
pienoiskuvina (max 4 per kohta), kuvaaja, aika, tiiviste, huomautukset. Pöytäkirjasta
käy ilmi kumpi osapuoli kunkin kohdan lisäsi ja kumpi kuvan otti.

### 5.4 Allekirjoitus
`POST /rounds` eSinettiin: kaksi asiakirjaa (sopimus, alkukatselmus), 2–3 allekirjoittajaa (vuokranantaja + vuokralaiset), `expected_birthdate` jos tiedossa. Allekirjoittajat saavat eSinetin linkit; Reilusoppari näyttää tilan. Webhook `round.completed` → tallennetaan sinetöidyt PDF:t ja tiivisteet, `rs_users.identity_verified_at` päivitetään eSinetin palauttamasta nimestä/syntymäajasta, tenancy → `active`, `rs_rent_periods` generoidaan sopimuksen mukaan.

### 5.5 Kuittaus
Cron päivittäin: eräpäivänä push/sähköposti vuokranantajalle "Maksoiko {etunimi} {summa} € eräpäivään {pvm} mennessä?" napeilla Kyllä · Ei vielä · Osittain (push-toiminnot tai linkki). Kuittaus → vuokralaiselle ilmoitus "Vuokra {kuukausi} kuitattu". "Ei vielä" → vuokralaiselle neutraali ilmoitus ja kommenttimahdollisuus; muistutus vuokranantajalle 3 pv päästä. Historia näkyy molemmille taulukkona. Kuittausta voi muuttaa 30 päivän ajan (muutoshistoria lokiin), ei sen jälkeen.

### 5.6 Huoltokirja
Kumpi tahansa: "Ilmoita vika" (otsikko, kuvaus, kuvat) → toiselle ilmoitus → kommentit → vuokranantaja merkitsee korjatuksi (kuva korjauksesta, valinnainen kulu → `rs_expenses`). Merkintöjä ei poisteta; virheellinen merkitään "peruttu" molempien nähden.

### 5.7 Plus – kulut ja verolaskelma
Luokat: `hoitovastike`, `rahoitusvastike_tuloutettu`, `rahoitusvastike_rahastoitu` (ei vähennyskelpoinen vuosikuluna – ohjeteksti), `vuosikorjaus`, `perusparannus` (poistoina – ohjeteksti), `kalusteet`, `matkat` (km → summa verottajan vuosittaisella taksalla, taksa `content/tax-rates.ts` vuosittain päivitettävä), `vakuutus`, `korot` (ilmoitetaan erikseen), `muu`. Vuokratulo tulee kuittauksista (Kyllä + Osittain-summat). Vuosilaskelma: rivit luokittain OmaVeron kenttien järjestyksessä, liitteenä kuitit, sinetöinti `/documents/seal`. Ensimmäinen tulostus laukaisee Plus-maksun Stripe Checkoutissa (ellei salkkuhinta). Ohjetekstit näytetään luokan vieressä ja laskelman lopussa; jokaisessa "Tämä on yhteenveto omista kirjauksistasi, ei veroneuvontaa."

### 5.8 Päättyminen, loppukatselmus, todistukset
Vuokranantaja tai vuokralainen kirjaa irtisanomisen (pvm, kuka) → tila `ending` → loppukatselmus samoista checkpointeista, alkukuvat rinnalla → lukitus → loppupöytäkirja (sis. vakuuden palautusehdotus ja perusteet huoltokirjasta) → allekirjoitus eSinetissä (molemmat, vahva) → `ended`. Vuokranantaja kirjaa vakuuden palautuksen (pvm, summa). 7 päivää allekirjoituksesta: molemmat pyydetään antamaan suositus toisesta (`recommend` tai ei mitään + 300 merkkiä vapaata tekstiä); toinen näkee ja voi vastata 7 päivän kuluessa; sitten todistukset generoidaan (`stats` kuittauksista ja katselmuksista), sinetöidään ja toimitetaan kummallekin omansa → `certified`. Jos suositusta ei anneta, todistus syntyy ilman sitä, tilastoilla.

**Suosituksen esittäminen todistuksessa (sitova):** jos `rating = 'recommend'`, todistuksessa on suositusrivi. Jos `rating is null`, todistuksessa **ei ole suositusosiota lainkaan** – ei tyhjää kohtaa, ei tekstiä "ei suositusta", ei harmaata paikanvaraajaa. Puuttuva suositus ei saa olla luettavissa todistuksesta, muuten kaksiarvoisuudesta tulee kiertoteitse kolmiportainen asteikko.

### 5.10 Yhteydenottolupa ja keskustelu portaalissa (lisäominaisuus, vaihe 6)

Todistusta luodessaan antaja voi rastittaa "Saa ottaa minuun yhteyttä tästä
vuokrasuhteesta". Valinta tallentuu `rs_certificate_contact`-riville ja näkyy
todistuksen omistajalle selkeästi **ennen kuin hän jakaa todistuksen** – hänen
on tiedettävä, mitä hän jakaa.

**Keskustelu käydään Reilusopparissa, ei sähköpostissa.** Jakolinkin katselijalle
näkyy nappi "Kysy lisää". Se ei avaa lomaketta vaan ohjaa kirjautumaan:

<Askeleet steps={[
  { title: "Passwordless-kirjautuminen", description: "Uusi vuokranantaja antaa sähköpostinsa ja saa koodin. Tili syntyy samalla." },
  { title: "Vahva tunnistautuminen", description: "Pankkitunnukset tai mobiilivarmenne eSinetin kautta. Tehdään KERRAN per henkilö: tulos tallentuu rs_users.identity_verified_at, eikä sitä pyydetä uudelleen." },
  { title: "Keskustelu avautuu", description: "Kysyjä ja luvan antaja keskustelevat portaalissa. Kummankaan sähköpostia, puhelinnumeroa tai osoitetta ei näytetä toiselle - vain nimi, joka on tunnistautumisesta todennettu." },
  { title: "Ilmoitus toiselle", description: "Luvan antaja saa pushin tai sähköpostin siitä, että keskustelu on avattu. Itse viestit ovat vain portaalissa." }
]} />

Miksi vahva tunnistautuminen: keskustelu koskee **kolmannen osapuolen**
(vuokralaisen) henkilötietoja. Silloin on perusteltua tietää, kuka tiedon saa.
Se on myös ainoa tehokas suoja sitä vastaan, että kuka tahansa esiintyisi
vuokranantajana ja kalastelisi tietoja toisesta ihmisestä.

Sivutuote, joka on tuotteen kannalta olennainen: kysyjällä on tämän jälkeen
Reilusoppari-tili ja todennettu henkilöllisyys. Hänen ensimmäinen oma
vuokrasuhteensa on ilmainen ja yhden napin päässä. Todistuksen jakaminen on
siis myös hankintakanava – uusia vuokranantajia ohjautuu palveluun ilman että
kukaan markkinoi heille mitään.

**Vuokralainen näkee keskustelun.** Keskustelu käydään hänestä, joten se näkyy
hänelle kokonaisuudessaan omassa näkymässään: kuka kysyi, milloin ja mitä
sanottiin. Tämä on tarkoituksellinen valinta, ei tekninen sivuseikka – se on
sama periaate kuin kuittauksissa ja huoltokirjassa: kummastakaan osapuolesta ei
puhuta hänen selkänsä takana palvelun sisällä. Vaihtoehto (keskustelu piilossa
vuokralaiselta) olisi ensimmäinen kohta koko tuotteessa, jossa toisesta
kerätään tietoa hänen tietämättään.

Rajat: enintään `max_messages` (oletus 3) avausviestiä per todistus, rate limit
per käyttäjä, ja lupa on peruttavissa milloin vain (`revoked_at`) jolloin nappi
katoaa kaikista jakolinkeistä ja avoimet keskustelut suljetaan uusilta
viesteiltä. Kaikki kirjataan `rs_audit_log`:iin.

Sama toimii symmetrisesti: vuokralainen voi sallia yhteydenoton vuokranantajan
todistukseen, jolloin seuraava vuokralainen voi kysyä millainen vuokranantaja on.

**Jäljelle jäävä rajoite:** kaksi ihmistä voi aina siirtyä puhelimeen. Portaali
ei estä sitä eikä yritä. Se mitä se tekee, on tehdä palvelun sisäisestä
keskustelusta se helpompi vaihtoehto ja pitää se läpinäkyvänä sille, jota se
koskee. Tämä on kirjattava myös käyttöehtoihin.

### 5.9 Suosittelu ja salkku
"Tuo kaveri" -linkki (`rs_referrals`); kun tuotu vuokranantaja lähettää ensimmäisen allekirjoituskierroksen, molemmat saavat krediitin. Salkku: 5+ asuntoa → Stripe-tilaus `portfolio_yearly` asuntomäärän mukaan, sisältää kaikki vuokrasuhteet ja Plus-laskelmat.

---

## 6. Tietosuoja ja tietoturva – lisäykset eSinetin kohtaan 6

- Kuvat kodista ovat henkilötietoa. Pääsy vain osapuolille; ei julkisia URL:eja; signed URL max 1 h; pienoiskuvat samalla säännöllä.
- EXIF poistetaan aina (erityisesti GPS). Palvelimen aikaleima on ainoa aikaleima; asiakkaan ilmoittamaa kuvausaikaa ei tallenneta.
- Osapuolen poistuminen: kumpikin voi pyytää omien tietojensa vientiä ja tilin sulkemista; vuokrasuhteen yhteiset asiakirjat (sopimus, pöytäkirjat, todistukset) säilyvät säilytysajan toisen osapuolen oikeutetun edun perusteella – kirjaa tämä tietosuojaselosteeseen ja käyttöehtoihin.
- Todistuksen jakolinkki näyttää vain todistuksen, ei mitään muuta vuokrasuhteesta; katselukerrat lokiin ja omistajalle näkyviin.
- Ei henkilötunnuksia missään Reilusopparin taulussa. eSinetti hoitaa tunnistuksen ja palauttaa vain nimen ja syntymäajan.
- Rate limit kuvien latauksessa (100/h/käyttäjä) ja kutsulinkeissä.
- Stripe-webhookit allekirjoitettuja; maksutiedot eivät koskaan Reilusopparin tietokantaan (vain `stripe_customer_id`, payment id).

---

## 7. Testaus

- Yksikkö: tilakoneet (tenancy, inspection, certificate-aikarajat), vuokrakausien generointi (eräpäivä 31. → kuun viimeinen), verolaskelman rivit (rahastoitu vastike ei summaudu vuosikuluihin, km-taksa), todistuksen `stats`.
- E2E (Playwright, eSinetti-mock): koko kaari – asunto → vuokrasuhde → sopimus → vuokralainen liittyy → molemmat kuvaavat 3 kohtaa → lukitus → mock-allekirjoitus → kuittaus 3 kuukautta (kyllä/ei vielä/osittain + kommentti) → vika ja korjaus kuvineen → irtisanominen → loppukatselmus → mock-allekirjoitus → arviot ja vastine → todistukset → jakolinkki avautuu ilman kirjautumista → toisen vuokrasuhteen osapuoli ei näe mitään (403/404).
- Kuvatesti: EXIF-GPS poistuu, pakkaus toimii 12 MP -kuvalla mobiiliemulaatiossa.
- PWA: Lighthouse PWA-tarkistus, push-tilaus ja -vastaanotto Chromessa.

---

## 8. Vaiheet

**Vaihe 0 – Runko (1–2 sessiota).** Next.js + PWA, Supabase-migraatio, Auth0 passwordless, `lib/esinetti/` mock + oikea client, pohjat `templates/` ja `templates:push`-skripti, CI. DoD: kirjautuminen, asunnon luonti, mock-render palauttaa PDF:n.

**Vaihe 1 – Sopimus, katselmus, allekirjoitus (4–6 sessiota).** Polut 5.1–5.4. DoD: e2e alkukaari mockilla; oikea eSinetti-sandbox toimii, kun eSinetin vaihe 2 on valmis.

**Vaihe 2 – Kuittaus ja huoltokirja (2–3 sessiota).** Polut 5.5–5.6, push-ilmoitukset, cron. DoD: kuittaus toimii pushista ja sähköpostista, historia näkyy molemmille.

**Vaihe 3 – Päättyminen ja todistukset (3–4 sessiota).** Polku 5.8, `/documents/seal`, jakolinkit. DoD: koko e2e-kaari läpi.

**Vaihe 4 – Plus (2–3 sessiota).** Polku 5.7, verolaskelma, Stripe Checkout Plus-maksulle. DoD: laskelma vuodelle testidatasta, sinetöity, kuitit liitteenä.

**Vaihe 5 – Laskutus, suosittelu, salkku (2–3 sessiota).** Stripe-tuotteet, ilmainen ensimmäinen, krediitit, salkkutilaus, Customer Portal, kuluttajakaupan vahvistukset. DoD: kaikki maksupolut testattu Stripe test modessa.

**Vaihe 6 – Yhteydenottolupa ja keskustelu (2–3 sessiota, lisäominaisuus).** Polku 5.10. Sisältää uuden käyttäjäpolun: tuntematon katselija → tili → vahva tunnistautuminen → keskustelu. DoD: lupa päälle/pois, kysyjä pääsee keskusteluun vasta tunnistauduttuaan, yhteystiedot eivät paljastu kummallekaan, vuokralainen näkee keskustelun, luvan peruminen sulkee avoimet keskustelut, rajat ja loki toimivat.

Yhteensä noin 250–350 h. Riippuvuus: eSinetin vaihe 1 (API) ja `/documents/render` + `/documents/seal` ennen Reilusopparin vaihetta 1 – siihen asti mock.

---

## 9. Jukan tehtävät

1. Repo `reilusoppari`, tämä tiedosto juureen `CLAUDE.md`. Ensimmäinen kehote: *"Lue CLAUDE.md ja esinetti-repon CLAUDE.md kohdat 0 ja 0.1. Luo PLAN.md kohdan 8 pohjalta ja aloita vaihe 0."*
2. Supabase-projekti (EU), Auth0-sovellus passwordless-yhteydellä, Vercel-projekti `app.reilusoppari.fi`, Resend, VAPID-avaimet (`npm run keys:vapid` tuottaa), Stripe-tili ja test-avaimet.
3. Luo eSinettiin tenant `reilusoppari` ja API-avain; lisää eSinetin `PLAN.md`:ään `/documents/render` ja `/documents/seal` (lisäys 5.6 eSinetin CLAUDE.md:ssä).
4. **Vuokrasopimuspohjan juridinen sisältö** (AHVL 481/1995): kirjoita tai tarkista `templates/vuokrasopimus_asuinhuoneisto` ja katselmuspöytäkirjojen tekstit. Vastapuoli on kuluttaja – harkitse juristin tarkistusta kertaluonteisesti.
5. Verolaskelman luokkien ohjetekstit (`content/tax-guidance.fi.ts`) ja km-taksa vuosittain.
6. Todistuspohjien tekstit ja sanasto (vuokratodistus, ei luottotieto) – lue ennen vaihetta 3.
7. Kuluttajakäyttöehdot ja tietosuojaseloste ennen lanseerausta.
