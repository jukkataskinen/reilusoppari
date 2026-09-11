/**
 * Asiakirjojen yhteiset palikat.
 *
 * Nämä ovat se kohta, jossa Jukan luonnoksen ulkoasu elää. Yksittäinen
 * asiakirja kokoaa näistä oman sisältönsä eikä määrittele omia värejään tai
 * välejään — muuten kuuden asiakirjan ulkoasu erkanisi ensimmäisen muutoksen
 * jälkeen, ja ne ovat saman palvelun samaa asiakirjasarjaa.
 */

import { Circle, Document, G, Path, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import type { ReactNode } from "react";
import { A4_HEIGHT, FONT_FAMILY, colors, radius, spacing, type as typeScale, weight } from "./theme";

const s = StyleSheet.create({
  page: {
    fontFamily: FONT_FAMILY,
    fontSize: typeScale.body,
    color: colors.ink,
    paddingTop: spacing.page,
    paddingBottom: spacing.page + 18,
    paddingHorizontal: spacing.page,
    lineHeight: 1.5,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  brand: { flexDirection: "row", alignItems: "center" },
  brandName: { fontSize: 13, fontWeight: weight.bold, marginLeft: 7 },
  tagline: { fontSize: typeScale.small, color: colors.sky },

  title: { fontSize: typeScale.title, fontWeight: weight.bold, lineHeight: 1.15 },
  subtitle: {
    fontSize: typeScale.subtitle,
    color: colors.inkSoft,
    marginTop: 8,
    lineHeight: 1.45,
  },

  panel: {
    backgroundColor: colors.panel,
    borderRadius: radius.panel,
    padding: spacing.panel,
  },

  heading: { fontSize: typeScale.heading, fontWeight: weight.bold, marginBottom: 10 },

  label: { fontSize: typeScale.label, color: colors.inkFaint },
  value: { fontSize: typeScale.body, fontWeight: weight.medium, marginTop: 1 },

  /**
   * Alatunniste.
   *
   * ==========================================================================
   * SIJAINTI `top`:LLA EIKÄ `bottom`:LLA — JA SIIHEN ON KIPEÄ SYY
   *
   * `bottom`-sijainti EI piirtynyt lainkaan tässä asiakirjassa, vaikka sama
   * merkkaus toimi yksinkertaisemmalla sivulla. Teksti oli PDF:n
   * sisältövirrassa — se löytyi tekstihaulla — mutta ei näkynyt sivulla.
   * Mikään ei kaatunut eikä varoittanut.
   *
   * `top` toimii. Siksi sijainti lasketaan sivun korkeudesta käsin.
   *
   * `left` ja `right` ovat sivun sisennyksen verran, koska absoluuttinen
   * sijainti lasketaan sivun REUNASTA eikä sisennetystä sisältöalueesta.
   * ==========================================================================
   */
  footer: {
    position: "absolute",
    top: A4_HEIGHT - 34,
    left: spacing.page,
    right: spacing.page,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: typeScale.label, color: colors.inkFaint },
});

/* -------------------------------------------------------------------------
   Merkki ja kuvakkeet

   Ohutviivaisia, 1,5 pt, ei täyttöä – paitsi merkin kaksi neliötä, jotka ovat
   tarkoituksella samankokoiset: kumpikaan osapuoli ei ole toista suurempi.
   ------------------------------------------------------------------------- */

export function LogoMark({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M12 44 L50 14 L88 44 L88 86 L12 86 Z"
        stroke={colors.ink}
        strokeWidth={6}
        strokeLinejoin="round"
        fill="none"
      />
      <Rect x={26} y={52} width={20} height={20} rx={4} fill={colors.sky} />
      <Rect x={54} y={52} width={20} height={20} rx={4} fill={colors.skySoft} />
    </Svg>
  );
}

export type IconName = "koti" | "kalenteri" | "henkilo" | "raha" | "kilpi" | "sydan";

/** Ohutviivainen kuvake 20 × 20 -ruudukossa. */
export function Icon({ name, size = 13 }: { name: IconName; size?: number }) {
  const stroke = colors.sky;
  const props = { stroke, strokeWidth: 1.4, fill: "none" as const };

  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <G>
        {name === "koti" ? (
          <Path d="M3 9 L10 3.5 L17 9 L17 16.5 L3 16.5 Z" {...props} strokeLinejoin="round" />
        ) : null}
        {name === "kalenteri" ? (
          <>
            <Rect x={3} y={4.5} width={14} height={12} rx={2} {...props} />
            <Path d="M3 8.5 L17 8.5 M7 3 L7 6 M13 3 L13 6" {...props} />
          </>
        ) : null}
        {name === "henkilo" ? (
          <>
            <Circle cx={10} cy={7} r={3.2} {...props} />
            <Path d="M4 17 C4 13.4 6.7 11.5 10 11.5 C13.3 11.5 16 13.4 16 17" {...props} />
          </>
        ) : null}
        {name === "raha" ? (
          <>
            <Circle cx={10} cy={10} r={6.5} {...props} />
            <Path d="M10 6.2 L10 13.8 M8.2 8 L11.8 8 M8.2 12 L11.8 12" {...props} />
          </>
        ) : null}
        {name === "kilpi" ? (
          <Path d="M10 3 L16 5.2 L16 10 C16 13.6 13.3 16 10 17 C6.7 16 4 13.6 4 10 L4 5.2 Z" {...props} strokeLinejoin="round" />
        ) : null}
        {name === "sydan" ? (
          <Path
            d="M10 16 C10 16 3.5 12.2 3.5 8 C3.5 6 5 4.5 6.9 4.5 C8.2 4.5 9.4 5.2 10 6.3 C10.6 5.2 11.8 4.5 13.1 4.5 C15 4.5 16.5 6 16.5 8 C16.5 12.2 10 16 10 16 Z"
            {...props}
            strokeLinejoin="round"
          />
        ) : null}
      </G>
    </Svg>
  );
}

/* -------------------------------------------------------------------------
   Rakenne
   ------------------------------------------------------------------------- */

export const pageStyle = s.page;

/**
 * Asiakirjan juuri.
 *
 * ===========================================================================
 * AIKALEIMAT OVAT TÄSSÄ, EIVÄT KUTSUJAN VASTUULLA
 *
 * PDF:ään kirjoitetaan luonti- ja muokkausaika. Jos niitä ei anneta, pdfkit
 * käyttää kellonaikaa — ja silloin sama asiakirja saa eri tiivisteen joka
 * renderöinnillä. Tämä oli kerran rikki niin, että vika näkyi vain jos kaksi
 * renderöintiä osui eri sekunnille: testit menivät läpi satunnaisesti.
 *
 * Siksi jokainen asiakirja rakennetaan tämän komponentin ympärille eikä
 * `Document`ia käytetä suoraan. Päiväys tulee asiakirjan omasta sisällöstä
 * (sopimuksen päiväys, katselmuksen lukitusaika) eikä koneen kellosta.
 * ===========================================================================
 */
export function DocumentRoot({
  title,
  subject,
  date,
  children,
}: {
  title: string;
  subject: string;
  /** Asiakirjan päiväys `YYYY-MM-DD`. */
  date: string;
  children: ReactNode;
}) {
  const timestamp = new Date(date + "T00:00:00.000Z");

  return (
    <Document
      title={title}
      subject={subject}
      author="Reilusoppari"
      language="fi"
      creationDate={timestamp}
      modificationDate={timestamp}
    >
      {children}
    </Document>
  );
}

export function DocumentHeader({ tagline = "Sopikaa. Kuvatkaa. Kuitatkaa." }: { tagline?: string }) {
  return (
    <View style={s.header} fixed>
      <View style={s.brand}>
        <LogoMark />
        <Text style={s.brandName}>Reilusoppari</Text>
      </View>
      <Text style={s.tagline}>{tagline}</Text>
    </View>
  );
}

/**
 * Alatunniste toistuu joka sivulla (`fixed`). Sivunumero näytetään vasta
 * toisesta sivusta alkaen: yksisivuisessa asiakirjassa "1 / 1" on kohinaa.
 */
export function DocumentFooter() {
  return (
    <View style={s.footer} fixed>
      {/*
        Pelkkää tekstiä, ei merkkiä: `Svg` `fixed`-elementin sisällä esti koko
        alatunnisteen piirtymisen. Merkki on jo ylätunnisteessa, joten sen
        toistaminen alalaidassa ei tuo mitään.
      */}
      <Text style={s.footerText}>Reilusoppari</Text>
      {/*
        `fixed` on oltava myös tässä Textissä eikä vain sen ympärillä olevassa
        Viewissä: React-PDF vaatii sen jokaiselta elementiltä, joka käyttää
        `render`-funktiota. Ilman sitä koko alatunniste jää piirtämättä —
        hiljaa, ilman virhettä.
      */}
      <Text
        style={s.footerText}
        fixed
        render={({ pageNumber, totalPages }) =>
          totalPages > 1 ? `${pageNumber} / ${totalPages}` : "Reilua asumista. Yhdessä."
        }
      />
    </View>
  );
}

/**
 * Otsikko ja sen selittävä lause, valinnaisen vinjetin kanssa.
 *
 * Vinjetin kanssa otsikkopalsta kavennetaan, jotta teksti ei kierry kuvan
 * alle. Ilman vinjettiä palsta on täysleveä — katselmuspöytäkirjassa
 * vinjettiä ei ole (`decorations.tsx`).
 */
export function Title({
  children,
  lead,
  aside,
}: {
  children: ReactNode;
  lead?: string;
  aside?: ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
      <View style={{ width: aside ? "62%" : "100%" }}>
        <Text style={s.title}>{children}</Text>
        {lead ? <Text style={s.subtitle}>{lead}</Text> : null}
      </View>
      {aside ? (
        <View style={{ flex: 1, alignItems: "flex-end", paddingTop: 4 }}>{aside}</View>
      ) : null}
    </View>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: Style }) {
  return <View style={[s.panel, style ?? {}]}>{children}</View>;
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={s.heading}>{children}</Text>;
}

export interface Fact {
  icon: IconName;
  label: string;
  value: string;
  /** Toinen rivi arvon alla, esim. postinumero ja kaupunki. */
  detail?: string;
}

/**
 * Avaintiedot kahdessa sarakkeessa.
 *
 * Sarakkeet täytetään riveittäin eikä pystysuunnassa, koska lukija lukee
 * riveittäin: "Koti" ja "Vuokrasuhde alkaa" kuuluvat samalle riville.
 */
export function KeyFacts({ facts }: { facts: Fact[] }) {
  const rows: Fact[][] = [];
  for (let i = 0; i < facts.length; i += 2) rows.push(facts.slice(i, i + 2));

  return (
    <Panel style={{ marginTop: spacing.block }}>
      {rows.map((row, index) => (
        <View
          key={index}
          style={{ flexDirection: "row", marginTop: index === 0 ? 0 : spacing.panel }}
        >
          {row.map((fact) => (
            <View key={fact.label} style={{ flexDirection: "row", width: "50%", paddingRight: 10 }}>
              <View style={{ marginTop: 2, marginRight: 8 }}>
                <Icon name={fact.icon} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{fact.label}</Text>
                <Text style={s.value}>{fact.value}</Text>
                {fact.detail ? (
                  <Text style={{ fontSize: typeScale.small, color: colors.inkSoft }}>
                    {fact.detail}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ))}
    </Panel>
  );
}

export interface Term {
  title: string;
  body: string;
}

/**
 * Numeroidut ehdot kahdessa sarakkeessa.
 *
 * ===========================================================================
 * RIVEITTÄIN, EI SARAKKEITTAIN — JA SIIHEN ON SYY
 *
 * Ensimmäinen toteutus jakoi ehdot kahteen erilliseen sarakkeeseen, jotka
 * virtasivat itsenäisesti. Se näytti oikealta yhdellä sivulla, mutta
 * sivunvaihdossa lukujärjestys hajosi: sivulle 2 päätyivät ehdot 5, 6, 11 ja
 * 12 tässä järjestyksessä. Sopimuksessa se ei käy — lukija ei voi joutua
 * arvaamaan, mistä ehto 7 jatkuu.
 *
 * Nyt ehdot ladotaan riveittäin kahden parina, ja jokainen rivi on
 * jakamaton (`wrap={false}`). Sivunvaihto osuu aina rivien väliin, ja
 * lukujärjestys on aina vasemmalta oikealle, ylhäältä alas.
 *
 * Hinta on se, että parin lyhyempi ehto jättää tyhjää alleen. Se on
 * hyväksyttävää; väärässä järjestyksessä oleva sopimusehto ei ole.
 * ===========================================================================
 */
export interface NumberedTerm {
  number: number;
  term: Term;
}

/**
 * Ehdot riveiksi, numerot valmiina.
 *
 * Erillinen funktio siksi, että juuri tämä on se kohta, joka meni kerran
 * pieleen ja jonka rikkoutumista ei näe koodia lukemalla — vain valmiista
 * PDF:stä. Testi tarkistaa, että numerot juoksevat vasemmalta oikealle,
 * ylhäältä alas.
 */
export function layoutTermRows(terms: Term[]): NumberedTerm[][] {
  const rows: NumberedTerm[][] = [];
  for (let i = 0; i < terms.length; i += 2) {
    rows.push(terms.slice(i, i + 2).map((term, offset) => ({ number: i + offset + 1, term })));
  }
  return rows;
}

export function Terms({ terms }: { terms: Term[] }) {
  const rows = layoutTermRows(terms);

  return (
    <View style={{ marginTop: 12 }}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: "row" }} wrap={false}>
          {row.map(({ number, term }, cellIndex) => (
            <View
              key={term.title}
              style={{
                flexDirection: "row",
                width: "50%",
                paddingRight: cellIndex === 0 ? 16 : 0,
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  width: 17,
                  height: 17,
                  borderRadius: 9,
                  backgroundColor: colors.panelStrong,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 8,
                }}
              >
                <Text style={{ fontSize: typeScale.label, fontWeight: weight.bold }}>
                  {number}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: weight.bold, marginBottom: 2 }}>{term.title}</Text>
                <Text style={{ fontSize: typeScale.small, color: colors.inkSoft, lineHeight: 1.5 }}>
                  {term.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Lämmin loppusana. Sydänkuvake, kaksi riviä ja lehtioksa – ei enempää.
 *
 * `sprig` on valinnainen, koska katselmuspöytäkirjassa kuvituselementtejä ei
 * käytetä (`decorations.tsx`).
 */
export function ClosingNote({
  title,
  body,
  sprig,
}: {
  title: string;
  body: string;
  sprig?: ReactNode;
}) {
  return (
    <Panel style={{ marginTop: spacing.block, flexDirection: "row", alignItems: "center" }}>
      <View style={{ marginRight: 9, marginTop: 1 }}>
        <Icon name="sydan" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: weight.medium }}>{title}</Text>
        <Text style={{ fontSize: typeScale.small, color: colors.inkSoft, marginTop: 2 }}>
          {body}
        </Text>
      </View>
      {sprig ? <View style={{ marginLeft: 10 }}>{sprig}</View> : null}
    </Panel>
  );
}

export interface Signatory {
  role: string;
  name: string;
}

/**
 * Allekirjoitusrivit.
 *
 * Nimet ovat valmiina viivan alla eivätkä tyhjinä: asiakirja allekirjoitetaan
 * sähköisesti eSinetissä, eikä kukaan kirjoita tähän kynällä. Viiva on siis
 * asiakirjan tapa kertoa kuka on allekirjoittanut, ei paikka johon kirjoittaa.
 */
export function Signatures({
  place,
  date,
  signatories,
}: {
  place: string;
  date: string;
  signatories: Signatory[];
}) {
  return (
    <View style={{ flexDirection: "row", marginTop: 26 }} wrap={false}>
      <View style={{ width: "34%", paddingRight: 14 }}>
        <Text style={s.label}>Paikka ja aika</Text>
        <Text style={{ marginTop: 3 }}>
          {place} {date}
        </Text>
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, marginTop: 6 }} />
      </View>
      {signatories.map((signatory) => (
        <View
          key={signatory.role + signatory.name}
          style={{ flex: 1, paddingRight: 14 }}
        >
          <Text style={s.label}>{signatory.role}</Text>
          <Text style={{ marginTop: 3 }}>{signatory.name}</Text>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.line, marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
}
