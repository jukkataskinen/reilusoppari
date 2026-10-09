/**
 * Ohjesivujen sisältö (/ohjeet). Jokaisella kirjautuneen käyttäjän sivulla on
 * linkki oman toimintonsa ohjeeseen (src/lib/help/routes.ts).
 *
 * Kirjoitetaan selkokielellä: lyhyet lauseet, arkisanat, vaiheet
 * numeroituina, ei teknisiä termejä. Painikkeiden nimet täsmälleen kuten
 * sovelluksessa, jotta lukija löytää ne. Kun toiminto muuttuu, ohje
 * päivitetään samassa muutoksessa (CLAUDE.md, Ohjeet). Kesken oleva toiminto
 * merkitään `upcoming: true`.
 *
 * Ohjeissa ei ole kenenkään tietoja, joten sivut ovat julkisia.
 */

export interface HelpSection {
  title: string;
  text?: string;
  steps?: string[];
  bullets?: string[];
}

export interface HelpTopic {
  slug: string;
  group: string;
  title: string;
  /** Yhden lauseen kuvaus etusivun kortille. */
  summary: string;
  /** Kohokohdat ohjeen alussa. */
  highlights: string[];
  /** Kenelle toiminto on: vuokranantajalle, vuokralaiselle vai molemmille. */
  roles?: "landlord" | "tenant" | "both";
  /** Sovelluksen sivu, josta toiminto löytyy. */
  appPath?: string;
  appLabel?: string;
  sections: HelpSection[];
  tips?: string[];
  related?: string[];
  /** Kehitteillä oleva toiminto: näytetään merkinnällä. */
  upcoming?: boolean;
}

export const HELP_GROUPS = [
  "Aloitus",
  "Asunto ja vuokrasuhde",
  "Katselmus ja allekirjoitus",
  "Vuokrasuhteen aikana",
  "Päättyminen",
  "Kulut ja verotus",
  "Tili ja palvelu",
];

export const HELP_TOPICS: HelpTopic[] = [
  // --- Aloitus ---------------------------------------------------------------
  {
    slug: "aloitus",
    group: "Aloitus",
    title: "Näin pääset alkuun",
    summary: "Reilusoppari on vuokranantajan ja vuokralaisen yhteinen paikka koko vuokrasuhteen ajan.",
    highlights: [
      "Kirjautuminen sähköpostiin tulevalla koodilla, ei salasanaa",
      "Sama ihminen voi olla vuokranantaja yhdessä ja vuokralainen toisessa vuokrasuhteessa",
      "Vuokralainen ei maksa mitään",
    ],
    roles: "both",
    appPath: "/",
    appLabel: "etusivu",
    sections: [
      {
        title: "Kirjautuminen",
        steps: [
          "Valitse Kirjaudu.",
          "Kirjoita sähköpostiosoitteesi.",
          "Saat sähköpostiisi kertakäyttöisen koodin.",
          "Kirjoita koodi. Olet sisällä.",
        ],
      },
      {
        title: "Jos olet vuokranantaja",
        steps: [
          "Lisää asunto.",
          "Luo asunnolle vuokrasuhde ja anna vuokralaisen sähköposti.",
          "Lähetä kutsulinkki vuokralaiselle.",
          "Täytä sopimus ja tee alkukatselmus yhdessä vuokralaisen kanssa.",
          "Lähetä sopimus allekirjoitettavaksi.",
        ],
      },
      {
        title: "Jos olet vuokralainen",
        steps: [
          "Avaa vuokranantajalta saamasi kutsulinkki.",
          "Kirjaudu samalla sähköpostilla, johon kutsu tuli.",
          "Lue sopimusluonnos ja kuvaa asunto alkukatselmuksessa.",
          "Allekirjoita, kun saat linkin sähköpostiisi.",
        ],
      },
      {
        title: "Etusivu",
        bullets: [
          "Etusivulla näet, montako asuntoa ja vuokrasuhdetta sinulla on.",
          "Jos sinulla ei ole vielä mitään, etusivu neuvoo lisäämään asunnon.",
          "Valikko on puhelimessa alareunassa: Asunnot, Vuokrasuhteet ja Omat tiedot.",
        ],
      },
      {
        title: "Lomakkeiden täyttäminen",
        bullets: [
          "Jos jokin tieto puuttuu, lomake ei tyhjene. Kaikki kirjoittamasi tiedot jäävät paikalleen.",
          "Puuttuva tai väärä kohta näkyy punaisella, ja sen alla lukee, mitä pitää korjata.",
          "Sivu siirtyy itse ensimmäiseen korjattavaan kohtaan.",
          "Harmaa kursiivi teksti, joka alkaa sanalla esim., on vain esimerkki. Se ei ole täytetty tieto.",
        ],
      },
    ],
    tips: [
      "Jokaisen sivun yläreunassa on Ohje. Se avaa juuri sen sivun ohjeen.",
      "Vieressä on Kehitystoive. Sillä voit kertoa, mitä toivot sivulle.",
    ],
    related: ["asunnot", "liittyminen"],
  },

  // --- Asunto ja vuokrasuhde -------------------------------------------------
  {
    slug: "asunnot",
    group: "Asunto ja vuokrasuhde",
    title: "Asunnot",
    summary: "Lisää asunto kerran. Sille voi luoda vuokrasuhteita, kirjata kuluja ja tehdä verolaskelman.",
    highlights: ["Osoite ja tyyppi riittävät alkuun", "Asunnolle syntyy valmis lista katselmuksen kohdista", "Asunnon näkee vain omistaja"],
    roles: "landlord",
    appPath: "/asunnot",
    appLabel: "Asunnot",
    sections: [
      {
        title: "Asunnon lisääminen",
        steps: [
          "Avaa Asunnot ja valitse Lisää asunto.",
          "Kirjoita katuosoite, postinumero ja postitoimipaikka.",
          "Valitse asunnon tyyppi: kerrostalo, rivi- tai paritalo, omakotitalo tai muu.",
          "Kirjoita halutessasi huoneiden määrä ja pinta-ala. Keittiötä ei lasketa huoneeksi: 2h+k on kaksi.",
          "Lisätiedoissa voit antaa asunnolle nimen, taloyhtiön ja hallintamuodon.",
          "Valitse Tallenna. Pääset asunnon sivulle.",
        ],
      },
      {
        title: "Asunnon sivu",
        bullets: [
          "Uusi vuokrasuhde: aloita vuokrasuhde tähän asuntoon.",
          "Kulut, Toistuvat kulut ja Verolaskelma: asunnon kulut ja vuoden yhteenveto.",
          "Katselmuksen kohdat: lista huoneista ja asioista, joita katselmuksessa kannattaa katsoa.",
        ],
      },
      {
        title: "Katselmuksen kohdat",
        text: "Lista tehdään asunnon tyypin ja huonemäärän mukaan. Se on muistin tueksi, ei vaatimus. Katselmuksessa voi kuvata myös tiloja, joita listalla ei ole.",
      },
    ],
    tips: [
      "Asunnon tietoja ei voi vielä muokata eikä asuntoa poistaa sovelluksessa. Jos jokin meni väärin, jätä kehitystoive.",
      "Kun sinulla on asunto, Asunnot-sivulla on myös Kuvaa kuitti.",
    ],
    related: ["vuokrasuhde", "kulut"],
  },
  {
    slug: "vuokrasuhde",
    group: "Asunto ja vuokrasuhde",
    title: "Vuokrasuhde ja kutsu",
    summary: "Vuokrasuhde kokoaa sopimuksen, katselmuksen, vuokranmaksut ja huollot yhteen paikkaan.",
    highlights: ["Yksi tai kaksi vuokralaista", "Kutsulinkki vuokralaiselle", "Ensimmäinen vuokrasuhde on ilmainen"],
    roles: "both",
    appPath: "/vuokrasuhteet",
    appLabel: "Vuokrasuhteet",
    sections: [
      {
        title: "Uusi vuokrasuhde",
        steps: [
          "Avaa asunto ja valitse Uusi vuokrasuhde.",
          "Kirjoita vuokralaisen nimi ja sähköposti. Kutsu ja kirjautuminen menevät tähän osoitteeseen.",
          "Jos vuokralaisia on kaksi, valitse Lisää toinen vuokralainen. Heillä pitää olla eri sähköpostit.",
          "Kirjoita alkupäivä, vuokra kuukaudessa, eräpäivä ja vakuus.",
          "Jos sopimus on määräaikainen, valitse Määräaikainen ja kirjoita päättymispäivä. Muuten sopimus on voimassa toistaiseksi.",
          "Valitse Luo vuokrasuhde.",
        ],
      },
      {
        title: "Kutsulinkki",
        steps: [
          "Kun vuokrasuhde on luotu, näet jokaisen vuokralaisen kutsulinkin.",
          "Kopioi linkki ja lähetä se vuokralaiselle itse, esimerkiksi sähköpostilla tai viestillä. Sovellus ei lähetä kutsua.",
          "Linkki näytetään vain kerran. Jos se katoaa, avaa vuokrasuhde ja valitse Luo uusi kutsulinkki.",
          "Uusi linkki mitätöi vanhan. Vanha linkki ei enää toimi.",
        ],
      },
      {
        title: "Vuokrasuhteen sivu",
        bullets: [
          "Ylhäällä näkyvät alkupäivä, kesto, vuokra, eräpäivä ja vakuus.",
          "Painikkeista pääset sopimukseen, osapuolten tietoihin, katselmukseen, allekirjoitukseen, vuokranmaksuun, huoltokirjaan ja päättymiseen.",
          "Kulut näkyvät vain vuokranantajalle.",
          "Vuokralaisesta näet, onko hän jo liittynyt.",
        ],
      },
      {
        title: "Vuokrasuhteen tila",
        bullets: [
          "Katselmus kesken: sopimusta täytetään ja asuntoa kuvataan.",
          "Odottaa allekirjoitusta: asiakirjat on lähetetty allekirjoitettaviksi.",
          "Voimassa: sopimus on allekirjoitettu.",
          "Päättymässä: vuokrasuhde on irtisanottu.",
          "Päättynyt: loppukatselmus on allekirjoitettu.",
          "Todistukset annettu: molemmat ovat saaneet vuokratodistuksen.",
        ],
      },
    ],
    tips: ["Jo alussa kerrotaan molemmille, että lopuksi kumpikin voi antaa toisesta arvion ja saa oman todistuksen."],
    related: ["liittyminen", "sopimus", "katselmus"],
  },
  {
    slug: "liittyminen",
    group: "Asunto ja vuokrasuhde",
    title: "Vuokralaisen liittyminen",
    summary: "Vuokralainen liittyy vuokrasuhteeseen vuokranantajan lähettämästä kutsulinkistä.",
    highlights: ["Ei salasanaa, koodi tulee sähköpostiin", "Kirjaudu samalla osoitteella, johon kutsu tuli", "Liittyminen on maksuton"],
    roles: "tenant",
    sections: [
      {
        title: "Näin liityt",
        steps: [
          "Avaa kutsulinkki. Näet asunnon osoitteen, alkupäivän, vuokran ja vakuuden.",
          "Valitse Kirjaudu ja liity.",
          "Kirjoita sama sähköpostiosoite, johon kutsu lähetettiin.",
          "Kirjoita sähköpostiisi tullut koodi.",
          "Pääset vuokrasuhteen sivulle.",
        ],
      },
      {
        title: "Jos linkki ei toimi",
        bullets: [
          "Kutsu ei ole voimassa: linkki on vanhentunut tai vuokranantaja on tehnyt uuden. Pyydä vuokranantajalta uusi linkki.",
          "Kutsu on toiselle osoitteelle: olet kirjautunut eri sähköpostilla. Valitse Kirjaudu ulos ja yritä toisella osoitteella.",
          "Odota hetki: linkkiä on avattu monta kertaa lyhyessä ajassa. Yritä hetken päästä uudelleen.",
        ],
      },
    ],
    related: ["sopimus", "katselmus"],
  },
  {
    slug: "sopimus",
    group: "Asunto ja vuokrasuhde",
    title: "Vuokrasopimus",
    summary: "Vuokranantaja täyttää sopimuksen ehdot lomakkeella. Molemmat näkevät luonnoksen ja voivat kommentoida.",
    highlights: ["Esikatselu PDF-tiedostona", "Vuokralainen voi pyytää muutoksia kommentilla", "Allekirjoitus vasta alkukatselmuksen jälkeen"],
    roles: "both",
    sections: [
      {
        title: "Vuokranantaja täyttää ehdot",
        steps: [
          "Avaa vuokrasuhde ja valitse Vuokrasopimus.",
          "Täytä ehdot: irtisanomisaika, vakuuden maksupäivä ja avainten määrä.",
          "Jos sopimusta ei voi irtisanoa heti, valitse Sopimusta ei voi irtisanoa heti ja kirjoita kuukaudet.",
          "Valitse, mitä vuokraan sisältyy: vesi, sähkö, laajakaista tai kalusteet. Valitse myös, saako asunnossa tupakoida ja saako siellä olla lemmikkejä.",
          "Kirjoita tarvittaessa vuokrankorotusehto ja muut ehdot.",
          "Valitse Tallenna ehdot.",
          "Valitse Avaa esikatselu ja lue sopimus.",
        ],
      },
      {
        title: "Vuokralainen lukee luonnoksen",
        bullets: [
          "Vuokralainen näkee saman luonnoksen, mutta ei voi muuttaa ehtoja.",
          "Jos haluat muutoksia, kirjoita kommentti kohtaan Haluatko muutoksia? ja valitse Lähetä kommentti.",
          "Vuokranantaja näkee kommentin kohdassa Vuokralaisen toiveet.",
        ],
      },
      {
        title: "Kommentit",
        bullets: [
          "Kommentissa voi olla enintään 300 merkkiä.",
          "Molemmat näkevät kaikki kommentit.",
          "Kommenttia ei voi poistaa.",
        ],
      },
      {
        title: "Esikatselu",
        bullets: [
          "Esikatselu näyttää sopimuksen PDF-tiedostona.",
          "Valitse Tallenna PDF, jos haluat tiedoston itsellesi.",
          "Jos puhelin näyttää vain ensimmäisen sivun, tallenna tiedosto ja avaa se puhelimen tiedostoista.",
        ],
      },
    ],
    tips: [
      "Nimet ja tunnukset täytetään Osapuolten tiedot -sivulla.",
      "Kun sopimus on lähetetty allekirjoitettavaksi, sitä ei voi enää muuttaa.",
    ],
    related: ["osapuolet", "allekirjoitus"],
  },
  {
    slug: "osapuolet",
    group: "Asunto ja vuokrasuhde",
    title: "Osapuolten tiedot",
    summary: "Sopimukseen tulevat nimet, tunnukset ja yhteystiedot. Jokainen täyttää omansa.",
    highlights: ["Henkilötunnus tallennetaan salattuna", "Ruudulla tunnus näkyy aina peitettynä", "Täytä omista tiedoistani nopeuttaa"],
    roles: "both",
    sections: [
      {
        title: "Tietojen täyttäminen",
        steps: [
          "Avaa vuokrasuhde ja valitse Osapuolten tiedot.",
          "Valitse, oletko yksityishenkilö vai yritys tai yhteisö.",
          "Kirjoita nimi ja henkilötunnus. Yritykselle kirjoitetaan yrityksen nimi, Y-tunnus ja allekirjoittaja.",
          "Kirjoita puhelin ja sähköposti.",
          "Vuokranantaja kirjoittaa myös tilinumeron, jolle vuokra maksetaan.",
          "Valitse Tallenna tiedot.",
        ],
      },
      {
        title: "Kuka muokkaa mitäkin",
        bullets: [
          "Vuokranantaja voi muokata kaikkien tietoja.",
          "Vuokralainen voi muokata vain omia tietojaan. Jos toisen tiedoissa on virhe, kerro siitä hänelle.",
          "Kohdassa Sopimuksesta puuttuu vielä näet, mitä pitää vielä täyttää.",
        ],
      },
      {
        title: "Henkilötunnus",
        bullets: [
          "Henkilötunnus tulee sopimukseen, jotta osapuolet on yksilöity oikein.",
          "Se tallennetaan salattuna. Ruudulla näkyy vain osa tunnuksesta.",
          "Jos tallennettu tunnus on oikein, jätä kenttä tyhjäksi.",
          "Voit poistaa tallennetun tunnuksen valinnalla Poista tallennettu henkilötunnus.",
        ],
      },
    ],
    tips: ["Jos olet tallentanut omat perustietosi, valitse Täytä omista tiedoistani."],
    related: ["omat-tiedot", "sopimus"],
  },

  // --- Katselmus ja allekirjoitus -------------------------------------------
  {
    slug: "katselmus",
    group: "Katselmus ja allekirjoitus",
    title: "Alkukatselmus",
    summary: "Molemmat kuvaavat asunnon ennen allekirjoitusta. Kuvat auttavat välttämään riitoja lopussa.",
    highlights: ["Kuvaa huone kerrallaan", "Toisen kuvat näkyvät heti", "Kuvia ei voi poistaa eikä muuttaa"],
    roles: "both",
    sections: [
      {
        title: "Kuvaaminen",
        steps: [
          "Avaa vuokrasuhde ja valitse Alkukatselmus.",
          "Valitse huone listalta.",
          "Ota yleiskuva huoneesta. Kuvaa lisäksi ne kohdat, joiden kunnon haluat muistaa.",
          "Kirjoita halutessasi selite ennen kuvaa, esimerkiksi miksi kuvasit juuri tämän kohdan.",
          "Valitse Ota kuva. Puhelimen kamera aukeaa.",
          "Jatka seuraavaan huoneeseen.",
        ],
      },
      {
        title: "Tila, jota listalla ei ole",
        steps: [
          "Kirjoita tilan nimi kohtaan Puuttuuko listalta huone tai tila?",
          "Valitse Kuvaa tämä tila.",
          "Tila käydään läpi myös loppukatselmuksessa.",
        ],
      },
      {
        title: "Väärä kuva",
        steps: [
          "Valitse kuvan alta Merkitse, ettei tämä kuulu tähän.",
          "Kirjoita syy, esimerkiksi väärä huone.",
          "Valitse Merkitse.",
          "Kuva ei katoa. Merkintä näkyy molemmille ja pöytäkirjassa.",
        ],
      },
      {
        title: "Valmis ja lukitus",
        bullets: [
          "Kun vuokralainen on kuvannut, hän valitsee Olen valmis.",
          "Vuokranantaja lukitsee katselmuksen valinnalla Lukitse katselmus.",
          "Lukitseminen onnistuu, kun vuokralainen on valmis. Jos hän ei merkitse olevansa valmis, lukitseminen onnistuu 24 tunnin kuluttua siitä, kun hän avasi katselmuksen ensimmäisen kerran.",
          "Näin vuokralaisella on aina aikaa lisätä omat kuvansa.",
          "Lukituksen jälkeen kuvia ei voi lisätä. Uudet havainnot kirjataan huoltokirjaan.",
        ],
      },
      {
        title: "Pöytäkirja",
        bullets: [
          "Pöytäkirja syntyy, kun katselmus lukitaan. Avaa se valinnalla Avaa pöytäkirja.",
          "Pöytäkirjassa ovat kuvat huoneittain, selitteet, kuvaaja ja kuvan vastaanottoaika.",
          "Pöytäkirja allekirjoitetaan yhdessä sopimuksen kanssa.",
        ],
      },
    ],
    tips: [
      "Lista huoneen asioista on vihje, ei vaatimus. Mitään ei tarvitse merkitä tehdyksi.",
      "Kuvasta poistetaan aina sijaintitieto.",
      "Kuvia voi lähettää enintään 100 tunnissa.",
    ],
    related: ["allekirjoitus", "huoltokirja", "loppukatselmus"],
  },
  {
    slug: "allekirjoitus",
    group: "Katselmus ja allekirjoitus",
    title: "Allekirjoitus ja maksu",
    summary: "Sopimus ja alkukatselmuksen pöytäkirja allekirjoitetaan yhdessä pankkitunnuksilla.",
    highlights: ["Yksi tunnistautuminen kahdelle asiakirjalle", "Ensimmäinen vuokrasuhde on ilmainen", "Vuokralainen ei maksa mitään"],
    roles: "both",
    sections: [
      {
        title: "Ennen lähettämistä",
        bullets: [
          "Alkukatselmus on lukittu.",
          "Osapuolten tiedot on täytetty.",
          "Vuokranantaja on vahvistanut vuokrasuhteen maksun.",
          "Jos jokin puuttuu, sivu kertoo mitä.",
        ],
      },
      {
        title: "Maksu",
        steps: [
          "Vuokranantaja avaa vuokrasuhteen ja valitsee Allekirjoitus.",
          "Jos vuokrasuhde on ilmainen, valitse Ota käyttöön. Ensimmäinen vuokrasuhde on aina ilmainen.",
          "Muuten hinta on 29 euroa kerran. Lue ehto peruutusoikeudesta ja valitse ruutu.",
          "Valitse Maksa 29,00 €. Maksu tehdään kortilla maksupalvelun sivulla.",
        ],
      },
      {
        title: "Allekirjoittaminen",
        steps: [
          "Vuokranantaja valitsee Lähetä allekirjoitettavaksi.",
          "Jokainen saa oman allekirjoituslinkin sähköpostiinsa.",
          "Avaa linkki ja tunnistaudu pankkitunnuksilla tai mobiilivarmenteella.",
          "Sivulla näet, kuka on jo allekirjoittanut.",
          "Kun kaikki ovat allekirjoittaneet, vuokrasuhde on voimassa ja vuokrakuukaudet syntyvät.",
        ],
      },
    ],
    tips: ["Maksu voi sisältyä myös salkkutilaukseen tai suositteluetuun. Tilanteen näet Laskutus-sivulta."],
    related: ["katselmus", "laskutus", "vuokranmaksu"],
  },

  // --- Vuokrasuhteen aikana -------------------------------------------------
  {
    slug: "vuokranmaksu",
    group: "Vuokrasuhteen aikana",
    title: "Vuokranmaksu",
    summary: "Vuokranantaja kuittaa kerran kuussa, tuliko vuokra. Molemmat näkevät historian.",
    highlights: ["Kyllä, Ei vielä tai Osittain", "Vuokralainen voi kommentoida", "Merkintää voi muuttaa 30 päivää"],
    roles: "both",
    sections: [
      {
        title: "Vuokranantaja kuittaa",
        steps: [
          "Avaa vuokrasuhde ja valitse Vuokranmaksu.",
          "Valitse kuukauden kohdalta Kyllä, Ei vielä tai Osittain.",
          "Jos valitset Osittain, kirjoita paljonko tuli.",
          "Valitse Kuittaa.",
        ],
      },
      {
        title: "Vuokralainen",
        bullets: [
          "Näet jokaisesta kuukaudesta, mitä vuokranantaja on merkinnyt.",
          "Kun kuukausi on kuitattu, voit kirjoittaa kommentin. Enintään 300 merkkiä.",
          "Kommentti näkyy molemmille.",
        ],
      },
      {
        title: "Muuttaminen",
        bullets: [
          "Kuittausta voi muuttaa 30 päivän ajan valinnalla Muuta merkintää.",
          "Sen jälkeen merkintä lukittuu.",
        ],
      },
      {
        title: "Muistutus puhelimeen",
        bullets: [
          "Ota ilmoitukset käyttöön tällä sivulla tai Omissa tiedoissa.",
          "Silloin sovellus muistuttaa vuokranantajaa eräpäivänä, ja vuokralainen saa tiedon kuittauksesta.",
        ],
      },
    ],
    tips: [
      "Vuokrakuukaudet syntyvät, kun sopimus on allekirjoitettu.",
      "Reilusoppari ei näe pankkitiliä. Kuittaus on vuokranantajan oma merkintä.",
    ],
    related: ["verolaskelma", "omat-tiedot"],
  },
  {
    slug: "huoltokirja",
    group: "Vuokrasuhteen aikana",
    title: "Huoltokirja",
    summary: "Viat, korjaukset ja muut huomiot kuvineen samassa paikassa molempien nähtävillä.",
    highlights: ["Kumpi tahansa voi kirjata", "Kuvat ja kommentit", "Merkintää ei poisteta"],
    roles: "both",
    sections: [
      {
        title: "Uusi merkintä",
        steps: [
          "Avaa vuokrasuhde ja valitse Huoltokirja.",
          "Valitse laji: Vika, Korjaus tai Merkintä.",
          "Kirjoita otsikko ja halutessasi kuvaus.",
          "Valitse Tallenna merkintä.",
          "Lisää kuvat merkinnän sivulla valinnalla Lisää kuva.",
        ],
      },
      {
        title: "Kommentit",
        bullets: [
          "Merkinnän sivulla voi kirjoittaa kommentin. Enintään 300 merkkiä.",
          "Kommentti näkyy toiselle, eikä sitä voi poistaa.",
        ],
      },
      {
        title: "Korjattu",
        bullets: [
          "Kun vika on hoidettu, vuokranantaja valitsee Merkitse korjatuksi.",
          "Vuokralainen saa tiedon ja voi kommentoida.",
        ],
      },
      {
        title: "Vahingossa tehty merkintä",
        steps: [
          "Merkinnän tekijä valitsee Kirjasin tämän vahingossa.",
          "Kirjoita syy.",
          "Valitse Peru merkintä.",
          "Merkintä jää näkyviin yliviivattuna, ja syy näkyy molemmille.",
        ],
      },
    ],
    related: ["katselmus", "kulut"],
  },

  // --- Päättyminen -----------------------------------------------------------
  {
    slug: "paattyminen",
    group: "Päättyminen",
    title: "Irtisanominen ja vakuus",
    summary: "Irtisanominen kirjataan sovellukseen. Sen jälkeen tehdään loppukatselmus, vakuuden palautus ja todistukset.",
    highlights: ["Kumpi tahansa voi irtisanoa", "Sovellus laskee päättymispäivän", "Vakuuden palautus näkyy molemmille"],
    roles: "both",
    sections: [
      {
        title: "Irtisanominen",
        steps: [
          "Avaa vuokrasuhde ja valitse Päättyminen.",
          "Tarkista irtisanomisaika ja päättymispäivä.",
          "Valitse Irtisano.",
          "Vahvista valinnalla Kyllä, irtisano. Toinen saa tiedon heti.",
        ],
      },
      {
        title: "Irtisanomisaika",
        bullets: [
          "Aika lasketaan kuluvan kuukauden viimeisestä päivästä.",
          "Vuokralaisella irtisanomisaika on vähintään yksi kuukausi.",
          "Vuokranantajalla se on vähintään kolme kuukautta. Jos vuokrasuhde on kestänyt yli vuoden, se on kuusi kuukautta.",
          "Jos sopimuksessa on pidempi aika, käytetään sitä.",
          "Määräaikaista sopimusta ei voi irtisanoa yksin.",
        ],
      },
      {
        title: "Mitä sen jälkeen",
        steps: ["Loppukatselmus.", "Vakuuden palautus.", "Arviot ja todistukset."],
      },
      {
        title: "Vakuuden palautus",
        steps: [
          "Vuokranantaja kirjoittaa palautuksen päivän ja summan.",
          "Valitse Kirjaa palautus.",
          "Jos palautat vähemmän kuin vakuus, kerro syy huoltokirjassa.",
          "Vuokralainen näkee merkinnän, ja se tulee vuokratodistukseen.",
        ],
      },
    ],
    tips: ["Irtisanomista ei voi perua sovelluksessa."],
    related: ["loppukatselmus", "todistukset"],
  },
  {
    slug: "loppukatselmus",
    group: "Päättyminen",
    title: "Loppukatselmus",
    summary: "Asunto kuvataan samoista tiloista kuin alussa. Alun kuvat näkyvät vieressä.",
    highlights: ["Samat tilat samassa järjestyksessä", "Alkukuvat vertailuksi", "Pöytäkirja allekirjoitetaan pankkitunnuksilla"],
    roles: "both",
    sections: [
      {
        title: "Kuvaaminen",
        steps: [
          "Kun irtisanominen on kirjattu, valitse Päättyminen-sivulla Avaa loppukatselmus.",
          "Valitse tila. Alkukatselmuksen kuvat näkyvät otsikon Näin tämä tila oli vuokrasuhteen alkaessa alla.",
          "Ota kuvat samalla tavalla kuin alussa.",
          "Vuokralainen valitsee Olen valmis, ja vuokranantaja lukitsee katselmuksen.",
        ],
      },
      {
        title: "Allekirjoitus",
        steps: [
          "Lukituksen jälkeen vuokranantaja valitsee Lähetä pöytäkirja allekirjoitettavaksi.",
          "Molemmat saavat linkin sähköpostiinsa ja allekirjoittavat pankkitunnuksilla.",
          "Kun pöytäkirja on allekirjoitettu, vuokrasuhde on päättynyt.",
        ],
      },
    ],
    tips: ["Tavanomainen kuluminen ei ole vahinko.", "Lukitussääntö on sama kuin alussa: vuokralaisella on vähintään 24 tuntia aikaa."],
    related: ["katselmus", "todistukset"],
  },
  {
    slug: "todistukset",
    group: "Päättyminen",
    title: "Arviot ja vuokratodistukset",
    summary: "Lopuksi kumpikin voi suositella toista, ja molemmat saavat oman sinetöidyn vuokratodistuksen.",
    highlights: ["Todistus syntyy aina, myös ilman arviota", "Kielteistä arviota ei ole", "Jaa todistus linkillä"],
    roles: "both",
    sections: [
      {
        title: "Arvion antaminen",
        steps: [
          "Avaa vuokrasuhde ja Päättyminen-sivulta Avaa todistukset.",
          "Valitse toisen todistuksesta Suosittelen tai En anna arviota.",
          "Kirjoita halutessasi omin sanoin. Enintään 300 merkkiä.",
          "Valitse Tallenna arvio.",
          "Aikaa on seitsemän päivää loppukatselmuksen allekirjoituksesta.",
        ],
      },
      {
        title: "Vastine",
        bullets: [
          "Näet, mitä toinen kirjoitti sinusta.",
          "Voit liittää vastineen seitsemän päivän kuluessa. Enintään 300 merkkiä.",
        ],
      },
      {
        title: "Sinetöinti",
        bullets: [
          "Kun vastine on annettu tai aika on kulunut, valitse Sinetöi todistus.",
          "Sinetöidyn todistuksen sisältö ei voi enää muuttua.",
          "Jos arviota ei anneta, todistukseen ei tule siitä mitään merkintää.",
        ],
      },
      {
        title: "Todistuksen jakaminen",
        steps: [
          "Valitse Tallenna todistus, jos haluat PDF-tiedoston.",
          "Valitse Luo jakolinkki. Linkki on voimassa 30 päivää.",
          "Kopioi linkki heti. Sitä ei näytetä uudelleen.",
          "Näet, montako kertaa linkki on avattu.",
          "Voit lopettaa linkin toiminnan valinnalla Mitätöi.",
        ],
      },
      {
        title: "Todistuksen aitous",
        text: "Todistuksen saaja voi tarkistaa aitouden sivulla Tarkista todistuksen aitous. Tarkistus ei näytä todistuksen sisältöä.",
      },
    ],
    tips: ["Oman todistuksesi näet vain sinä. Muut näkevät sen vain, jos jaat linkin."],
    related: ["yhteydenotto", "paattyminen"],
  },
  {
    slug: "yhteydenotto",
    group: "Päättyminen",
    title: "Yhteydenottolupa ja keskustelu",
    summary: "Todistuksen antaja voi sallia, että uusi vuokranantaja tai vuokralainen kysyy häneltä lisää.",
    highlights: ["Keskustelu Reilusopparissa, ei sähköpostissa", "Yhteystietoja ei näytetä", "Se, josta keskustellaan, näkee kaiken"],
    roles: "both",
    upcoming: true,
    sections: [
      {
        title: "Luvan antaminen",
        steps: [
          "Avaa todistukset.",
          "Valitse toisen todistuksesta Saa ottaa minuun yhteyttä tästä vuokrasuhteesta.",
          "Valitse Salli yhteydenotto.",
          "Voit perua luvan milloin vain valinnalla Peru lupa.",
        ],
      },
      {
        title: "Kysymykset todistuksesta",
        bullets: [
          "Jakolinkin avaaja voi valita Kysy lisää, jos lupa on annettu.",
          "Kysyjän pitää kirjautua ja tunnistautua pankkitunnuksilla.",
          "Keskusteluun kirjoittavat kysyjä ja todistuksen antaja. Viestissä voi olla enintään 1000 merkkiä.",
          "Se, josta keskustellaan, näkee kaikki viestit mutta ei kirjoita.",
          "Yksi todistus voi saada enintään kolme keskustelua.",
          "Kun lupa perutaan, keskustelut sulkeutuvat. Viestit jäävät näkyviin.",
        ],
      },
    ],
    tips: ["Tunnistautuminen pankkitunnuksilla ei ole vielä käytössä. Siksi uutta keskustelua ei voi vielä avata."],
    related: ["todistukset"],
  },

  // --- Kulut ja verotus --------------------------------------------------------
  {
    slug: "kulut",
    group: "Kulut ja verotus",
    title: "Kulut ja kuitit",
    summary: "Kirjaa asunnon kulut ja kuvaa kuitit. Kulut kootaan verolaskelmaan.",
    highlights: ["Kuitti kuvataan puhelimella", "Summa ja päivä luetaan kuitista valmiiksi", "Kulut näkee vain vuokranantaja"],
    roles: "landlord",
    sections: [
      {
        title: "Kulun kirjaaminen",
        steps: [
          "Avaa asunto ja valitse Kulut. Voit kirjata kulun myös vuokrasuhteen Kulut-sivulla.",
          "Valitse Uusi kulu.",
          "Valitse kululuokka. Luokan alla on lyhyt ohje.",
          "Kirjoita päivä, summa ja halutessasi kuvaus.",
          "Valitse Tallenna kulu.",
          "Jos sinulla on kuitti, valitse Kuvaa kuitti.",
        ],
      },
      {
        title: "Kuitin kuvaaminen",
        steps: [
          "Avaa Asunnot ja valitse Kuvaa kuitti.",
          "Kuvaa kuitti. Sovellus lukee siitä summan ja päivän.",
          "Tarkista luetut tiedot ja korjaa tarvittaessa. Ne ovat ehdotus.",
          "Valitse asunto, jos sinulla on useampi.",
          "Valitse kululuokka itse.",
          "Valitse Tallenna kulu.",
        ],
      },
      {
        title: "Kululuokat",
        bullets: [
          "Vuosikorjaus, hoitovastike, tuloutettu rahoitusvastike, kalusteet ja laitteet, matkakulut, vakuutus ja muu kulu ovat vuosikuluja.",
          "Rahastoitu rahoitusvastike, perusparannus ja korot eivät ole vuosikuluja. Ne näkyvät laskelmassa omana osionaan.",
          "Matkakuluissa riittää kilometrimäärä. Sovellus laskee summan vuoden kilometrikorvauksella.",
        ],
      },
    ],
    tips: [
      "Vuokralainen ei näe kuluja eikä kuitteja.",
      "Jos kuitin luku ei onnistu, täytä kentät itse. Kuitti tallentuu silti.",
      "Kuvasta poistetaan sijaintitieto.",
      "Kulua ei voi vielä muokata eikä poistaa sovelluksessa.",
    ],
    related: ["toistuvat-kulut", "verolaskelma"],
  },
  {
    slug: "toistuvat-kulut",
    group: "Kulut ja verotus",
    title: "Toistuvat kulut",
    summary: "Kuukausittainen kulu, kuten hoitovastike, kirjataan kerran. Sovellus laskee vuoden summan.",
    highlights: ["Kirjaa kerran, ei joka kuukausi", "Summan muutos alkaa valitusta kuukaudesta", "Jatkuu myös tyhjinä kuukausina"],
    roles: "landlord",
    sections: [
      {
        title: "Uusi toistuva kulu",
        steps: [
          "Avaa asunto ja valitse Toistuvat kulut.",
          "Valitse Lisää toistuva kulu.",
          "Kirjoita, mikä kulu on, esimerkiksi hoitovastike.",
          "Valitse luokka, kirjoita summa kuukaudessa ja valitse alkukuukausi.",
          "Valitse Tallenna.",
        ],
      },
      {
        title: "Kun summa muuttuu",
        steps: [
          "Valitse Summa muuttui.",
          "Kirjoita uusi summa ja kuukausi, josta se alkaa.",
          "Valitse Tallenna muutos. Aiemmat kuukaudet eivät muutu.",
        ],
      },
      {
        title: "Kun kulu loppuu",
        steps: ["Valitse Kulu loppui.", "Valitse viimeinen kuukausi.", "Valitse Merkitse päättyneeksi."],
      },
    ],
    tips: ["Jos kausissa on päällekkäisyyksiä tai aukkoja, sivu näyttää kohdan Tarkista nämä."],
    related: ["kulut", "verolaskelma"],
  },
  {
    slug: "verolaskelma",
    group: "Kulut ja verotus",
    title: "Verolaskelma",
    summary: "Vuoden vuokratulot ja kulut asunnoittain. Luvut on helppo siirtää OmaVeroon.",
    highlights: [
      "Vuokratulo tulee kuittauksista",
      "Kulut luokittain",
      "Laskelman voi tallentaa ja sinetöidä",
      "Sinetöinti maksaa, paitsi jos sinulla on salkkutilaus",
    ],
    roles: "landlord",
    sections: [
      {
        title: "Mistä laskelma koostuu",
        bullets: [
          "Vuokratulo: vuokranmaksun kuittaukset. Kuittaamaton kuukausi on nolla.",
          "Vuosikuluina vähennettävät: kulut ja toistuvat kulut luokittain.",
          "Muut kirjaukset: rahastoitu rahoitusvastike, perusparannus ja korot erikseen.",
          "Lopussa vuokratulo miinus vuosikulut.",
        ],
      },
      {
        title: "Laskelman käyttäminen",
        steps: [
          "Avaa asunto ja valitse Verolaskelma.",
          "Valitse vuosi, jos vaihtoehtoja on useampi.",
          "Tarkista kuittaukset ja kulut.",
          "Siirrä luvut OmaVeroon.",
          "Valitse Tallenna PDF, jos haluat laskelman tiedostona.",
          "Valitse Sinetöi laskelma. Sinetöity laskelma ei voi muuttua jälkikäteen.",
          "Jos sinulla ei ole salkkutilausta, sinut ohjataan ensin maksamaan Plus.",
        ],
      },
    ],
    tips: [
      "Laskelma on yhteenveto omista kirjauksistasi, ei veroneuvontaa.",
      "Reilusoppari ei lähetä veroilmoitusta.",
      "Kuitit eivät ole PDF-tiedostossa. Ne säilyvät sovelluksessa.",
      "Ensimmäinen sinetöinti tälle asunnolle aloittaa Plus-tilauksen, 12 euroa asunnolta vuodessa. Voit perua sen milloin vain. Jos sinulla on salkkutilaus, Plus sisältyy siihen.",
    ],
    related: ["kulut", "vuokranmaksu", "laskutus"],
  },

  // --- Tili ja palvelu -------------------------------------------------------
  {
    slug: "omat-tiedot",
    group: "Tili ja palvelu",
    title: "Omat tiedot ja ilmoitukset",
    summary: "Tallenna perustietosi kerran, ota ilmoitukset käyttöön ja lataa omat tietosi.",
    highlights: ["Tiedot kopioituvat uuteen vuokrasuhteeseen", "Ilmoitukset puhelimeen", "Kaikki tietosi yhtenä tiedostona"],
    roles: "both",
    appPath: "/omat-tiedot",
    appLabel: "Omat tiedot",
    sections: [
      {
        title: "Perustiedot",
        steps: [
          "Avaa Omat tiedot.",
          "Kirjoita nimesi, tunnuksesi ja yhteystietosi.",
          "Tallenna. Tiedot täyttyvät valmiiksi seuraavaan vuokrasuhteeseen.",
        ],
      },
      {
        title: "Ilmoitukset puhelimeen",
        steps: [
          "Valitse Ota ilmoitukset käyttöön.",
          "Salli ilmoitukset, kun puhelin kysyy.",
          "iPhonessa lisää ensin Reilusoppari Koti-valikkoon. Sivu neuvoo, miten.",
        ],
      },
      {
        title: "Vie omat tietosi",
        bullets: [
          "Valitse Lataa tietoni.",
          "Saat yhden tiedoston, jossa ovat vuokrasuhteet, vuokrahistoria, huoltokirja, katselmuskuvat ja allekirjoitetut asiakirjat.",
        ],
      },
    ],
    related: ["osapuolet", "laskutus"],
  },
  {
    slug: "laskutus",
    group: "Tili ja palvelu",
    title: "Hinnat ja laskutus",
    summary: "Ensimmäinen vuokrasuhde on ilmainen. Vuokralainen ei maksa koskaan.",
    highlights: ["29 euroa kerran vuokrasuhteesta", "Salkkuhinta viidestä asunnosta alkaen", "Maksu vasta allekirjoitukseen lähetettäessä"],
    roles: "landlord",
    appPath: "/laskutus",
    appLabel: "Laskutus",
    sections: [
      {
        title: "Mitä maksat",
        bullets: [
          "Ensimmäinen vuokrasuhteesi on ilmainen.",
          "Seuraavat maksavat 29 euroa kerran. Hinnassa on arvonlisävero.",
          "Maksat vasta, kun lähetät sopimuksen allekirjoitettavaksi.",
          "Laskutus-sivulla näet, mitä seuraava vuokrasuhde maksaa.",
          "Saat maksusta vahvistuksen sähköpostiin.",
        ],
      },
      {
        title: "Salkkuhinta",
        bullets: [
          "Jos sinulla on vähintään viisi asuntoa, voit tilata salkun. Se maksaa 15 euroa asunnolta vuodessa.",
          "Salkku sisältää kaikki vuokrasuhteet ja verolaskelmat.",
          "Sivu kertoo suoraan, kannattaako salkku sinulle.",
          "Valitse Laskut ja maksutapa, jos haluat nähdä laskut, vaihtaa kortin tai lopettaa tilauksen.",
        ],
      },
      {
        title: "Peruutusoikeus",
        text: "Sinulla on 14 päivän peruutusoikeus. Se päättyy, kun lähetät sopimuksen allekirjoitettavaksi, koska palvelu alkaa silloin.",
      },
    ],
    related: ["suosittelu", "allekirjoitus"],
  },
  {
    slug: "suosittelu",
    group: "Tili ja palvelu",
    title: "Tuo kaveri",
    summary: "Suosittele Reilusopparia toiselle vuokranantajalle. Saatte molemmat yhden vuokrasuhteen ilmaiseksi.",
    highlights: ["Oma linkki", "Etu syntyy, kun kaveri aloittaa", "Näet kutsutut ja edut"],
    roles: "landlord",
    appPath: "/suosittele",
    appLabel: "Tuo kaveri",
    sections: [
      {
        title: "Näin suosittelet",
        steps: [
          "Avaa Omat tiedot ja valitse Oma suositteluosoitteesi.",
          "Valitse Kopioi linkki.",
          "Lähetä linkki kaverille.",
          "Kun kaveri lähettää ensimmäisen sopimuksensa allekirjoitettavaksi, saatte molemmat edun.",
        ],
      },
      {
        title: "Etu",
        bullets: [
          "Sinä saat yhden vuokrasuhteen ilmaiseksi.",
          "Kaverin etu koskee hänen toista vuokrasuhdettaan, koska ensimmäinen on muutenkin ilmainen.",
          "Sivulla näet, montako olet kutsunut, montako on aloittanut ja montako etua sinulla on jäljellä.",
        ],
      },
    ],
    related: ["laskutus"],
  },
  {
    slug: "kehitystoiveet",
    group: "Tili ja palvelu",
    title: "Kehitystoiveet",
    summary: "Kerro, mitä toivot Reilusopparilta. Näet toiveesi tilan ja vastauksen.",
    highlights: ["Toive suoraan siltä sivulta, jota se koskee", "Tärkeys: olisi mukava, tärkeä tai estää käytön", "Toiveesi näet vain sinä"],
    roles: "both",
    appPath: "/kehitystoiveet",
    appLabel: "Kehitystoiveet",
    sections: [
      {
        title: "Toiveen jättäminen",
        steps: [
          "Valitse sivun yläreunasta Kehitystoive. Toiminto on silloin valmiiksi valittu.",
          "Tarkista toiminto, jota toive koskee.",
          "Kirjoita lyhyt otsikko.",
          "Kerro, mitä yritit tehdä ja mikä oli hankalaa.",
          "Valitse, kuinka tärkeä asia on sinulle.",
          "Liitä halutessasi kuvakaappaus. Se ei ole pakollinen.",
          "Valitse Lähetä toive.",
        ],
      },
      {
        title: "Toiveen tila",
        bullets: [
          "Vastaanotettu: toive on tullut perille.",
          "Hyväksytty: toive on otettu työjonoon.",
          "Työn alla: toivetta tehdään.",
          "Testattavana: korjaus on tehty ja sitä testataan.",
          "Tehty: toive on sovelluksessa. Saat tästä myös viestin.",
          "Ei toteuteta: toive ei sovi sovellukseen. Vastauksessa kerrotaan syy.",
        ],
      },
      {
        title: "Kuka näkee toiveen",
        bullets: [
          "Toiveesi näet vain sinä ja Reilusopparin ylläpito.",
          "Toinen osapuoli ei näe toiveitasi.",
          "Omat toiveesi löydät Omista tiedoista kohdasta Omat kehitystoiveesi.",
        ],
      },
    ],
    tips: ["Älä kirjoita toiveeseen henkilötunnuksia tai muiden ihmisten tietoja."],
  },
];

/** Ohjeen osion ankkuri otsikosta: "Kun summa muuttuu" → "kun-summa-muuttuu". */
export function sectionId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[äå]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function helpTopic(slug: string): HelpTopic | null {
  return HELP_TOPICS.find((t) => t.slug === slug) ?? null;
}
