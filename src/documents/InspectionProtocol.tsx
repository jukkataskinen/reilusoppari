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
 * RAKENNE ON HUONE, EI TARKISTUSLISTA
 *
 * Aiemmin pöytäkirja oli lista ennalta määrätyistä kohdista, ja tyhjä kohta
 * näkyi siinä merkintänä "ei kuvia". Jukka linjasi toisin (2026-09-11):
 * kuvataan huoneittain, eikä kuvaa vaadita mistään tietystä kohdasta.
 *
 * Siksi pöytäkirjassa ei ole tyhjiä kohtia. Se kertoo, mitä kuvattiin — ei
 * sitä, mitä jäi kuvaamatta. Jälkimmäinen olisi harhaanjohtavaa: lista, jossa
 * on kymmenen "ei kuvia" -riviä, näyttää huolimattomalta katselmukselta,
 * vaikka osapuolet olisivat kuvanneet juuri sen, mikä heidän mielestään
 * merkitsee.
 *
 * Kuvan alla oleva selite kertoo, miksi juuri se kohta kuvattiin. Selite on
 * vapaaehtoinen, joten sitä ei ole kaikilla kuvilla.
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
  /** Miksi tämä kohta kuvattiin. Vapaaehtoinen. */
  note: string | null;
  /** Merkitty kuulumattomaksi. Kuva jää pöytäkirjaan — merkittynä. */
  flaggedReason?: string | null;
}

/** Yksi huone ja siitä otetut kuvat aikajärjestyksessä. */
export interface InspectionRoomGroup {
  name: string;
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

  rooms: InspectionRoomGroup[];

  place: string;
}

/**
 * Kumpi osapuoli kuvan otti.
 *
 * Rooli nimen perässä, koska nimi yksin ei kerro lukijalle kumpi osapuoli on
 * kyseessä — ja juuri se erottaa yhteisen katselmuksen yksipuolisesta.
 */
const ROLE_LABEL: Record<PartyRole, string> = {
  landlord: "vuokranantaja",
  tenant: "vuokralainen",
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

export function countPhotos(rooms: InspectionRoomGroup[]): number {
  return rooms.reduce((total, room) => total + room.photos.length, 0);
}

/** Huoneet, joista on kuvia. Tyhjä huone ei ole pöytäkirjan sisältöä. */
export function photographedRooms(rooms: InspectionRoomGroup[]): InspectionRoomGroup[] {
  return rooms.filter((room) => room.photos.length > 0);
}

/**
 * Pienoiskuvan mitat.
 *
 * Kolme kuvaa rinnakkain mahtuu sivun leveydelle niin, että kuvan alla on
 * tilaa selitteelle. Kiinteä leveys eikä joustava: samankokoisia kuvia on
 * helpompi verrata keskenään, ja vaihteleva leveys tekisi pöytäkirjasta
 * levottoman.
 */
const PHOTO_WIDTH = 158;
const PHOTO_GAP = 10;
const PHOTOS_PER_ROW = 3;

/** Kuvat kolmen riveihin. Rivit ovat erillisiä, jotta sivu voi vaihtua niiden välissä. */
export function photoRows(photos: InspectionPhoto[]): InspectionPhoto[][] {
  const rows: InspectionPhoto[][] = [];
  for (let index = 0; index < photos.length; index += PHOTOS_PER_ROW) {
    rows.push(photos.slice(index, index + PHOTOS_PER_ROW));
  }
  return rows;
}

/** Yksi kuva pienoiskuvana ja sen tiedot. */
function PhotoCard({ photo }: { photo: InspectionPhoto }) {
  return (
    <View style={{ width: PHOTO_WIDTH, marginRight: PHOTO_GAP, marginTop: 10 }}>
      {/*
        eslint-disable-next-line jsx-a11y/alt-text --
        React-PDF:n `Image` ei ole HTML:n `img` eikä ota vastaan `alt`-tekstiä;
        PDF-muoto ei myöskään tue vaihtoehtoista tekstiä ilman tagattua
        rakennetta, jota React-PDF ei tuota. Saavutettavuus hoidetaan sillä,
        mitä kuvan ympärillä lukee: huone, kuvaaja, aika, tiiviste ja selite
        ovat kaikki tekstiä.
      */}
      <Image
        src={photo.dataUri}
        style={{
          width: PHOTO_WIDTH,
          height: 96,
          objectFit: "cover",
          borderRadius: 6,
          border: `1px solid ${colors.line}`,
        }}
      />
      {photo.note ? (
        <Text style={{ fontSize: typeScale.small, color: colors.ink, marginTop: 4 }}>
          {photo.note}
        </Text>
      ) : null}
      {/*
        Kuvaaja ja aika samalla rivillä, tiiviste omallaan.

        Kolme erillistä riviä kasvatti kortin niin korkeaksi, ettei kuvarivi
        mahtunut sivun loppuun jäävään tilaan — ja sivun loppu jäi tyhjäksi.
      */}
      <Text style={{ fontSize: typeScale.label, color: colors.inkSoft, marginTop: 3 }}>
        {photo.takenByName} ({ROLE_LABEL[photo.takenByRole]}) · {formatDateTime(photo.takenAt)}
      </Text>
      <Text style={{ fontSize: typeScale.label, color: colors.inkFaint }}>
        {shortHash(photo.sha256)}
      </Text>
      {photo.flaggedReason !== undefined && photo.flaggedReason !== null ? (
        <Text style={{ fontSize: typeScale.label, color: colors.ink, marginTop: 2 }}>
          Merkitty kuulumattomaksi: {photo.flaggedReason}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Yhden huoneen kuvat.
 *
 * ===========================================================================
 * ORPON OTSIKON ESTO ILMAN JAKAMATONTA LOHKOA
 *
 * Ensin otsikko ja ensimmäinen kuva olivat yhdessä `wrap={false}`-lohkossa.
 * Se esti orvon otsikon mutta maksoi liikaa: kuvallinen lohko on korkea, ja
 * jos se ei mahtunut jäljelle jääneeseen tilaan, koko sivun loppu jäi
 * tyhjäksi. Ensimmäisestä sivusta tuli näin lähes tyhjä.
 *
 * `minPresenceAhead` ratkaisee saman ongelman halvemmalla: otsikko siirtyy
 * seuraavalle sivulle vain, jos sen alle ei mahdu annettua määrää. Kuvat
 * saavat sen jälkeen katketa sivunvaihdossa vapaasti — yksittäinen kuva ei
 * katkea, koska `PhotoCard` on itse jakamaton.
 * ===========================================================================
 */
function RoomBlock({ room }: { room: InspectionRoomGroup }) {
  const rows = photoRows(room.photos);

  /*
    Ylämarginaali on tavallista suurempi, koska otsikko on absoluuttisesti
    sijoitettu ensimmäisen kuvarivin yläpuolelle eikä vie tilaa virrassa.
    Ilman lisäystä otsikko liimautuisi edelliseen sisältöön kiinni.
  */
  return (
    <View style={{ marginTop: spacing.block + 16 }}>
      {rows.map((row, index) => (
        <View key={row[0].sha256} style={{ flexDirection: "row" }} wrap={false}>
          {/*
            Otsikko on ensimmäisen kuvarivin sisällä, jotta ne pysyvät
            yhdessä. Orpo otsikko sivun lopussa näyttää siltä, että jotain
            puuttuu.
          */}
          {index === 0 ? (
            <View style={{ position: "absolute", top: -22, left: 0 }}>
              <Heading>{room.name}</Heading>
            </View>
          ) : null}
          {row.map((photo) => (
            <PhotoCard key={photo.sha256} photo={photo} />
          ))}
        </View>
      ))}
    </View>
  );
}

function buildFacts(data: InspectionProtocolData): Fact[] {
  const rooms = photographedRooms(data.rooms);

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
      label: "Tiloja kuvattu",
      value: formatCount(rooms.length, "tila", "tilaa"),
    },
    { icon: "kilpi", label: "Kuvia", value: formatCount(countPhotos(rooms), "kuva", "kuvaa") },
  ];
}

export function InspectionProtocol({ data }: { data: InspectionProtocolData }) {
  const isFinal = data.kind === "final";
  const title = isFinal ? "Loppukatselmus" : "Alkukatselmus";
  const rooms = photographedRooms(data.rooms);
  const date = data.lockedAt.slice(0, 10);

  const allPhotos = rooms.flatMap((room) => room.photos.map((photo) => ({ room, photo })));

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
              ? "Tämä on pöytäkirja siitä, missä kunnossa koti on vuokrasuhteen päättyessä. Tilat ovat samat kuin alkukatselmuksessa."
              : "Tämä on pöytäkirja siitä, missä kunnossa koti on vuokrasuhteen alkaessa. Molemmat osapuolet ovat kuvanneet sen omalta osaltaan."
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
            Kumpikin osapuoli on kuvannut ne kohdat, jotka on itse katsonut tärkeiksi. Kuvat ovat
            huoneittain siinä järjestyksessä, jossa ne on otettu, ja molempien kuvat ovat samassa
            listassa samanarvoisina. Jokaisen kuvan alla on kuvaaja, palvelimen vastaanottoaika ja
            tiivisteen alku. Aika on palvelimen aika, ei puhelimen: puhelimen kelloa voi siirtää.
            Täydet tiivisteet ovat viimeisellä sivulla.
          </Text>
          <Text style={{ fontSize: typeScale.small, color: colors.inkSoft, marginTop: 6 }}>
            Pöytäkirja kertoo, mitä kuvattiin. Se ei ole tarkistuslista eikä väitä, että kaikki
            kuvaamisen arvoinen olisi kuvattu — kumpikin osapuoli on itse valinnut kohtansa.
          </Text>
          <Text style={{ fontSize: typeScale.small, color: colors.inkSoft, marginTop: 6 }}>
            Katselmus on lukittu {formatDateTime(data.lockedAt)}. Lukituksen jälkeen kuvia ei ole
            voinut lisätä eikä poistaa kumpikaan osapuoli.
          </Text>
        </Panel>

        {rooms.map((room) => (
          <RoomBlock key={room.name} room={room} />
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
          {allPhotos.map(({ room, photo }) => (
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
                <Text style={{ fontSize: typeScale.small }}>{room.name}</Text>
                <Text style={{ fontSize: typeScale.label, color: colors.inkFaint }}>
                  {photo.takenByName} · {formatDateTime(photo.takenAt)}
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
          kuvien perässä.

          Kaksi syytä. Allekirjoitus kattaa näin koko pöytäkirjan liitteineen
          eikä vain kuvasivuja. Ja kuvien määrä vaihtelee: kun allekirjoitus
          oli kuvien perässä, se työntyi omalle lähes tyhjälle sivulleen aina
          kun kuvat sattuivat päättymään sivun lopussa.
        */}
        <ClosingNote
          title="Kiitos, että kävitte kodin läpi yhdessä."
          body="Samat tilat käydään läpi myös vuokrasuhteen päättyessä."
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
