/**
 * Vuokrasopimus, asuinhuoneisto (CLAUDE.md 5.1).
 *
 * ===========================================================================
 * JURIDINEN SISÄLTÖ ON JUKAN VASTUULLA
 *
 * Ehtojen sanamuodot alla ovat luonnos, joka noudattaa asuinhuoneiston
 * vuokrauksesta annettua lakia (481/1995) mutta jota **ei ole tarkistettu
 * juristilla**. Vastapuoli on kuluttaja (CLAUDE.md kohta 9.4). Tekstit on
 * koottu yhteen paikkaan (`buildTerms`), jotta ne voi lukea ja korjata
 * katsomatta taittoa.
 *
 * ULKOASU EI OLE KORISTE
 *
 * Sopimus allekirjoitetaan tilanteessa, jossa toinen osapuoli on usein ensi
 * kertaa vuokralla. Viranomaisen näköinen paperi tekee tilanteesta
 * vastakkainasettelun; koko tuotteen lupaus on päinvastainen. Siksi otsikot
 * ovat suomea, ehdot lyhyitä ja lopussa on lämmin loppusana.
 * `DECISIONS.md` 2026-09-11.
 * ===========================================================================
 */

import { Page, Text, View } from "@react-pdf/renderer";
import {
  ClosingNote,
  DocumentFooter,
  DocumentHeader,
  DocumentRoot,
  Heading,
  KeyFacts,
  Panel,
  Signatures,
  Terms,
  Title,
  pageStyle,
  type Fact,
  type Term,
} from "./components";
import { HomeVignette, LeafSprig, PageDecoration } from "./decorations";
import { addMonths, formatAddress, formatArea, formatCount, formatDate, formatEuro, formatNames } from "./format";
import { colors, spacing, type as typeScale } from "./theme";

export interface RentalAgreementData {
  property: {
    street: string;
    postalCode: string;
    city: string;
    /** `2h+k`-tyyppinen kuvaus muodostetaan huoneluvusta; molemmat valinnaisia. */
    rooms?: number | null;
    areaM2?: number | null;
  };
  landlordName: string;
  tenantNames: string[];

  startDate: string;
  /** Määräaikaisen sopimuksen päättymispäivä. `null` = toistaiseksi voimassa. */
  endDate: string | null;

  rentAmount: number;
  rentDueDay: number;
  depositAmount: number;

  /** Irtisanomisaika kuukausina. Laki asettaa vähimmäisajat, ks. `buildTerms`. */
  noticePeriodMonths: number;
  /**
   * Kuukausimäärä, jonka kuluessa sopimusta ei voi irtisanoa. `null` = ei
   * rajoitusta. Eri asia kuin määräaikainen: sopimus jatkuu tämän jälkeen.
   */
  minimumTermMonths: number | null;
  furnished: boolean;
  /** Vakuuden eräpäivä, jos siitä on sovittu. */
  depositDueDate: string | null;
  /** Erillinen vesimaksu, kun vesi ei sisälly vuokraan. */
  waterChargeEur: number | null;
  waterChargePerPerson: boolean;
  broadbandIncluded: boolean;
  insuranceRequired: boolean;
  /** Vuokrankorotusehto omin sanoin, esim. "elinkustannusindeksin mukaan vuosittain". */
  rentIncreaseTerm: string | null;

  keysCount: number | null;
  smokingAllowed: boolean;
  petsAllowed: boolean;
  waterIncluded: boolean;
  electricityIncluded: boolean;
  otherTerms: string | null;

  /** Allekirjoituspaikka. Yleensä asunnon kaupunki. */
  place: string;
  /** Sopimuksen päiväys. Määrää myös PDF:n aikaleimat (`render.ts`). */
  signedDate: string;
}

/**
 * Sopimusehdot tekstinä.
 *
 * Yksi funktio, koska juuri nämä sanamuodot Jukka lukee ja korjaa. Taitto on
 * muualla, eikä sen muuttaminen saa vaatia juridisen tekstin koskemista.
 */
export function buildTerms(data: RentalAgreementData): Term[] {
  const terms: Term[] = [];

  const kuvaus = data.property.rooms
    ? `${data.property.rooms}h+k${data.property.areaM2 ? `, noin ${formatArea(data.property.areaM2)} m²` : ""}`
    : "asuinhuoneisto";

  terms.push({
    title: "Vuokrattava koti",
    body:
      `Vuokrauksen kohteena on ${kuvaus} osoitteessa ${formatAddress(data.property)}. ` +
      `Asunto vuokrataan ${data.furnished ? "kalustettuna" : "kalustamattomana"}.`,
  });

  terms.push({
    title: "Vuokra ja maksaminen",
    body:
      `Vuokra on ${formatEuro(data.rentAmount)} kuukaudessa ja maksetaan viimeistään ` +
      `jokaisen kuukauden ${data.rentDueDay}. päivä.` +
      (data.rentIncreaseTerm ? ` Vuokraa tarkistetaan ${data.rentIncreaseTerm}.` : "") +
      " Myöhässä maksetulle vuokralle kertyy korkolain mukaista viivästyskorkoa.",
  });

  terms.push({
    title: "Vesi, sähkö ja laajakaista",
    body: [
      data.waterIncluded
        ? "Vesi sisältyy vuokraan."
        : data.waterChargeEur !== null
          ? `Vedestä maksetaan ${formatEuro(data.waterChargeEur)} kuukaudessa ` +
            `${data.waterChargePerPerson ? "henkilöä kohden" : "asuntoa kohden"}.`
          : "Vesi maksetaan vuokran lisäksi käytön mukaan.",
      data.electricityIncluded
        ? "Sähkö sisältyy vuokraan."
        : "Vuokralainen tekee oman sähkösopimuksensa ja pitää sen voimassa koko vuokrasuhteen ajan.",
      data.broadbandIncluded
        ? "Laajakaista sisältyy vuokraan."
        : "Laajakaistan vuokralainen hankkii halutessaan itse.",
    ].join(" "),
  });

  terms.push({
    title: "Vakuus",
    body:
      `Vakuus on ${formatEuro(data.depositAmount)}.` +
      (data.depositDueDate
        ? ` Se maksetaan viimeistään ${formatDate(data.depositDueDate)}.`
        : "") +
      " Vakuus palautetaan vuokrasuhteen päättyessä, kun avaimet on palautettu, " +
      "loppukatselmus on tehty ja sovitut asiat hoidettu. Jos vuokraa tai muuta " +
      "sovittua maksua jää maksamatta kirjallisesta muistutuksesta huolimatta, " +
      "vuokranantaja voi käyttää vakuutta niiden kattamiseen.",
  });

  terms.push({
    title: "Sopimuksen kesto",
    body: data.endDate
      ? `Sopimus on määräaikainen ja päättyy ${formatDate(data.endDate)}. ` +
        "Määräaikaista sopimusta ei voi irtisanoa kesken kauden ilman laissa " +
        "säädettyä perustetta."
      : data.minimumTermMonths
        ? "Sopimus on voimassa toistaiseksi. " +
          `Ensimmäiset ${formatCount(data.minimumTermMonths, "kuukausi", "kuukautta")} ` +
          "kumpikaan ei kuitenkaan voi irtisanoa sitä: aikaisin mahdollinen " +
          `irtisanomispäivä on ${formatDate(addMonths(data.startDate, data.minimumTermMonths))}. ` +
          "Sen jälkeen sopimus jatkuu toistaiseksi voimassa olevana."
        : "Sopimus on voimassa toistaiseksi.",
  });

  terms.push({
    title: "Irtisanominen",
    body: data.endDate
      ? "Määräaikainen sopimus päättyy sovittuna päivänä ilman irtisanomista."
      : `Irtisanomisaika on ${formatCount(data.noticePeriodMonths, "kuukausi", "kuukautta")}. ` +
        "Laki asettaa vähimmäisajat: vuokralaiselle yksi kuukausi, " +
        "vuokranantajalle kolme kuukautta ja yli vuoden kestäneessä " +
        "vuokrasuhteessa kuusi kuukautta.",
  });

  terms.push({
    title: "Muuttopäivä",
    body:
      "Muuttopäivä on vuokrasuhteen päättymispäivää seuraava arkipäivä. Silloin " +
      "asunnosta luovutetaan puolet, ja sitä seuraavana päivänä koko asunto " +
      "tyhjennettynä ja siivottuna.",
  });

  terms.push({
    title: "Asunnon kunto",
    body:
      "Asunnon kunto todetaan yhdessä alkukatselmuksessa, ja siitä tehdään " +
      "erillinen pöytäkirja kuvineen. Sama lista käydään läpi vuokrasuhteen " +
      "päättyessä, joten kummankaan ei tarvitse muistaa mitään ulkoa.",
  });

  terms.push({
    title: "Asunnon käyttö",
    body:
      "Asuntoa käytetään ensisijaisesti asumiseen. " +
      (data.smokingAllowed
        ? "Tupakointi on sallittu. "
        : "Tupakointi sisätiloissa ei ole sallittua. ") +
      (data.petsAllowed ? "Lemmikit ovat sallittuja." : "Lemmikkejä ei pidetä asunnossa."),
  });

  terms.push({
    title: "Muutostyöt",
    body:
      "Asunnossa ei tehdä korjaus- tai muutostöitä ilman vuokranantajan kirjallista " +
      "lupaa. Lupa tarvitaan myös maalaamiseen, tapetointiin ja kiinteiden " +
      "kalusteiden vaihtamiseen.",
  });

  terms.push({
    title: "Vuokranantajan vastuut",
    body:
      "Vuokranantaja vastaa asunnon rakenteista ja kiinteistä laitteista sekä " +
      "korjaa niissä ilmenevät viat kohtuullisessa ajassa siitä, kun on saanut " +
      "tiedon viasta.",
  });

  terms.push({
    title: "Vuokralaisen vastuut",
    body:
      "Vuokralainen pitää asunnon hyvässä kunnossa ja ilmoittaa vioista " +
      "viipymättä. Tavanomainen kuluminen ei ole vahinko.",
  });

  if (data.insuranceRequired) {
    terms.push({
      title: "Kotivakuutus",
      body:
        "Vuokralaisella on koko vuokrasuhteen ajan voimassa kotivakuutus, jossa on " +
        "vastuuvakuutus. Se suojaa myös vuokralaista itseään, jos asunnolle sattuu " +
        "jotain.",
    });
  }

  terms.push({
    title: "Asunnon luovuttaminen eteenpäin",
    body:
      "Asuntoa ei vuokrata eteenpäin eikä sopimusta siirretä toiselle ilman " +
      "vuokranantajan lupaa.",
  });

  terms.push({
    title: "Avaimet",
    body:
      (data.keysCount
        ? `Vuokralaiselle luovutetaan ${formatCount(data.keysCount, "avain", "avainta")}. `
        : "Avaimet luovutetaan vuokrasuhteen alkaessa. ") +
      "Ne palautetaan vuokrasuhteen päättyessä. Jos avain jää palauttamatta, " +
      "vuokranantaja voi teettää uudet avaimet vuokralaisen kustannuksella.",
  });

  terms.push({
    title: "Loppusiivous",
    body:
      "Vuokralainen siivoaa asunnon lähtiessään: kaapit, lattiat ja pinnat " +
      "pyyhitään ja roskat viedään. Ikkunanpesu ei kuulu loppusiivoukseen.",
  });

  terms.push({
    title: "Arvio vuokrasuhteesta",
    body:
      "Vuokrasuhteen päättyessä kumpikin osapuoli voi antaa toisestaan arvion " +
      "ja saa oman vuokratodistuksensa. Tämä on tiedossa jo nyt, eikä se tule " +
      "kummallekaan yllätyksenä lopussa.",
  });

  terms.push({
    title: "Sovellettava laki",
    body:
      "Muilta osin noudatetaan asuinhuoneiston vuokrauksesta annettua lakia " +
      "(481/1995).",
  });

  if (data.otherTerms) {
    terms.push({ title: "Muut ehdot", body: data.otherTerms });
  }

  return terms;
}

function buildFacts(data: RentalAgreementData): Fact[] {
  return [
    {
      icon: "koti",
      label: "Koti",
      value: data.property.street,
      detail: `${data.property.postalCode} ${data.property.city}`,
    },
    {
      icon: "kalenteri",
      label: data.endDate ? "Vuokrasuhde" : "Vuokrasuhde alkaa",
      value: data.endDate
        ? `${formatDate(data.startDate)} – ${formatDate(data.endDate)}`
        : formatDate(data.startDate),
      // Sitoutumisaika kerrotaan jo tässä. Se on lukijalle yhtä olennainen
      // kuin vuokra, eikä sitä pidä joutua etsimään ehtojen joukosta.
      detail: data.endDate
        ? "Määräaikainen"
        : data.minimumTermMonths
          ? `Toistaiseksi voimassa · irtisanottavissa aikaisintaan ${formatDate(addMonths(data.startDate, data.minimumTermMonths))}`
          : "Toistaiseksi voimassa",
    },
    {
      icon: "henkilo",
      label: data.tenantNames.length > 1 ? "Vuokralaiset" : "Vuokralainen",
      value: formatNames(data.tenantNames),
    },
    {
      icon: "raha",
      label: "Vuokra",
      value: `${formatEuro(data.rentAmount)} / kk`,
      detail: `Eräpäivä ${data.rentDueDay}. päivä`,
    },
    { icon: "henkilo", label: "Vuokranantaja", value: data.landlordName },
    { icon: "kilpi", label: "Vakuus", value: formatEuro(data.depositAmount) },
  ];
}

export function RentalAgreement({ data }: { data: RentalAgreementData }) {
  const terms = buildTerms(data);

  return (
    <DocumentRoot
      title={`Vuokrasopimus – ${formatAddress(data.property)}`}
      subject="Asuinhuoneiston vuokrasopimus"
      date={data.signedDate}
    >
      <Page size="A4" style={pageStyle}>
        {/* Ensimmäisenä, jotta sisältö piirtyy taustamuotojen päälle. */}
        <PageDecoration />

        <DocumentHeader />
        <DocumentFooter />

        <Title
          lead="Tämä on sopimus kodista, jonka vuokralainen ja vuokranantaja ovat sopineet yhdessä."
          aside={<HomeVignette />}
        >
          Vuokrasopimus
        </Title>

        <KeyFacts facts={buildFacts(data)} />

        <View style={{ marginTop: spacing.block + 6 }}>
          <Heading>Sopimuksen ehdot</Heading>
          <Terms terms={terms} />
        </View>

        <ClosingNote
          title="Kiitos, että olette sopineet tästä yhdessä."
          body="Toivottavasti tästä alkaa monta hyvää vuotta kodissa."
          sprig={<LeafSprig />}
        />

        <Signatures
          place={data.place}
          date={formatDate(data.signedDate)}
          signatories={[
            ...data.tenantNames.map((name) => ({ role: "Vuokralainen", name })),
            { role: "Vuokranantaja", name: data.landlordName },
          ]}
        />

        {/*
          Allekirjoitustapa sanotaan ääneen: lukijan on tiedettävä, ettei
          tähän kirjoiteta kynällä eikä viivalle jätetä mitään.
        */}
        <Panel style={{ marginTop: 14, backgroundColor: colors.paper, padding: 0 }}>
          <Text style={{ fontSize: typeScale.label, color: colors.inkFaint }}>
            Sopimus allekirjoitetaan sähköisesti vahvalla tunnistautumisella. Allekirjoitettu
            asiakirja ja sen aitoustiedot toimitetaan kummallekin osapuolelle.
          </Text>
        </Panel>

      </Page>
    </DocumentRoot>
  );
}
