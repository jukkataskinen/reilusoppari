# Kriittiset polut

Jukan päätös 14.10.2026. Nämä polut eivät saa rikkoutua. Jokaisella on testi,
ja tuotannossa ne tarkistetaan joka aamu savutestillä (`/api/savutesti`).

Taustalla on eSinetin virhe 8.–14.10.2026: riippuvuuden pääversio (WeasyPrint
63 → 70) yhdistyi automaattisesti ja rikkoi jokaisen logollisen sopimuksen
kuudeksi päiväksi, eikä kukaan huomannut. Reilusoppari allekirjoittaa eSinetin
kautta, joten sama vika olisi pysäyttänyt myös täällä allekirjoitukset.

## Tuotannon kaltaiset olot

- **Käännös:** e2e ajetaan tuotantokäännöstä vasten (`next build && next start`,
  `playwright.config.ts`), koska CSP ja funktiopaketin sisältö eroavat
  kehityspalvelimesta.
- **Asiakirjat:** oikea React-PDF ja omat fontit samalta polulta kuin
  tuotannossa (`src/documents/fonts.ts`). CI:n build-työ tarkistaa, että fontit
  ovat funktiopaketissa, ja e2e renderöi jokaisen asiakirjan käännetyssä
  palvelimessa (`tests/e2e/savutesti-reitti.spec.ts`).
- **Aineisto:** keksitty, jokainen pohja täydellä täytöllä: katselmuksessa kuvat
  ja vuokralaisen lisäämä tila, todistuksessa suositus, vastine ja QR-koodi
  (`src/lib/savutesti/aineisto.tsx`). Ei henkilötunnuksia.
- **Ulkoiset palvelut:** CI:ssä mockit (eSinetti ja Stripe ilman avaimia).
  Tuotannon savutesti kutsuu oikeita palveluja vain lukevilla kutsuilla.

## Polut ja testit

| # | Polku | Testi (CI) | Savutesti (tuotanto) |
|---|---|---|---|
| 1 | Kirjautuminen (Auth0, sähköpostikoodi) | `tests/e2e/savutesti.spec.ts` (ohjaus, `connection=email`) | ei: ei kirjaudu |
| 2 | Asunnon luonti | `tests/unit/db-properties.test.ts`, `tests/unit/property-schema.test.ts` | `tietokanta_kirjoitus` (luo ja poistaa) |
| 3 | Vuokrasopimus ja esikatselu PDF:nä | `tests/unit/rental-agreement.test.tsx`, `tests/unit/contract.test.ts`, `tests/unit/savutesti.test.ts`, `tests/e2e/savutesti-reitti.spec.ts` | `asiakirja_vuokrasopimus` |
| 4 | Vuokralaisen kutsu ja liittyminen | `tests/unit/invite.test.ts`, `tests/unit/invite-actions.test.ts` | ei: ei lähetä kutsuja |
| 5 | Alkukatselmus, kuvat ja pöytäkirja | `tests/unit/inspection-lock.test.ts`, `tests/unit/inspection-protocol.test.tsx`, `tests/unit/strip-metadata.test.ts` | `asiakirja_katselmuspoytakirja` |
| 6 | Allekirjoitus eSinetissä (mock) ja webhook | `tests/unit/signing.test.ts`, `tests/unit/sign-now.test.ts`, `tests/unit/esinetti-webhook.test.ts`, `tests/unit/esinetti-mock.test.tsx` | `esinetti_yhteys` (aitoustarkistus, ei kierroksia) |
| 7 | Allekirjoitetut asiakirjat ja lataus | `tests/unit/signed-documents.test.ts`, `tests/unit/pdf-linkit.test.ts` | – |
| 8 | Vuokran kuittaus | `tests/unit/rent-confirmation.test.ts`, `tests/unit/rent-periods.test.ts` | – |
| 9 | Päättyminen ja vuokratodistus | `tests/unit/tenancy-ending.test.ts`, `tests/unit/tenancy-certificate.test.tsx`, `tests/unit/certificate-share.test.ts` | `asiakirja_vuokratodistus` |
| 10 | Plus: verolaskelma | `tests/unit/tax-report.test.ts`, `tests/unit/tax-report-document.test.tsx` | `asiakirja_verolaskelma` |
| 11 | Maksut (Stripe test mode) | `tests/unit/billing-webhook.test.ts`, `tests/unit/plus-billing.test.ts`, `tests/unit/stripe-http-client.test.ts` | `stripe_yhteys` (haku ilman osumaa) |
| 12 | Sähköposti | `tests/unit/email.test.ts` | `sahkoposti_asetukset` (ei lähetä) |

## Tunnetut aukot

- **Kantaa vaativat integraatiotestit ohittuvat CI:ssä**, koska GitHubissa ei
  ole testiprojektin avaimia (`TEST_SUPABASE_*`). Ohjeet Jukalle: BLOCKERS.md
  "Laatuportit". Siihen asti polut 2, 4 ja 6 nojaavat yksikkötesteihin ja
  tuotannon savutestiin.
- **Koko kaaren e2e** (CLAUDE.md kohta 7) puuttuu: se vaatii testikannan.

## Kun lisäät polun tai asiakirjan

1. Uusi asiakirjapohja: lisää se `savutestiAsiakirjat()`-listaan
   (`src/lib/savutesti/aineisto.tsx`) täydellä keksityllä aineistolla, ja
   päivitä `tests/unit/savutesti.test.ts`:n nimilista ja e2e:n odotettu määrä.
2. Uusi polku: rivi yllä olevaan taulukkoon, testi CI:hin ja tarvittaessa
   askel `src/lib/savutesti/steps.ts`:ään. Savutesti ei saa lähettää viestejä,
   luoda kierroksia eikä tehdä maksullista.
