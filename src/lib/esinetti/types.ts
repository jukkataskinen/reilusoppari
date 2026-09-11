/**
 * eSinetti-liitännän tyypit (CLAUDE.md kohta 2, taulukon rivi "eSinetti-liitäntä").
 *
 * Reilusoppari ei toteuta tunnistusta, allekirjoitusta eikä sinetöintiä itse.
 * Nämä tyypit kuvaavat sen rajapinnan, jonka takana eSinetti on — ja vain sen.
 *
 * ===========================================================================
 * SUOMENKIELISET NIMET, snake_case VAIN LANGALLA
 *
 * eSinetin REST-API käyttää snake_casea (`template_id`, `sealed_sha256`).
 * Tässä repossa käytetään camelCasea, ja muunnos tehdään yhdessä paikassa
 * (`http-client.ts`). Syy: jos wire-muoto vuotaisi sovelluskoodiin, eSinetin
 * API-muutos näkyisi kymmenissä tiedostoissa.
 *
 * MITÄ TÄSSÄ EI OLE
 *
 * Henkilötunnusta ei ole missään tyypissä eikä sitä saa lisätä (CLAUDE.md
 * kohta 6). `expectedBirthdate` on mukana, koska eSinetti käyttää sitä
 * tunnistuksen tarkistukseen — mutta Reilusoppari ei tallenna sitä, vaan
 * välittää sen vain jos se on jo tiedossa sopimukselta.
 * ===========================================================================
 */

/** Pohjat, jotka Reilusoppari ylläpitää `templates/`-hakemistossa (CLAUDE.md kohta 2). */
export type TemplateKey =
  | "vuokrasopimus_asuinhuoneisto"
  | "alkukatselmus"
  | "loppukatselmus"
  | "vuokratodistus_vuokralainen"
  | "vuokratodistus_vuokranantaja"
  | "verolaskelma";

export const TEMPLATE_KEYS: readonly TemplateKey[] = [
  "vuokrasopimus_asuinhuoneisto",
  "alkukatselmus",
  "loppukatselmus",
  "vuokratodistus_vuokralainen",
  "vuokratodistus_vuokranantaja",
  "verolaskelma",
];

/** Pohjan kenttien arvot. Skalaareja: pohjassa ei ole syntaksia sisäkkäisille rakenteille. */
export type TemplateData = Record<string, string | number | boolean>;

/** Toistuva rivi pohjassa (esim. katselmuksen kohdat). */
export type TemplateItem = Record<string, string | number | boolean | null>;

/**
 * Kuva tai muu liite renderöintiin base64:na.
 *
 * Base64 EIKÄ URL siksi, että eSinetin renderöijä ei hae ulkoisia resursseja
 * lainkaan (`sealer/rendering.py`, `_forbidden_url_fetcher`). Katselmuksen
 * kuvat on siis luettava Supabase Storagesta ja välitettävä tässä.
 */
export interface RenderAsset {
  /** Pohjassa käytetty avain, esim. `kuva_keittio_1`. */
  key: string;
  mediaType: "image/png" | "image/jpeg";
  contentBase64: string;
}

export interface RenderDocumentInput {
  templateId: string;
  data?: TemplateData;
  items?: TemplateItem[];
  /** Kenen nimissä asiakirja on. Vuokrasuhteessa vuokranantaja. */
  entityName: string;
  entityIdentifier?: string;
  entityDomicile?: string;
  /** Determinismi: sama syöte + sama päivä → sama PDF. Anna aina, jos PDF:ää verrataan tiivisteellä. */
  today?: string;
  assets?: RenderAsset[];
}

export interface RenderDocumentResult {
  pdfBytes: Uint8Array;
  sha256: string;
  sizeBytes: number;
  template: { id: string; key: string; version: number };
  /**
   * Paikanvaraajat, joille ei löytynyt arvoa. Ei virhe — pohjassa voi olla
   * valinnaisia kohtia. Kutsujan on silti syytä lokittaa nämä, koska
   * kirjoitusvirhe kentän nimessä näkyy juuri tässä.
   */
  missingPlaceholders: string[];
}

export interface SealDocumentInput {
  name: string;
  pdfBytes: Uint8Array;
  /**
   * Upotetaan sinetöidyn PDF:n audit-liitteeksi ja on siten PYSYVÄ.
   * eSinetti torjuu henkilötunnuksen näköiset arvot (`hetu-guard.ts`), mutta
   * älä luota siihen: älä laita tähän mitään, mitä et halua olevan
   * asiakirjassa ikuisesti.
   */
  metadata?: Record<string, unknown>;
  reason?: string;
  retainYears?: number;
}

export interface SealDocumentResult {
  id: string;
  name: string;
  sealedSha256: string;
  pageCount: number;
  sizeBytes: number;
  retainUntil: string | null;
  /** Aikarajallinen latauslinkki. Tallenna tiedosto omaan Storageen, älä linkkiä. */
  downloadUrl: string;
}

/** Allekirjoittaja kierroksella. Reilusopparissa vuokranantaja + 1–2 vuokralaista. */
export interface RoundSigner {
  name: string;
  email: string;
  phone?: string;
  roleLabel?: string;
  /** Jos syntymäaika on tiedossa sopimukselta, eSinetti tarkistaa sen tunnistuksessa. */
  expectedBirthdate?: string;
  /** Reilusopparissa aina `strong`: todistusten arvo perustuu vahvaan tunnistukseen. */
  authLevel?: "strong" | "light";
}

export interface RoundDocumentInput {
  name: string;
  pdfBytes: Uint8Array;
}

export interface CreateRoundInput {
  title: string;
  documents: RoundDocumentInput[];
  signers: RoundSigner[];
  /** Kaikki allekirjoittavat samaan aikaan, kun tämä on epätosi. */
  sequential?: boolean;
  expiresInDays?: number;
  /**
   * Oma tunniste, jolla kierros löytyy takaisin. Reilusopparissa
   * `tenancy:<uuid>:alku` tai `:loppu` — webhook palauttaa tämän, joten
   * kierros osataan yhdistää oikeaan vuokrasuhteeseen ilman omaa hakua.
   */
  externalRef?: string;
  /** Lähetetäänkö kutsut heti. */
  send?: boolean;
}

export type RoundStatus =
  | "draft"
  | "sent"
  | "partially_signed"
  | "completed"
  | "cancelled"
  | "expired";

export type SignerStatus = "pending" | "opened" | "identified" | "signed" | "declined";

export interface RoundDocument {
  id: string;
  name: string;
  position: number;
  pageCount: number | null;
  sizeBytes: number | null;
  originalSha256: string | null;
  sealedSha256: string | null;
}

export interface RoundSignerState {
  id: string;
  name: string;
  email: string;
  roleLabel: string | null;
  authLevel: "strong" | "light";
  position: number;
  status: SignerStatus;
  openedAt: string | null;
  identifiedAt: string | null;
  signedAt: string | null;
  declinedAt: string | null;
}

export interface Round {
  id: string;
  title: string;
  status: RoundStatus;
  sequential: boolean;
  externalRef: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  createdAt: string;
  documents: RoundDocument[];
  signers: RoundSignerState[];
}

/** Julkisen `GET /verify`-haun tulos. Ei vaadi API-avainta eSinetissä. */
export type VerifyResult =
  | { found: false }
  | {
      found: true;
      document: { name: string; pageCount: number | null; sealedSha256: string; kind: string };
      round: { title: string | null; status: string | null; sealedAt: string | null } | null;
      organization: string | null;
      signers: Array<{
        name: string;
        authMethod: string | null;
        provider: string | null;
        signedAt: string | null;
        providerTransactionId: string | null;
      }>;
    };

/** Pohja eSinetissä. `usable` kertoo, voiko siitä tuottaa asiakirjan juuri nyt. */
export interface TemplateInfo {
  id: string;
  key: string;
  name: string;
  version: number;
  published: boolean;
  owner: "system" | "tenant";
  /**
   * Julkaisematonta pohjaa ei voi käyttää renderöintiin. Julkaisu tehdään
   * eSinetissä juridisen sisällön tarkistuksen jälkeen, joten `templates:push`
   * jälkeen tämä on epätosi kunnes Jukka on hyväksynyt pohjan.
   */
  usable: boolean;
  updatedAt: string;
}

export interface UpsertTemplateInput {
  key: string;
  name: string;
  version: number;
  html: string;
  schema?: Record<string, unknown>;
  legalBasis?: string;
}

export type UpsertTemplateAction = "created" | "updated" | "skipped_published";

/**
 * eSinetti-liitännän sopimus. Sekä oikea client että mock toteuttavat tämän,
 * eikä sovelluskoodi saa tietää kumpi on käytössä.
 */
export interface EsinettiClient {
  renderDocument(input: RenderDocumentInput): Promise<RenderDocumentResult>;
  sealDocument(input: SealDocumentInput): Promise<SealDocumentResult>;
  createRound(input: CreateRoundInput): Promise<Round>;
  getRound(roundId: string): Promise<Round>;
  sendRound(roundId: string): Promise<Round>;
  remindRound(roundId: string): Promise<void>;
  cancelRound(roundId: string): Promise<Round>;
  /** Lataa kierroksen asiakirjan tavut (sinetöity, jos kierros on valmis). */
  downloadRoundDocument(roundId: string, documentId: string): Promise<Uint8Array>;
  verifyDocument(sha256: string): Promise<VerifyResult>;
  /** Kaikki käytettävissä olevat pohjat, myös julkaisua odottavat. */
  listTemplates(): Promise<TemplateInfo[]>;
  /** Vie pohjan eSinettiin. Käytetään vain `npm run templates:push` -skriptistä. */
  upsertTemplate(
    input: UpsertTemplateInput,
  ): Promise<{ template: TemplateInfo; action: UpsertTemplateAction }>;
}
