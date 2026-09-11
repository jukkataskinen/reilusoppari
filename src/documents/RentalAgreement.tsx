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
import { formatAddress, formatCount, formatDate, formatEuro, formatNames } from "./format";
import { colors, spacing, type as typeScale } from "./theme";

export interface RentalAgreementData {
  property: { street: string; postalCode: string; city: string };
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

  terms.push({
    title: "Vuokra ja maksaminen",
    body:
      `Vuokra on ${formatEuro(data.rentAmount)} kuukaudessa ja maksetaan viimeistään ` +
      `jokaisen kuukauden ${data.rentDueDay}. päivä.` +
      (data.rentIncreaseTerm ? ` Vuokraa tarkistetaan ${data.rentIncreaseTerm}.` : ""),
  });

  terms.push({
    title: "Vakuus",
    body:
      `Vakuus on ${formatEuro(data.depositAmount)}. Se palautetaan vuokrasuhteen ` +
      "päättyessä, kun kaikki velvoitteet on hoidettu ja asunto on luovutettu " +
      "loppukatselmuksessa sovitussa kunnossa.",
  });

  terms.push({
    title: "Sopimuksen kesto",
    body: data.endDate
      ? `Sopimus on määräaikainen ja päättyy ${formatDate(data.endDate)}. ` +
        "Määräaikaista sopimusta ei voi irtisanoa kesken kauden ilman laissa " +
        "säädettyä perustetta."
      : "Sopimus on voimassa toistaiseksi.",
  });

  terms.push({
    title: "Irtisanominen",
    body: data.endDate
      ? "Määräaikainen sopimus päättyy sovittuna päivänä ilman irtisanomista."
      : `Irtisanomisaika on ${formatCount(data.noticePeriodMonths, "kuukausi", "kuukautta")}. Laki asettaa ` +
        "vähimmäisajat: vuokralaiselle yksi kuukausi, vuokranantajalle kolme " +
        "kuukautta ja yli vuoden kestäneessä vuokrasuhteessa kuusi kuukautta.",
  });

  terms.push({
    title: "Asunnon käyttö",
    body:
      "Asuntoa käytetään ensisijaisesti asumiseen. " +
      (data.smokingAllowed ? "Tupakointi on sallittu. " : "Tupakointi sisätiloissa ei ole sallittua. ") +
      (data.petsAllowed ? "Lemmikit ovat sallittuja." : "Lemmikkejä ei pidetä asunnossa."),
  });

  const included: string[] = [];
  if (data.waterIncluded) included.push("vesi");
  if (data.electricityIncluded) included.push("sähkö");
  terms.push({
    title: "Vesi ja sähkö",
    body:
      included.length > 0
        ? `Vuokraan sisältyy ${included.join(" ja ")}. ` +
          (included.length === 2
            ? ""
            : `${included[0] === "vesi" ? "Sähkö" : "Vesi"} maksetaan erikseen.`)
        : "Vesi ja sähkö maksetaan vuokran lisäksi käytön mukaan.",
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

  terms.push({
    title: "Asunnon kunto",
    body:
      "Asunnon kunto on todettu yhdessä alkukatselmuksessa, ja siitä on " +
      "erillinen pöytäkirja kuvineen. Sama lista käydään läpi vuokrasuhteen " +
      "päättyessä.",
  });

  terms.push({
    title: "Avaimet",
    body: data.keysCount
      ? `Vuokralaiselle luovutetaan ${formatCount(data.keysCount, "avain", "avainta")}. Ne palautetaan ` +
        "vuokrasuhteen päättyessä."
      : "Avaimet luovutetaan vuokrasuhteen alkaessa ja palautetaan sen päättyessä.",
  });

  terms.push({
    title: "Arvio vuokrasuhteesta",
    body:
      "Vuokrasuhteen päättyessä kumpikin osapuoli voi antaa toisestaan arvion " +
      "ja saa oman vuokratodistuksensa. Tämä on tiedossa jo nyt, eikä se tule " +
      "kummallekaan yllätyksenä lopussa.",
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
      detail: data.endDate ? "Määräaikainen" : "Toistaiseksi voimassa",
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
