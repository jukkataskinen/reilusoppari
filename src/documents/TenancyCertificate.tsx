/**
 * Vuokratodistus (CLAUDE.md 5.8).
 *
 * ===========================================================================
 * TÄMÄN ASIAKIRJAN VAIKEIN KOHTA: PUUTTUVA SUOSITUS
 *
 * Rakenteinen arvio on kaksiarvoinen: `recommend` tai ei arviota. Kielteistä
 * vaihtoehtoa ei ole. Ja jos suositusta ei anneta, **todistuksesta ei saa
 * pystyä lukemaan sitä** — ei tyhjää kohtaa, ei tekstiä ”ei suositusta”, ei
 * harmaata paikanvaraajaa, ei eri asettelua (DECISIONS.md 2026-09-10).
 *
 * Syy on se, että muuten kaksiarvoisesta asteikosta tulisi kiertoteitse
 * kolmiportainen: lukija oppisi tulkitsemaan tyhjän kohdan kielteiseksi, ja
 * juuri sitä ei haluta. Tästä seuraa taittoon yksi sääntö: suositusrivi on
 * tavallinen sisältöelementti, joka joko on tai ei ole. Se ei saa olla
 * varattu alue, jonka koko pysyy samana.
 *
 * SANASTO
 *
 * Vuokratodistus. Ei luottotieto, ei maksuhäiriö, ei maksumoraali
 * (CLAUDE.md kohta 2). Tilastot ovat toisen osapuolen omia kuittauksia, ei
 * pankin vahvistamia maksuja — ja se sanotaan asiakirjassa ääneen, koska
 * lukija tekee sen perusteella päätöksiä toisesta ihmisestä.
 * ===========================================================================
 */

import { Page, Text, View } from "@react-pdf/renderer";
import {
  DocumentFooter,
  DocumentHeader,
  DocumentRoot,
  Panel,
  Title,
  pageStyle,
} from "./components";
import { HomeVignette, PageDecoration } from "./decorations";
import { formatAddress, formatCount, formatDate } from "./format";
import { QrCode } from "./qr";
import { colors, radius, spacing, type as typeScale, weight } from "./theme";

/** Kenelle todistus on kirjoitettu. */
export type CertificateFor = "tenant" | "landlord";

/**
 * Vuokrasuhteen tilastot.
 *
 * Kaikki kentät ovat valinnaisia, koska osa koskee vain toista roolia:
 * vuokranmaksun kuittaukset ovat vuokralaisen todistuksessa, vikojen
 * korjaaminen vuokranantajan.
 */
export interface CertificateStats {
  months: number;
  /** Kuinka moni vuokrakausi kuitattiin ajallaan, ja kuinka monta niitä oli. */
  rentConfirmedOnTime?: number;
  rentPeriods?: number;
  /** Korjatut viat / ilmoitetut viat. */
  defectsResolved?: number;
  defectsReported?: number;
  depositReturnedFull?: boolean;
}

export interface CertificateData {
  for: CertificateFor;
  /** Kenestä todistus kertoo. */
  subjectName: string;
  /** Kuka todistuksen antoi. */
  issuerName: string;

  property: { street: string; postalCode: string; city: string };
  startDate: string;
  endDate: string;

  /**
   * `recommend` tai `null`. **Kolmatta arvoa ei ole**, eikä `null` näy
   * todistuksessa mitenkään.
   */
  rating: "recommend" | null;
  /** Antajan omat sanat, enintään 300 merkkiä. */
  comment: string | null;
  /** Vastaanottajan vastine, enintään 300 merkkiä. */
  reply: string | null;

  stats: CertificateStats;

  /** Aitoustarkistuksen osoite. Päätyy QR-koodiin sellaisenaan. */
  verifyUrl: string;
  /** Sinetöintipäivä. Tämä on todistuksen päiväys. */
  sealedDate: string;
}

const SUBJECT_ROLE: Record<CertificateFor, string> = {
  tenant: "vuokralaisena",
  landlord: "vuokranantajana",
};

const ISSUER_ROLE: Record<CertificateFor, string> = {
  tenant: "Vuokranantajan tervehdys",
  landlord: "Vuokralaisen tervehdys",
};

/**
 * Suositus ilman nimeä.
 *
 * ”Suosittelen {nimi}ä” ei toimi suomeksi: Meikäläinen taipuu muotoon
 * Meikäläistä eikä Meikäläinenä, eikä nimien taivutusta voi tehdä
 * koneellisesti oikein. Roolimuoto on kieliopillisesti oikea jokaisella
 * nimellä, ja nimi lukee joka tapauksessa rivin yläpuolella.
 */
const RECOMMENDATION: Record<CertificateFor, string> = {
  tenant: "Suosittelen vuokralaiseksi.",
  landlord: "Suosittelen vuokranantajaksi.",
};

/** `3 vuotta`, `1 vuosi 2 kuukautta`, `8 kuukautta`. */
export function formatDuration(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;

  if (years === 0) return formatCount(rest, "kuukausi", "kuukautta");
  if (rest === 0) return formatCount(years, "vuosi", "vuotta");
  return `${formatCount(years, "vuosi", "vuotta")} ${formatCount(rest, "kuukausi", "kuukautta")}`;
}

export interface StatRow {
  label: string;
  value: string;
  detail?: string;
}

/**
 * Tilastorivit roolin mukaan.
 *
 * Erillinen funktio, koska juuri tästä on helppo vahingossa tehdä arvostelu.
 * Rivit kertovat mitä tapahtui, eivät mitä siitä pitäisi ajatella: ”Vuokrat
 * kuitattu ajallaan 34 / 36” on havainto, ”maksumoraali hyvä” olisi arvio.
 */
export function buildStatRows(data: CertificateData): StatRow[] {
  const { stats } = data;
  const rows: StatRow[] = [
    {
      label: "Vuokrasuhde",
      value: `${formatDate(data.startDate)} – ${formatDate(data.endDate)}`,
      detail: formatDuration(stats.months),
    },
  ];

  if (data.for === "tenant" && stats.rentPeriods !== undefined) {
    rows.push({
      label: "Vuokrat",
      value: `Kuitattu ajallaan ${stats.rentConfirmedOnTime ?? 0} / ${stats.rentPeriods}`,
      detail: "Vuokranantajan omat kuittaukset",
    });
  }

  if (data.for === "landlord" && stats.defectsReported !== undefined) {
    rows.push({
      label: "Viat",
      value: `Korjattu ${stats.defectsResolved ?? 0} / ${stats.defectsReported}`,
      detail: "Huoltokirjan merkinnät",
    });
  }

  if (stats.depositReturnedFull !== undefined) {
    rows.push({
      label: "Vakuus",
      value: stats.depositReturnedFull ? "Palautettu kokonaan" : "Palautettu osittain",
    });
  }

  return rows;
}

/** Korostettu kenttä: täytetty palkki, ei viiva jonka päälle kirjoitetaan. */
function Field({ children }: { children: string }) {
  return (
    <View
      style={{
        backgroundColor: colors.panel,
        borderRadius: radius.pill,
        paddingVertical: 7,
        paddingHorizontal: 12,
        marginTop: 5,
      }}
    >
      <Text style={{ fontWeight: weight.bold }}>{children}</Text>
    </View>
  );
}

function StatsPanel({ rows }: { rows: StatRow[] }) {
  return (
    <Panel style={{ marginTop: spacing.block, flexDirection: "row" }}>
      {rows.map((row, index) => (
        <View
          key={row.label}
          style={{
            flex: 1,
            paddingLeft: index === 0 ? 0 : 12,
            paddingRight: index === rows.length - 1 ? 0 : 12,
            borderLeftWidth: index === 0 ? 0 : 1,
            borderLeftColor: colors.panelStrong,
          }}
        >
          <Text style={{ fontSize: typeScale.label, color: colors.inkFaint }}>{row.label}</Text>
          <Text style={{ fontWeight: weight.medium, marginTop: 2 }}>{row.value}</Text>
          {row.detail ? (
            <Text style={{ fontSize: typeScale.label, color: colors.inkSoft, marginTop: 1 }}>
              {row.detail}
            </Text>
          ) : null}
        </View>
      ))}
    </Panel>
  );
}

export function TenancyCertificate({ data }: { data: CertificateData }) {
  const rows = buildStatRows(data);
  const recommends = data.rating === "recommend";

  return (
    <DocumentRoot
      title={`Vuokratodistus – ${data.subjectName}`}
      subject="Vuokratodistus"
      date={data.sealedDate}
    >
      <Page size="A4" style={pageStyle}>
        <PageDecoration />
        <DocumentHeader />
        <DocumentFooter />

        <Title lead="Kiitos hyvästä vuokrasuhteesta." aside={<HomeVignette />}>
          Vuokratodistus
        </Title>

        <View style={{ marginTop: spacing.block }}>
          <Text style={{ color: colors.inkSoft }}>Tämä todistus kertoo, että</Text>
          <Field>{data.subjectName}</Field>
          <Text style={{ color: colors.inkSoft, marginTop: 9 }}>
            on ollut {SUBJECT_ROLE[data.for]} osoitteessa
          </Text>
          <Field>{formatAddress(data.property)}</Field>
        </View>

        {/*
          Korostusrivi kursiivilla. Jukan luonnoksessa se oli käsinkirjoitusta
          muistuttava; kursiivi on lähes yhtä lämmin eikä vaadi neljättä
          fonttitiedostoa pelkkää koristetta varten.
        */}
        <Text
          style={{
            fontSize: typeScale.subtitle,
            fontStyle: "italic",
            fontWeight: weight.medium,
            color: colors.sky,
            marginTop: spacing.block,
          }}
        >
          {formatDuration(data.stats.months)} yhdessä sovittua arkea.
        </Text>

        <StatsPanel rows={rows} />

        {/*
          ===================================================================
          SUOSITUS JA TERVEHDYS

          Tämä lohko joko on tai ei ole. Kun sitä ei ole, sen tilalle ei jää
          mitään — ei otsikkoa, ei laatikkoa, ei väliä. Seuraava elementti
          siirtyy ylös eikä lukija näe, että jotain puuttuisi.

          Juuri siksi tämä EI ole kiinteän kokoinen varattu alue, vaikka
          muuten kiinteät paikat ovat asiakirjoissa hyvä asia: varattu alue
          paljastaisi puuttuvan suosituksen.
          ===================================================================
        */}
        {recommends || data.comment ? (
          <Panel style={{ marginTop: spacing.block }}>
            <Text style={{ fontSize: typeScale.label, color: colors.inkFaint }}>
              {ISSUER_ROLE[data.for]}
            </Text>

            {recommends ? (
              <Text style={{ fontWeight: weight.bold, marginTop: 3 }}>
                {RECOMMENDATION[data.for]}
              </Text>
            ) : null}

            {data.comment ? (
              <Text
                style={{
                  fontStyle: "italic",
                  color: colors.inkSoft,
                  marginTop: recommends ? 4 : 3,
                  // Tiiviimpi kuin leipäteksti: kursiivin ylä- ja alapidennykset
                  // ovat matalammat, ja 1,5 näytti lainauksessa harvalta.
                  lineHeight: 1.2,
                }}
              >
                ”{data.comment}”
              </Text>
            ) : null}

            <Text style={{ fontSize: typeScale.label, color: colors.inkFaint, marginTop: 6 }}>
              {data.issuerName}
            </Text>
          </Panel>
        ) : null}

        {/*
          Vastine on vastaanottajan oikeus vastata siihen, mitä hänestä
          sanottiin. Se on aina esillä, jos se on annettu — muuten kommentti
          jäisi yksipuoliseksi.
        */}
        {data.reply ? (
          <Panel style={{ marginTop: 10, backgroundColor: colors.paper, borderRadius: 0, padding: 0 }}>
            <View style={{ borderLeftWidth: 2, borderLeftColor: colors.panelStrong, paddingLeft: 12 }}>
              {/*
                Pelkkä ”Vastine” eikä ”{nimi}n vastine”: genetiivi ei synny
                nimeen n-kirjainta lisäämällä (Meikäläinen → Meikäläisen).
                Nimi on rivin alla, kuten tervehdyksessäkin.
              */}
              <Text style={{ fontSize: typeScale.label, color: colors.inkFaint }}>Vastine</Text>
              <Text
                style={{ fontStyle: "italic", color: colors.inkSoft, marginTop: 3, lineHeight: 1.2 }}
              >
                ”{data.reply}”
              </Text>
              <Text style={{ fontSize: typeScale.label, color: colors.inkFaint, marginTop: 5 }}>
                {data.subjectName}
              </Text>
            </View>
          </Panel>
        ) : null}

        <View style={{ flexDirection: "row", marginTop: spacing.block, alignItems: "flex-start" }}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={{ fontWeight: weight.bold }}>Reilusoppari vahvistaa</Text>
            <Text
              style={{ fontSize: typeScale.small, color: colors.inkSoft, marginTop: 4, lineHeight: 1.5 }}
            >
              Vuokrasuhde on alkanut ja päättynyt Reilusopparissa, ja sen alku- ja
              loppukatselmus on allekirjoitettu molempien osapuolten vahvalla
              tunnistautumisella. Yllä olevat merkinnät ovat toisen osapuolen omia
              kuittauksia palvelussa — eivät pankin vahvistamia maksutapahtumia.
            </Text>
            <Text
              style={{ fontSize: typeScale.small, color: colors.inkSoft, marginTop: 6, lineHeight: 1.5 }}
            >
              Tämä todistus on sinetöity {formatDate(data.sealedDate)}. Sinetti rikkoutuu, jos
              tiedostoa muutetaan.
            </Text>
          </View>

          <View style={{ alignItems: "center" }}>
            <QrCode value={data.verifyUrl} />
            <Text
              style={{
                fontSize: typeScale.label,
                color: colors.inkFaint,
                marginTop: 4,
                maxWidth: 96,
                textAlign: "center",
              }}
            >
              Tarkista aitous
            </Text>
          </View>
        </View>

        {/*
          Ei erillistä loppuriviä.

          Alatunniste sanoo yksisivuisessa asiakirjassa ”Reilua asumista.
          Yhdessä.”, joten sama lause kahdesti oli toistoa — ja se työnsi
          todistuksen toiselle sivulle, jolla ei ollut muuta. Todistuksen
          kuuluu mahtua yhdelle sivulle: se on asiakirja, joka näytetään
          yhdellä silmäyksellä.
        */}
      </Page>
    </DocumentRoot>
  );
}
