# LUONNOS — lisäykset tietosuojaselosteeseen ja käyttöehtoihin

**Tila:** luonnos Jukan tarkistettavaksi, 2026-09-26. Ei julkaistu missään.

Tietosuojaseloste ja käyttöehdot ovat `reilusoppari-web`-repossa
(`src/app/tietosuoja`, `src/app/kayttoehdot`), ja sovellus linkittää niihin
(`/omat-tiedot`, vuokrasuhteen osapuolisivu). Tässä tiedostossa on vain
**lisättävät kohdat**, jotta ne on helppo tarkistaa yksitellen ennen kuin ne
siirretään sivuston teksteihin. Nykyistä sivuston tekstiä ei ole luettu tätä
kirjoitettaessa, joten osa kohdista voi olla jo siellä — merkitse ne
tarpeettomiksi.

Jokaisen kohdan alla on **Peruste**: mistä kohdan tarve tulee sovelluksessa.
Se ei kuulu julkaistavaan tekstiin.

Hakasulkeissa `[...]` olevat kohdat vaativat tiedon, jota koodista ei näe.

---

## A. Tietosuojaseloste

### A1. Allekirjoitus ja sinetöinti: eSinetti (Adepta Oy) käsittelijänä

> Sopimukset, katselmuspöytäkirjat, vuokratodistukset ja verolaskelmat
> allekirjoitetaan tai sinetöidään eSinetti-palvelussa. eSinetin tarjoaa
> Adepta Oy (y-tunnus 2237131-2), joka käsittelee tietoja lukuunamme
> henkilötietojen käsittelijänä. Käsittelystä on tehty kirjallinen
> käsittelysopimus.
>
> eSinettiin siirtyvät:
>
> - allekirjoitettavat ja sinetöitävät asiakirjat kokonaisuudessaan.
>   Vuokrasopimuksessa on osapuolten nimet, yhteystiedot ja henkilötunnukset
>   sekä maksutili; katselmuspöytäkirjassa on kuvat asunnosta.
> - allekirjoittajien nimet ja sähköpostiosoitteet ja, jos se on annettu,
>   puhelinnumero
> - vahvan tunnistautumisen tulos: nimi ja syntymäaika. Henkilötunnusta
>   eSinetti ei palauta meille.
>
> Tunnistautuminen tehdään pankkitunnuksilla tai mobiilivarmenteella
> [tunnistusvälittäjän nimi, esim. Telia]. Tunnistusvälittäjä on eSinetin
> alikäsittelijä.

**Peruste:** CLAUDE.md kohta 2 (eSinetti-liitäntä), `src/lib/tenancy/signing.ts`
(kierroksen allekirjoittajat), `src/lib/tenancy/round-completed.ts` (nimi ja
`identity_verified_at` tunnistuksesta). Vuokrasopimuksen PDF sisältää
henkilötunnuksen kokonaisena (DECISIONS.md 2026-09-11), joten se päätyy
eSinettiin. Adepta Oy ja Adepta Tilat Oy ovat eri oikeushenkilöitä (BLOCKERS.md,
yhtiöjako 2026-09-13), joten käsittelysopimus tarvitaan: luonnos
`docs/luonnos-kasittelysopimus-esinetti.md`.

**Tarkistettava:** eSinetin julkinen tarkistus (`GET /verify`) palauttaa
allekirjoittajien nimet kenelle tahansa, jolla on asiakirjan tiiviste.
Reilusopparin oma tarkistussivu ei näytä nimiä. Jos tämä halutaan sanoa
selosteessa, muotoilu voisi olla: "Asiakirjan aitouden voi tarkistaa sen
tiivisteellä. Tarkistus kertoo allekirjoittajien nimet mutta ei asiakirjan
sisältöä."

### A2. Henkilötunnus näkyy aina peitettynä

> Vuokrasopimukseen kirjoitettu henkilötunnus tallennetaan salattuna.
> Palvelussa se näytetään aina peitettynä (esimerkiksi 131052-\*\*\*T).
> Kokonaisena se on vain allekirjoitettavassa sopimuksessa.
>
> Myös omien tietojen viennissä (zip-paketti) henkilötunnus on peitetty.
> Paketti tallentuu laitteellesi salaamattomana, eikä kokonaista tunnusta
> kannata tallentaa sinne uudelleen: se on jo mukana paketissa olevassa
> allekirjoitetussa sopimuksessa.

**Peruste:** CLAUDE.md kohta 6, DECISIONS.md "Omien tietojen vienti zipinä"
(2026-09-12), jossa on nimenomaan kirjattu, että tämä on mainittava
selosteessa. `src/lib/export/collect.ts`. PLAN.md: "Tietosuojaselosteeseen
maininta viennin peitetystä henkilötunnuksesta".

### A3. Kuitin luku: kuva käy palvelun ulkopuolella

> Kun kuvaat kuitin ja pyydät palvelua lukemaan sen, kuva lähetetään
> Anthropic PBC:n tekoälypalveluun, joka lukee siitä summan, päivän,
> arvonlisäveron ja myyjän. Luetut tiedot ovat ehdotus: tarkistat ja
> tallennat ne itse. Kululuokkaa palvelu ei päättele kuitista.
>
> Anthropic on henkilötietojen käsittelijä. [Siirtoperuste EU:n ulkopuolelle:
> esim. EU:n vakiolausekkeet tai tietosuojakehys — tarkista Anthropicin
> kaupallisista ehdoista ja DPA:sta.] [Säilytysaika Anthropicilla:
> tarkista voimassa olevista API-ehdoista.] Anthropic ei käytä rajapinnan
> kautta lähetettyjä tietoja mallien kouluttamiseen [tarkista ehdoista].
>
> Kuitin lukeminen on vapaaehtoista. Voit aina kirjoittaa summan itse,
> jolloin kuva ei lähde palvelun ulkopuolelle ennen tallennusta.
> Tallennettu kuitti säilytetään palvelussa kuten muutkin kuvat.
>
> Kuitissa voi olla muiden henkilötietoja, esimerkiksi remonttiyrittäjän
> nimi. Palvelu ei poimi niitä erikseen.

**Peruste:** DECISIONS.md "Kuitin luku Anthropicin Messages API:lla"
(2026-09-12), `src/lib/receipts/anthropic.ts`. Kuva ei tallennu
lukuvaiheessa, vasta kun kulu tallennetaan. PLAN.md: "kuitin käsittelystä
palvelun ulkopuolella (Jukka)".

### A4. Verkko-osoite kutsu- ja jakolinkkejä avattaessa

> Kun avaat kutsulinkin tai jaetun vuokratodistuksen, palvelu laskee
> verkko-osoitteestasi tunnisteen, jolla rajoitetaan poikkeuksellisen
> tiheää linkkien avaamista. Itse osoitetta ei tallenneta. Tunniste vaihtuu
> päivittäin, eikä siitä voi päätellä osoitetta. Tunnisteet poistetaan
> vuorokauden kuluessa. Peruste on oikeutettu etu: palvelun suojaaminen
> kuormitukselta.

**Peruste:** migraatio `0016_kutsuraja_linkeille.sql` ja
`src/lib/security/link-rate-limit.ts` (2026-09-26). Pseudonyymi tieto on
yhä henkilötietoa, joten maininta on paikallaan, vaikka säilytys on lyhyt.

### A5. Käsittelijät yhdessä listassa

Jos selosteessa on käsittelijälista, sen pitäisi vastata sovelluksen
todellisia yhteyksiä:

| Käsittelijä | Mihin | Sijainti |
|---|---|---|
| Supabase | tietokanta ja tiedostot | EU [alue] |
| Vercel | sovelluksen ajo | [funktioiden alue, DECISIONS.md "funktiot väärällä mantereella"] |
| Auth0 (Okta) | kirjautuminen sähköpostikoodilla | EU (tenant `reilusoppari.eu.auth0.com`) |
| Resend | sähköpostit | EU (eu-west-1) |
| Stripe | maksut | [tarkista] |
| Anthropic | kuitin luku, vain pyydettäessä | USA |
| Adepta Oy (eSinetti) | allekirjoitus, tunnistautuminen, sinetöinti | [tarkista] |

Web push -ilmoitukset kulkevat selaimen valmistajan palvelun kautta (Google,
Apple, Mozilla). Ilmoituksen sisältö on lyhyt [tarkista, sisältääkö se nimiä
tai summia].

---

## B. Käyttöehdot

### B1. Keskustelu voi siirtyä puhelimeen

> Kun annat luvan ottaa sinuun yhteyttä vuokratodistuksen kautta, keskustelu
> käydään Reilusopparissa. Kummankaan yhteystietoja ei näytetä toiselle, ja
> vuokrasuhteen toinen osapuoli näkee keskustelun, koska se koskee häntä.
>
> Palvelu ei voi estää sitä, että keskustelijat sopivat jatkavansa
> puhelimessa tai muualla, eikä se yritä estää. Palvelun ulkopuolella
> käydystä keskustelusta ei jää merkintää Reilusopparin, eikä se näy
> toiselle osapuolelle. Olet itse vastuussa siitä, mitä kerrot toisesta
> ihmisestä palvelun ulkopuolella.
>
> Voit perua luvan milloin tahansa. Silloin uusia keskusteluja ei voi avata,
> ja avoimiin ei voi enää kirjoittaa.

**Peruste:** CLAUDE.md 5.10 ("Tämä on kirjattava myös käyttöehtoihin"),
PLAN.md vaihe 6: "Käyttöehtoihin maininta siitä, että keskustelu voi
siirtyä puhelimeen eikä palvelu estä sitä (Jukka)".

### B2. Yhteiset asiakirjat säilyvät tilin sulkemisen jälkeen

> Voit sulkea tilisi ja pyytää omien tietojesi poistoa. Vuokrasuhteen
> yhteiset asiakirjat — sopimus, katselmuspöytäkirjat ja vuokratodistukset —
> säilyvät silti säilytysajan loppuun, koska toinen osapuoli voi tarvita
> niitä oikeuksiensa turvaamiseen.

**Peruste:** CLAUDE.md kohta 6 ("kirjaa tämä tietosuojaselosteeseen ja
käyttöehtoihin"). Todennäköisesti jo sivuston teksteissä — tarkista.

### B3. Kuitin luku on apu, ei kirjanpito

> Kuitista luetut tiedot ovat ehdotus. Tarkista ne ennen tallennusta.
> Verolaskelma on yhteenveto omista kirjauksistasi, ei veroneuvontaa.

**Peruste:** DECISIONS.md "Kuitin luku" ja CLAUDE.md 5.7.
