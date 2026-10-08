<!-- Kopio adeptan speksistä docs/speksit/kehitysehdotukset.md (8.10.2026). Monorepon paketti @adepta/kehitysehdotukset ei ole tämän repon käytettävissä, joten logiikka toteutetaan tähän repoon saman määrittelyn mukaan. -->
# Kehitysehdotukset: yhteinen käytäntö kaikkiin sovelluksiin

Jukan päätös 8.10.2026. Koskee kaikkia sovelluksia: adeptan PPR, eRappu, Neropatti ja omat repot Mittarilukema, eSinetti, Reilusoppari ja Kasamaster. Monorepon sovellukset käyttävät pakettia `@adepta/kehitysehdotukset`. Erillisissä repoissa toteutus tehdään tämän määrittelyn mukaan, ja logiikka kopioidaan paketista. Sovelluksissa on jo kehitystoiveiden taulut (esim. `ml_feature_requests`, `er_feature_requests`, `rs_feature_requests`, `sin_feature_requests`), ja niitä laajennetaan. Uutta taulua ei tehdä, jos sellainen jo on.

## Kulku

1. **Ehdotus.** Käyttäjä painaa "Kehitysehdotus" (linkki jokaisen sivun alareunassa tai valikossa). Lomakkeella on otsikko, tarkka kuvaus ("Mitä yritit tehdä, mitä tapahtui, mitä odotit") ja valinnainen kuvakaappaus (png/jpg, enintään 5 Mt). Sivun osoite tallentuu automaattisesti. Kuvakaappaus tallennetaan sovelluksen yksityiseen tiedostovarastoon, ei koskaan gittiin eikä GitHubiin, koska siinä voi olla henkilötietoja.
2. **Ilmoitus koodaajalle.** Sähköposti osoitteeseen `KEHITYS_KOODAAJA_EMAIL` (nyt Jukka): "Uusi kehitysehdotus: <sovellus>", linkki käsittelysivulle. Viestissä ei ole ehdotuksen sisältöä eikä käyttäjän nimeä, vain linkki.
3. **Käsittely.** Käsittelysivulla (vain koodaaja, sovelluksen pääkäyttäjäroolin yläpuolella tai erillisellä listalla `KEHITYS_KOODAAJAT`) näkyvät ehdotus, kuvakaappaus ja sivu. Koodaaja voi:
   - **Hyväksyä sellaisenaan** tai **muokata** tehtävän kuvausta ennen hyväksyntää. Muokattu kuvaus on se, joka menee työjonoon. Henkilötiedot poistetaan tekstistä tässä vaiheessa.
   - **Hylätä** vastauksella, joka näkyy käyttäjälle.
4. **Työjonoon.** Hyväksyntä luo GitHub-issuen sovelluksen repoon tunnisteella `kehitysehdotus`: otsikko, hyväksytty kuvaus, sovelluksen ehdotustunniste ja sivun polku (ilman tunnisteita tai henkilötietoja). Kuvakaappaus ei mene GitHubiin. Agentit (yöajot ja adeptan tunnin välein ajettava agentti) ottavat avoimet `kehitysehdotus`-issuet ennen PLAN-tehtäviä, vanhin ensin, ja viittaavat PR:ssä `Closes #N`.
5. **Testaus.** Kun issue suljetaan yhdistetyllä PR:llä, sovellus saa tiedon GitHubin webhookista (`/api/github/webhook`, allekirjoitus `GITHUB_WEBHOOK_SECRET`) ja lähettää koodaajalle viestin "Testaa: <otsikko>", jossa on linkki käsittelysivulle ja muutokseen. Koodaaja valitsee:
   - **Toimii:** siirtyy kohtaan 6.
   - **Tarvitsee muutoksen:** kirjoittaa, mitä pitää korjata. Issue avataan uudelleen kommentin kanssa ja palaa työjonoon.
6. **Valmis.** Käyttäjälle lähtee viesti: "Ehdottamasi kohta on korjattu: <otsikko>. Voit kokeilla sitä nyt. Jos jokin ei vieläkään toimi, lähetä uusi ehdotus." Linkki sovellukseen ja uuteen ehdotukseen. Käyttäjä näkee ehdotuksen tilan myös omalla Kehitysehdotukset-sivullaan.

## Tilat

`uusi` → `hyvaksytty` (issue luotu) → `tyon_alla` (PR avattu, tieto webhookista) → `testattavana` (PR yhdistetty) → `valmis` (käyttäjälle ilmoitettu). Sivupolut: `hylatty` (vastaus käyttäjälle) ja `testattavana` → `tyon_alla` (tarvitsee muutoksen). Jokainen siirtymä lokiin: kuka, milloin, mistä mihin. Tilasiirtymät ovat paketissa puhtaana funktiona testeineen; sovellus ei saa ohittaa niitä.

## Tekninen

- Sähköposti sovelluksen olemassa olevan lähetysrajapinnan kautta (mock oletuksena).
- GitHub: hienojakoinen token `GITHUB_ISSUES_TOKEN`, oikeus vain kyseisen repon Issues: read and write. Ilman tokenia hyväksyntä tallentuu, mutta issue jää luomatta ja käsittelysivu kertoo sen (ei virhettä käyttäjälle).
- Webhook: vain tapahtumat `issues` (closed, reopened) ja `pull_request` (opened, closed+merged), joiden issue tai PR-runko viittaa sovelluksen ehdotukseen. Allekirjoitus tarkistetaan vakioaikaisesti.
- Ei henkilötietoja issueen, lokeihin, URL-osoitteisiin eikä virheviesteihin.
- Ohjeet: jokaisen sovelluksen ohjeisiin selkokielinen ohje "Kehitysehdotuksen lähettäminen".

## Jukalta tarvitaan (BLOCKERS)

Kullekin sovellukselle: `GITHUB_ISSUES_TOKEN` (hienojakoinen token, yksi repo, Issues read/write), webhook GitHubin repon asetuksiin osoitteeseen `<sovellus>/api/github/webhook` ja sama salaisuus Verceliin `GITHUB_WEBHOOK_SECRET`, sekä `KEHITYS_KOODAAJA_EMAIL`. Claude antaa vaiheittaiset ohjeet, kun sovelluksen toteutus on valmis.
