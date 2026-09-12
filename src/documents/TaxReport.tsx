/**
 * Verolaskelma (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * KAKSI SUMMAA, JOITA EI LASKETA YHTEEN
 *
 * Vuosikulut ja muut kirjaukset ovat asiakirjassa erillään, koska ne ovat
 * verotuksessa eri asioita: rahastoitu rahoitusvastike lisätään osakkeen
 * hankintamenoon, perusparannus vähennetään poistoina ja korot ilmoitetaan
 * omana kohtanaan.
 *
 * Taitossa tämä tarkoittaa yhtä sääntöä, joka ei jousta: **muut kirjaukset
 * eivät saa näyttää vuosikulujen jatkolta**. Ne ovat oma osionsa omalla
 * otsikollaan ja omalla summallaan, eikä missään ole riviä, jossa nämä kaksi
 * lukua olisi laskettu yhteen. Jos ne näyttäisivät saman taulukon riveiltä,
 * laskelma johtaisi harhaan juuri siinä kohdassa, jossa virhe maksaa eniten.
 *
 * MIKÄ TÄMÄ ASIAKIRJA ON
 *
 * Yhteenveto käyttäjän omista kirjauksista. Ei veroilmoitus, ei veroneuvonta,
 * ei arvio siitä mikä on vähennyskelpoista. `DISCLAIMER` toistuu sekä
 * alussa että lopussa, ja se luetaan `content/tax-guidance.fi.ts`:stä, jotta
 * asiakirjan ja näytön teksti eivät voi erkaantua.
 *
 * KUVITUS ON SALLITTU
 *
 * Tämä ei ole katselmuspöytäkirja: tässä ei ole kuvia todisteina, joten
 * vinjetti ja lehtioksa kuuluvat tänne samalla tavalla kuin sopimukseen
 * (`decorations.tsx`).
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
  Title,
  pageStyle,
} from "./components";
import { HomeVignette, LeafSprig, PageDecoration } from "./decorations";
import { formatAddress, formatEuro } from "./format";
import { colors, spacing, type as typeScale, weight } from "./theme";

export interface TaxReportLine {
  label: string;
  /** Kertakirjausten määrä. */
  count: number;
  /** Toistuvien kuukausien määrä. `0`, jos luokassa ei ole toistuvia. */
  recurringMonths: number;
  total: number;
  /** Kilometrit, jos luokka on matkat. */
  km?: number;
  /** Luokan ohjeteksti. Tyhjä, jos luokalla ei ole huomautettavaa. */
  note?: string;
}

export interface TaxReportData {
  year: number;
  property: { street: string; postalCode: string; city: string };
  ownerName: string;
  rentalIncome: number;
  /** Kuukaudet, joista tuloa kertyi. */
  incomeMonths: number;
  /** Vuosikuluina vähennettävät rivit. */
  annualLines: TaxReportLine[];
  annualExpenses: number;
  /** Rivit, jotka eivät ole vuosikulua. Oma osionsa, oma summansa. */
  otherLines: TaxReportLine[];
  otherEntries: number;
  net: number;
  /** Liitteenä olevien kuittien määrä. */
  receiptCount: number;
  disclaimer: string;
  closingNote: string;
  /** Asiakirjan päiväys `YYYY-MM-DD`. */
  date: string;
}

/** Yksi rivi taulukossa: luokka, kirjausten määrä ja summa. */
function Line({ line }: { line: TaxReportLine }) {
  return (
    <View wrap={false} style={{ marginTop: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text style={{ flex: 1, fontWeight: weight.medium }}>{line.label}</Text>
        <Text style={{ fontSize: typeScale.small, color: colors.inkFaint, marginRight: 12 }}>
          {describeLine(line)}
        </Text>
        <Text style={{ fontWeight: weight.bold }}>{formatEuro(line.total)}</Text>
      </View>
      {line.note ? (
        <Text
          style={{
            fontSize: typeScale.small,
            color: colors.inkSoft,
            marginTop: 2,
            paddingRight: 90,
          }}
        >
          {line.note}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Rivin selite: kertakirjaukset ja toistuvat kuukaudet erikseen.
 *
 * "12 kuukautta" ja "12 kirjausta" tarkoittavat eri asiaa, ja lukijan on
 * voitava tarkistaa kumpikin. Jos luokassa on molempia, ne luetellaan
 * peräkkäin eikä lasketa yhteen.
 */
export function describeLine(line: TaxReportLine): string {
  const parts: string[] = [];

  if (line.recurringMonths > 0) {
    parts.push(line.recurringMonths === 1 ? "1 kuukausi" : `${line.recurringMonths} kuukautta`);
  }

  if (line.count > 0) {
    parts.push(line.count === 1 ? "1 kirjaus" : `${line.count} kirjausta`);
  }

  if (line.km) parts.push(`${formatKm(line.km)} km`);

  return parts.join(" · ");
}

/** `1 234` — sama tuhaterotin kuin euroissa, ei desimaaleja turhaan. */
function formatKm(km: number): string {
  const rounded = Math.round(km * 10) / 10;
  const text = rounded % 1 === 0 ? String(rounded) : String(rounded).replace(".", ",");
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Summarivi osion alle. */
function Total({ label, amount }: { label: string; amount: number }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: colors.line,
      }}
    >
      <Text style={{ flex: 1, fontWeight: weight.medium }}>{label}</Text>
      <Text style={{ fontSize: typeScale.subtitle, fontWeight: weight.bold }}>
        {formatEuro(amount)}
      </Text>
    </View>
  );
}

export function TaxReport({ data }: { data: TaxReportData }) {
  const address = formatAddress(data.property);

  return (
    <DocumentRoot
      title={`Verolaskelma ${data.year}`}
      subject={`Vuokratulon yhteenveto ${data.year}`}
      date={data.date}
    >
      <Page size="A4" style={pageStyle}>
        <PageDecoration />
        <DocumentHeader />

        <Title
          lead={`Yhteenveto vuoden ${data.year} kirjauksistasi tästä asunnosta. ${data.disclaimer}`}
          aside={<HomeVignette />}
        >
          Verolaskelma {data.year}
        </Title>

        <KeyFacts
          facts={[
            { icon: "koti", label: "Asunto", value: data.property.street, detail: address },
            { icon: "henkilo", label: "Vuokranantaja", value: data.ownerName || "—" },
            {
              icon: "raha",
              label: "Vuokratulo",
              value: formatEuro(data.rentalIncome),
              detail:
                data.incomeMonths === 1
                  ? "1 kuukaudelta"
                  : `${data.incomeMonths} kuukaudelta`,
            },
            {
              icon: "kalenteri",
              label: "Vuosikulut",
              value: formatEuro(data.annualExpenses),
              detail: `${data.annualLines.length} luokkaa`,
            },
          ]}
        />

        {/* --- Vuosikulut ---------------------------------------------------- */}

        <Panel style={{ marginTop: spacing.block }}>
          <Heading>Vuosikuluina vähennettävät</Heading>
          {data.annualLines.length === 0 ? (
            <Text style={{ fontSize: typeScale.small, color: colors.inkSoft }}>
              Tälle vuodelle ei ole kirjattu vuosikuluja.
            </Text>
          ) : (
            <>
              {data.annualLines.map((line) => (
                <Line key={line.label} line={line} />
              ))}
              <Total label="Vuosikulut yhteensä" amount={data.annualExpenses} />
            </>
          )}
        </Panel>

        {/* --- Muut kirjaukset ----------------------------------------------
            Oma osionsa, oma summansa. Näitä EI lasketa vuosikuluihin, eikä
            asiakirjassa ole missään lukua, jossa ne olisi laskettu yhteen. */}

        {data.otherLines.length > 0 ? (
          <View
            style={{
              marginTop: spacing.block,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 10,
              padding: spacing.panel,
            }}
          >
            <Heading>Muut kirjaukset</Heading>
            <Text
              style={{
                fontSize: typeScale.small,
                color: colors.inkSoft,
                marginTop: -6,
                marginBottom: 4,
              }}
            >
              Nämä eivät ole vuosikuluja, eikä niitä lasketa yllä olevaan summaan.
            </Text>
            {data.otherLines.map((line) => (
              <Line key={line.label} line={line} />
            ))}
            <Total label="Muut kirjaukset yhteensä" amount={data.otherEntries} />
          </View>
        ) : null}

        {/* --- Vuokratulo miinus vuosikulut ---------------------------------- */}

        <Panel
          wrap={false}
          style={{
            marginTop: spacing.block,
            backgroundColor: colors.panelStrong,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: weight.medium }}>Vuokratulo miinus vuosikulut</Text>
              <Text style={{ fontSize: typeScale.small, color: colors.inkSoft, marginTop: 2 }}>
                {formatEuro(data.rentalIncome)} − {formatEuro(data.annualExpenses)}
              </Text>
            </View>
            <Text style={{ fontSize: typeScale.title, fontWeight: weight.bold }}>
              {formatEuro(data.net)}
            </Text>
          </View>
        </Panel>

        {data.receiptCount > 0 ? (
          <Text
            style={{
              fontSize: typeScale.small,
              color: colors.inkSoft,
              marginTop: spacing.block,
            }}
          >
            Liitteenä {data.receiptCount === 1 ? "yksi kuitti" : `${data.receiptCount} kuittia`}.
          </Text>
        ) : null}

        <ClosingNote
          title={data.disclaimer}
          body={data.closingNote}
          sprig={<LeafSprig />}
        />

        <DocumentFooter />
      </Page>
    </DocumentRoot>
  );
}
