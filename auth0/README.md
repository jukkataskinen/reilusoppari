# Auth0-hallintapaneelin asetukset

Näitä ei aseteta koodista vaan Auth0:n hallintapaneelista. Tiedostot ovat
täällä siksi, että paneeliin liimattu teksti unohtuu: täällä se on
versionhallinnassa ja muutokset näkyvät historiassa.

| | |
|---|---|
| `kirjautumiskoodi.liquid` | Authentication → Passwordless → **Email** → yhteyden oma viestipohja |

> **Ei Branding → Email Templates.** Passwordless-kirjautumisen viesti on
> yhteyden omissa asetuksissa, ei tenantin pohjalistassa. Tuo lista hoitaa
> salasanan vaihdon, MFA:n ja sähköpostin vahvistuksen — ei kirjautumiskoodia.
> Tämä meni ensin väärin (2026-09-13), ja korjaus on kirjattu tähän, koska
> väärä paikka ohjeessa maksaa saman ajan joka kerta.

---

## Järjestys ei jousta

**Auth0 ohittaa muokatut pohjat, kunnes oma sähköpostipalvelin on
konfiguroitu.** Tämä lukee Auth0:n omassa varoituksessa pohjan
muokkausnäkymässä. Pohjan kääntäminen ennen palvelimen vaihtoa on hukkaan
heitettyä työtä — viesti lähtee silti Auth0:n englanninkielisenä oletuksena.

1. Resend-tili ja domain — **valmis 2026-09-13**
2. DNS-tietueet — **SPF, DKIM ja bounce-MX valmiit; DMARC puuttuu**
3. Auth0:n sähköpostipalvelin — kesken
4. Tämä pohja — odottaa kohtaa 3

---

## Kohta 3: sähköpostipalvelin Auth0:aan

Auth0:n valmiissa listassa **ei ole Resendiä**, joten valitaan `SMTP`.
Resendin SMTP-tunnukset:

| Kenttä | Arvo |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` (TLS) tai `587` (STARTTLS) |
| Username | `resend` |
| Password | Resendin API-avain |
| From | `noreply@reilusoppari.fi` |

**API-avain menee Auth0:n kenttään, ei tähän repoon eikä `.env.local`:iin.**
Auth0 tarvitsee sen omassa asetuksessaan; sovellus ei käytä sitä
kirjautumiseen mitenkään.

> ⚠️ **Lähettäjä on tenant-laajuinen.** Sama asetus koskee eSinettiä, Adepta
> PPR:ää ja SKOGia. Jos From on `noreply@reilusoppari.fi`, myös niiden
> kirjautumiskoodit lähtevät siitä osoitteesta. Ks. `BLOCKERS.md`:
> yhtiöjaon 2026-09-13 jälkeen tämä on myös tietosuojakysymys, ei pelkkä
> ulkoasuseikka.

---

## Kohta 4: pohja ja otsikko

**Authentication → Passwordless → Email.** Liitä `kirjautumiskoodi.liquid`
viestin sisällöksi. Aiheeksi:

    {{ application.name }}: kirjautumiskoodi

Koodi on tarkoituksella **jätetty pois aiheesta**, vaikka se olisi
kätevämpää puhelimessa. Aihe näkyy lukitusnäytön ilmoituksessa, ja
kirjautumiskoodi, jonka näkee avaamatta puhelinta, on huonompi koodi.

Pohja käyttää `{{ application.name }}`-muuttujaa, joten sama pohja kelpaa
kaikille tenantin sovelluksille. Alatunnisteen yhtiö valitaan sovelluksen
mukaan: Reilusoppari on Adepta Tilat Oy:n tuote, muut Adepta Oy:n.

**Testaaminen: kirjaudu oikeasti.** Pohjanäkymässä ei ole "Send test email"
-nappia — se on vain Email Provider -sivulla, ja se lähettää Auth0:n oman
testiviestin eikä tätä pohjaa. Ainoa tapa nähdä pohja on pyytää
kirjautumiskoodi sovelluksesta.

Muista myös, että sama pohja on nyt eSinetin, PPR:n ja SKOGin käytössä.
Kirjaudu kerran johonkin niistä ja katso, että `{{ application.name }}`
näyttää oikean nimen ja alatunniste oikean yhtiön.

---

## DMARC puuttuu vielä

`_dmarc.reilusoppari.fi` on tyhjä. SPF ja DKIM kertovat, että viesti on aito;
DMARC kertoo vastaanottajalle, mitä tehdä kun ne eivät täsmää — ja pyytää
raportit, joista näkee kuka domainin nimissä lähettää.

Lisää Vercelin DNS-hallintaan:

| | |
|---|---|
| Nimi | `_dmarc` |
| Tyyppi | `TXT` |
| Arvo | `v=DMARC1; p=none; rua=mailto:dmarc@reilusoppari.fi` |

**Aloita `p=none`:sta.** Se ei hylkää mitään vaan kerää raportit. Kun
raporteista näkee, että kaikki oma liikenne menee läpi, voi kiristää
`p=quarantine`-tilaan ja lopulta `p=reject`iin. Suoraan `p=reject` estäisi
myös oman postin, jos jokin lähetyskanava on unohtunut.

`rua`-osoitteen pitää olla olemassa. Jos `reilusoppari.fi`-osoitteisiin ei
oteta postia vastaan, käytä osoitetta, johon se menee perille.
