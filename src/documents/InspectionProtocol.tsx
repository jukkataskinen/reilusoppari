/**
 * Katselmuspöytäkirja, alku- ja loppukatselmus (CLAUDE.md 5.3).
 *
 * ===========================================================================
 * TÄSSÄ ASIAKIRJASSA KUVA ON TODISTE
 *
 * Vuokrasopimuksessa on koristekuvitus; tässä ei ole (`decorations.tsx`).
 * Jos samassa asiakirjassa olisi sekä koristekuvia että todistekuvia, raja
 * niiden välillä hämärtyisi — ja juuri se raja on koko tuotteen ydin.
 *
 * Siksi jokaisen kuvan alla lukee kuka sen otti, milloin palvelin sen
 * vastaanotti ja mikä on sen tiiviste. Aika on palvelimen aika eikä
 * puhelimen ilmoittama: puhelimen kelloa voi siirtää.
 *
 * MOLEMPIEN LISÄYKSET OVAT SAMANARVOISIA
 *
 * Oletuslista on muistin tueksi, ei rajoite (DECISIONS.md 2026-09-10).
 * Kumpi tahansa osapuoli voi lisätä oman kohtansa, ja pöytäkirja esittää
 * lisätyn kohdan täsmälleen samalla tavalla kuin oletuslistalta tulleen —
 * ainoa ero on merkintä siitä, kuka sen lisäsi. Käyttöliittymän tavoin
 * asiakirjakaan ei saa esittää vuokranantajan listaa "oikeana" ja
 * vuokralaisen lisäyksiä poikkeuksena.
 * ===========================================================================
 */

import { Image, Page, Text, View } from "@react-pdf/renderer";
import {
  ClosingNote,
  DocumentFooter,
  DocumentHeader,
  DocumentRoot,
  Heading,
  KeyFacts,
  Panel,
  Signatures,
  Title,
  pageStyle,
  type Fact,
} from "./components";
import { PageDecoration } from "./decorations";
import { formatAddress, formatCount, formatDate, formatNames } from "./format";
import { colors, radius, spacing, type as typeScale, weight } from "./theme";

export type PartyRole = "landlord" | "tenant";

export interface InspectionPhoto {
  /** Kuva upotettuna. `data:image/jpeg;base64,…` — renderöijä ei hae mitään verkosta. */
  dataUri: string;
  /** Palvelimen vastaanottoaika, ei puhelimen ilmoittama kuvausaika. */
  takenAt: string;
  takenByName: string;
  takenByRole: PartyRole;
  /** Tallennetun tiedoston SHA-256. */
  sha256: string;
  note: string | null;
}

export interface InspectionItem {
  room: string;
  item: string;
  /** `null` = oletuslistalta generoitu. Muuten kohdan lisännyt osapuoli. */
  addedBy: { name: string; role: PartyRole } | null;
  photos: InspectionPhoto[];
}

export interface InspectionProtocolData {
  kind: "initial" | "final";
  property: { street: string; postalCode: string; city: string };
  landlordName: string;
  tenantNames: string[];

  /** Katselmuksen lukitusaika. Tämä on pöytäkirjan päiväys. */
  lockedAt: string;
  lockedByName: string;

  items: InspectionItem[];

  place: string;
}

/**
 * Kuka kohdan lisäsi.
 *
 * Rooli eikä nimi: nimi on jo kuvatekstissä ja allekirjoituksissa, ja
 * ”lisännyt Maija Meikäläinen, vuokralainen” ei mahtunut kaventamatta
 * sarakkeita niin, että kuvat olisivat kärsineet. Olennaista on kumpi
 * osapuoli kohdan lisäsi — se erottaa lisätyn kohdan oletuslistan kohdasta.
 */
const ADDED_BY_LABEL: Record<PartyRole, string> = {
  landlord: "Vuokranantajan lisäämä",
  tenant: "Vuokralaisen lisäämä",
};

/** Kellonaika minuutin tarkkuudella: sekunnit eivät kerro lukijalle mitään. */
function formatDateTime(value: string): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCDate()}.${date.getUTCMonth() + 1}.${date.getUTCFullYear()} klo ${pad(
    date.getUTCHours(),
  )}.${pad(date.getUTCMinutes())}`;
}

/** Tiivisteen alku. Koko tiiviste on liitteessä. */
function shortHash(sha256: string): string {
  return sha256.slice(0, 12);
}

/** Kohdat huoneittain alkuperäisessä järjestyksessä. */
export function groupByRoom(items: InspectionItem[]): { room: string; items: InspectionItem[] }[] {
  const rooms: { room: string; items: InspectionItem[] }[] = [];
  for (const item of items) {
    const last = rooms[rooms.length - 1];
    if (last && last.room === item.room) last.items.push(item);
    else rooms.push({ room: item.room, items: [item] });
  }
  return rooms;
}

export function countPhotos(items: InspectionItem[]): number {
  return items.reduce((total, item) => total + item.photos.length, 0);
}

/**
 * Pienoiskuvan mitat.
 *
 * Neljä kuvaa ja kohdan nimi mahtuvat samalle riville sivun leveydelle
 * (CLAUDE.md 5.3: enintään neljä kuvaa kohtaa kohden). Kiinteä leveys eikä
 * joustava: samankokoisia kuvia on helpompi verrata keskenään, ja vaihteleva
 * leveys tekisi pöytäkirjasta levottoman.
 */
const PHOTO_WIDTH = 88;
const PHOTO_GAP = 6;
const LABEL_WIDTH = 132;

/**
 * Yksi kuva pienoiskuvana ja sen tiedot.
 *
 * Enintään neljä kuvaa kohtaa kohden mahtuu riviin (CLAUDE.md 5.3), joten
 * leveys on kiinteä eikä joustava — vaihteleva leveys tekisi pöytäkirjasta
 * levottoman, ja kuvien kokoa on helpompi verrata kun ne ovat samankokoisia.
 */
function PhotoCard({ photo }: { photo: InspectionPhoto }) {
  return (
    <View style={{ width: PHOTO_WIDTH, marginRight: PHOTO_GAP }}>
      {/*
        eslint-disable-next-line jsx-a11y/alt-text --
        React-PDF:n `Image` ei ole HTML:n `img` eikä ota vastaan `alt`-tekstiä;
        PDF-muoto ei myöskään tue vaihtoehtoista tekstiä ilman tagattua
        rakennetta, jota React-PDF ei tuota. Saavutettavuus hoidetaan sillä,
        mitä kuvan ympärillä lukee: kohta, kuvaaja, aika, tiiviste ja
        huomautus ovat kaikki tekstiä.
      */}
      <Image
        src={photo.dataUri}
        style={{
          width: PHOTO_WIDTH,
          height: 66,
          objectFit: "cover",
          borderRadius: 6,
          border: `1px solid ${colors.line}`,
        }}
      />
      <Text style={{ fontSize: typeScale.label, color: colors.inkSoft, marginTop: 3 }}>
        {photo.takenByName}
      </Text>
      <Text style={{ fontSize: typeScale.label, color: colors.inkFaint }}>
        {formatDateTime(photo.takenAt)}
      </Text>
      <Text style={{ fontSize: typeScale.label, color: colors.inkFaint }}>
        {shortHash(photo.sha256)}
      </Text>
      {photo.note ? (
        <Text style={{ fontSize: typeScale.label, color: colors.ink, marginTop: 2 }}>
          {photo.note}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Yksi kohta kuvineen.
 *
 * `wrap={false}`: kohta ei saa katketa kahdelle sivulle. Puolikas kohta, jonka
 * kuvat ovat seuraavalla sivulla, on riitatilanteessa juuri se, mitä ei
 * haluta selittää.
 */
function ItemBlock({ item }: { item: InspectionItem }) {
  return (
    <View style={{ flexDirection: "row", marginTop: 9 }} wrap={false}>
      <View style={{ width: LABEL_WIDTH, paddingRight: 10 }}>
        <Text style={{ fontWeight: weight.bold, fontSize: typeScale.small }}>{item.item}</Text>
        {item.addedBy ? (
          <Text style={{ fontSize: typeScale.label, color: colors.inkFaint, marginTop: 1 }}>
            {ADDED_BY_LABEL[item.addedBy.role]}
          </Text>
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        {item.photos.length === 0 ? (
          <Text style={{ fontSize: typeScale.small, color: colors.inkFaint }}>
            Ei kuvia. Kumpikaan osapuoli ei kuvannut tätä kohtaa.
          </Text>
        ) : (
          <View style={{ flexDirection: "row" }}>
            {item.photos.map((photo) => (
              <PhotoCard key={photo.sha256} photo={photo} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function buildFacts(data: InspectionProtocolData): Fact[] {
  const photos = countPhotos(data.items);

  return [
    {
      icon: "koti",
      label: "Koti",
      value: data.property.street,
      detail: `${data.property.postalCode} ${data.property.city}`,
    },
    {
      icon: "kalenteri",
      label: "Katselmus lukittu",
      value: formatDateTime(data.lockedAt),
      detail: `${data.lockedByName}`,
    },
    {
      icon: "henkilo",
      label: data.tenantNames.length > 1 ? "Vuokralaiset" : "Vuokralainen",
      value: formatNames(data.tenantNames),
    },
    { icon: "henkilo", label: "Vuokranantaja", value: data.landlordName },
    {
      icon: "kilpi",
      label: "Kohtia",
      value: formatCount(data.items.length, "kohta", "kohtaa"),
    },
    { icon: "kilpi", label: "Kuvia", value: formatCount(photos, "kuva", "kuvaa") },
  ];
}

export function InspectionProtocol({ data }: { data: InspectionProtocolData }) {
  const isFinal = data.kind === "final";
  const title = isFinal ? "Loppukatselmus" : "Alkukatselmus";
  const rooms = groupByRoom(data.items);
  const date = data.lockedAt.slice(0, 10);

  const allPhotos = data.items.flatMap((item) =>
    item.photos.map((photo) => ({ item, photo })),
  );

  return (
    <DocumentRoot
      title={`${title} – ${formatAddress(data.property)}`}
      subject={`Asuinhuoneiston ${title.toLowerCase()}`}
      date={date}
    >
      <Page size="A4" style={pageStyle}>
        <PageDecoration />
        <DocumentHeader />
        <DocumentFooter />

        <Title
          lead={
            isFinal
              ? "Tämä on pöytäkirja siitä, missä kunnossa koti on vuokrasuhteen päättyessä. Kohdat ovat samat kuin alkukatselmuksessa."
              : "Tämä on pöytäkirja siitä, missä kunnossa koti on vuokrasuhteen alkaessa. Molemmat osapuolet ovat käyneet sen läpi yhdessä."
          }
        >
          {title}
        </Title>

        <KeyFacts facts={buildFacts(data)} />

        {/*
          Tämä kappale on asiakirjan tärkein. Se kertoo lukijalle, mitä hän
          katsoo ja miksi siihen voi luottaa — ilman sitä kuvat ovat vain
          kuvia.
        */}
        <Panel style={{ marginTop: spacing.block }}>
          <Text style={{ fontWeight: weight.medium }}>Miten tätä luetaan</Text>
          <Text style={{ fontSize: typeScale.small, color: colors.inkSoft, marginTop: 3 }}>
            Kumpikin osapuoli on kuvannut ne kohdat, jotka on itse katsonut tärkeiksi. Kohdat, joiden alla lukee ”lisäämä”, on lisätty
            listan ulkopuolelta — ne ovat yhtä päteviä kuin muutkin. Jokaisen kuvan alla on kuvaaja, palvelimen vastaanottoaika
            ja tiivisteen alku. Aika on palvelimen aika, ei puhelimen: puhelimen kelloa voi
            siirtää. Täydet tiivisteet ovat viimeisellä sivulla.
          </Text>
          <Text style={{ fontSize: typeScale.small, color: colors.inkSoft, marginTop: 6 }}>
            Katselmus on lukittu {formatDateTime(data.lockedAt)}. Lukituksen jälkeen kuvia ei ole
            voinut lisätä eikä poistaa kumpikaan osapuoli.
          </Text>
        </Panel>

        {rooms.map((room) => (
          <View key={room.room} style={{ marginTop: spacing.block }}>
            {/*
              Huoneen otsikko ja sen ensimmäinen kohta pidetään yhdessä
              jakamattomassa lohkossa. `minPresenceAhead` ei riittänyt: sen
              arvo on arvaus kohdan korkeudesta, ja kuvallinen kohta on
              korkeampi kuin kuvaton. Yksin sivun alalaitaan jäänyt
              huoneen otsikko näyttää siltä, että jotain puuttuu.
            */}
            <View wrap={false}>
              <Heading>{room.room}</Heading>
              <ItemBlock item={room.items[0]} />
            </View>
            {room.items.slice(1).map((item) => (
              <ItemBlock key={item.room + item.item} item={item} />
            ))}
          </View>
        ))}

      </Page>

      {/*
        Täydet tiivisteet omalla sivullaan.

        Lyhennetty tiiviste riittää kuvan tunnistamiseen pöytäkirjaa
        selatessa, mutta eheyden todentamiseen tarvitaan koko tiiviste.
        Se on tylsää luettavaa, joten se ei kuulu kuvien sekaan — mutta se on
        oltava olemassa.
      */}
      <Page size="A4" style={pageStyle}>
        <PageDecoration />
        <DocumentHeader />
        <DocumentFooter />

        <Title lead="Jokaisen kuvan SHA-256-tiiviste. Tiiviste muuttuu, jos tiedostoa muutetaan yhdelläkään tavulla.">
          Kuvien tiivisteet
        </Title>

        <View style={{ marginTop: spacing.block }}>
          {allPhotos.map(({ item, photo }) => (
            <View
              key={photo.sha256}
              style={{
                flexDirection: "row",
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
                paddingVertical: 5,
              }}
              wrap={false}
            >
              <View style={{ width: "38%", paddingRight: 8 }}>
                <Text style={{ fontSize: typeScale.small }}>{item.item}</Text>
                <Text style={{ fontSize: typeScale.label, color: colors.inkFaint }}>
                  {item.room} · {photo.takenByName}
                </Text>
              </View>
              <Text
                style={{
                  flex: 1,
                  fontSize: typeScale.label,
                  color: colors.inkSoft,
                  lineHeight: 1.35,
                }}
              >
                {photo.sha256}
              </Text>
            </View>
          ))}
        </View>

        <Panel style={{ marginTop: spacing.block, borderRadius: radius.panel }}>
          <Text style={{ fontSize: typeScale.small, color: colors.inkSoft }}>
            Tämän pöytäkirjan aitouden voi tarkistaa osoitteessa reilusoppari.fi/todistus
            asiakirjan omalla tiivisteellä. Kuvat säilyvät Reilusopparissa vuokrasuhteen
            päättymisestä kolme vuotta.
          </Text>
        </Panel>

        {/*
          Loppusana ja allekirjoitukset ovat viimeisellä sivulla eivätkä
          kohtalistan perässä.

          Kaksi syytä. Allekirjoitus kattaa näin koko pöytäkirjan liitteineen
          eikä vain kuvasivuja. Ja kohtalistan pituus vaihtelee asunnoittain:
          kun allekirjoitus oli listan perässä, se työntyi omalle lähes
          tyhjälle sivulleen aina kun lista sattui päättymään sivun lopussa.
        */}
        <ClosingNote
          title="Kiitos, että kävitte kodin läpi yhdessä."
          body="Tämä lista käydään samassa järjestyksessä läpi myös vuokrasuhteen päättyessä."
        />

        <Signatures
          place={data.place}
          date={formatDate(date)}
          signatories={[
            ...data.tenantNames.map((name) => ({ role: "Vuokralainen", name })),
            { role: "Vuokranantaja", name: data.landlordName },
          ]}
        />
      </Page>
    </DocumentRoot>
  );
}
