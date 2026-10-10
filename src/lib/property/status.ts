/**
 * Asunnon ja vuokrasuhteen tila listanäkymissä (Jukka 10.10.2026).
 *
 * ===========================================================================
 * MIKSI TILA JOHDETAAN EIKÄ TALLENNETA
 *
 * Asunnolla ei ole omaa tilasaraketta. Vapaa, vuokrattu ja irtisanottu ovat
 * suoraan sen vuokrasuhteiden tiloja, ja erillinen sarake jäisi helposti
 * jälkeen, kun vuokrasuhde etenee. Siksi tila lasketaan joka kerta
 * vuokrasuhteista tällä puhtaalla funktiolla.
 *
 * VÄRI EI KOSKAAN YKSIN
 *
 * Jokaisessa merkissä on sana. Väri on lisävihje, ei ainoa tieto: kaikki eivät
 * erota värejä, ja puhelimen näyttö auringossa syö sävyt.
 *
 * CORAL VAIN TOIMENPITEELLE
 *
 * Coral on varattu siihen, että jokin vaatii käyttäjän toimia (esimerkiksi
 * myöhässä oleva alkukatselmus). Muuten se menettäisi merkityksensä.
 * ===========================================================================
 */

import type { TenancyStatus } from "../db/tenancies";
import { nextStep, type TenancyRole } from "../tenancy/next-step";
import { formatFinnishDate } from "../inspection/deadline";

/** Värisävy, joka vastaa `globals.css`:n värejä. `gray` = neutraali. */
export type StatusTone = "moss" | "amber" | "sky" | "gray" | "coral";

export type PropertyStatusKind = "rented" | "ending" | "pending" | "vacant";

export const PROPERTY_STATUS_LABEL: Record<PropertyStatusKind, string> = {
  rented: "Vuokrattu",
  ending: "Irtisanottu",
  pending: "Sopimus kesken",
  vacant: "Vapaa",
};

export const PROPERTY_STATUS_TONE: Record<PropertyStatusKind, StatusTone> = {
  rented: "moss",
  ending: "amber",
  pending: "sky",
  vacant: "gray",
};

/** Mitä asunnon tilan laskemiseen tarvitaan yhdestä vuokrasuhteesta. */
export interface PropertyTenancyFacts {
  id: string;
  status: TenancyStatus;
  startDate: string | null;
  createdAt: string;
}

export interface PropertyStatus<T extends PropertyTenancyFacts> {
  kind: PropertyStatusKind;
  /** Vuokrasuhde, johon asunnon kortti linkittää. `null`, kun asunto on vapaa. */
  tenancy: T | null;
  /**
   * Muut saman tason vuokrasuhteet (esimerkiksi kaksi voimassa olevaa samassa
   * asunnossa). Näytetään erikseen, ettei toinen jää piiloon.
   */
  others: number;
}

/** Vuokrasuhteen tila asunnon näkökulmasta. `null` = ei vaikuta asunnon tilaan. */
function kindOf(status: TenancyStatus): Exclude<PropertyStatusKind, "vacant"> | null {
  switch (status) {
    case "active":
      return "rented";
    case "ending":
      return "ending";
    case "draft":
    case "inspection":
    case "signing":
      return "pending";
    case "ended":
    case "certified":
      return null;
  }
}

const KIND_ORDER: Exclude<PropertyStatusKind, "vacant">[] = ["rented", "ending", "pending"];

/**
 * Asunnon tila sen vuokrasuhteista.
 *
 * Järjestys on voimassa > irtisanottu > sopimus kesken: voimassa oleva
 * vuokrasuhde kertoo asunnon todellisen tilan, vaikka seuraavan vuokralaisen
 * sopimus olisi jo tekeillä. Saman tason sisällä valitaan uusin (alkupäivä,
 * sitten luontihetki), koska se on todennäköisimmin se, jota haetaan.
 */
export function propertyStatus<T extends PropertyTenancyFacts>(tenancies: T[]): PropertyStatus<T> {
  for (const kind of KIND_ORDER) {
    const matching = tenancies.filter((tenancy) => kindOf(tenancy.status) === kind);
    if (matching.length === 0) continue;
    const sorted = [...matching].sort(newestFirst);
    return { kind, tenancy: sorted[0], others: sorted.length - 1 };
  }
  return { kind: "vacant", tenancy: null, others: 0 };
}

function newestFirst(a: PropertyTenancyFacts, b: PropertyTenancyFacts): number {
  const byStart = (b.startDate ?? "").localeCompare(a.startDate ?? "");
  if (byStart !== 0) return byStart;
  return b.createdAt.localeCompare(a.createdAt);
}

// ---------------------------------------------------------------------------
// Vuokrasuhdelista
// ---------------------------------------------------------------------------

export type TenancyGroup = "draft" | "active" | "ending" | "ended";

export function tenancyGroup(status: TenancyStatus): TenancyGroup {
  switch (status) {
    case "draft":
    case "inspection":
    case "signing":
      return "draft";
    case "active":
      return "active";
    case "ending":
      return "ending";
    case "ended":
    case "certified":
      return "ended";
  }
}

export const TENANCY_GROUP_TONE: Record<TenancyGroup, StatusTone> = {
  draft: "sky",
  active: "moss",
  ending: "amber",
  ended: "gray",
};

export const ACTION_REQUIRED_LABEL = "Vaatii toimenpiteitä";

/** Mitä listalla tiedetään vuokrasuhteesta ilman raskasta kokonaiskuvaa. */
export interface TenancyListFacts {
  status: TenancyStatus;
  startDate: string | null;
  role: TenancyRole;
  /** Alkukatselmuksen tila. `none`: katselmusta ei ole vielä avattu. */
  initialInspection: "none" | "open" | "locked" | "signed";
  /** Vuokralaisen näkymässä: onko hän merkinnyt olevansa valmis. */
  selfReady: boolean;
}

/**
 * Vaatiiko vuokrasuhde toimenpiteitä, eli onko sen seuraava tehtävä myöhässä?
 *
 * Päätös tehdään samalla `nextStep`illä kuin vuokrasuhteen sivulla, jotta
 * lista ja sivu eivät voi olla eri mieltä. Listalle ei kuitenkaan haeta
 * sopimuksen, vuokrien eikä eSinetin tietoja: myöhässä-tila syntyy vain
 * alkukatselmuksen määräajasta, ja se tarvitsee vain alkupäivän ja
 * katselmuksen tilan. Muut kentät täytetään neutraaleilla arvoilla, jotka
 * eivät tuota myöhässä-tilaa.
 */
export function tenancyActionRequired(facts: TenancyListFacts, today: string): boolean {
  const step = nextStep(
    {
      status: facts.status,
      today,
      startDate: facts.startDate,
      contract: { missing: [], sent: false, signed: false, signature: null },
      parties: { ownMissing: 0, othersMissing: 0, tenantsJoined: true },
      paid: true,
      initialInspection: {
        status: facts.initialInspection,
        // Lukitun katselmuksen lähetys ei vaikuta myöhässä-tilaan.
        sent: false,
        signature: null,
        selfReady: facts.selfReady,
      },
      finalInspection: { status: "none", sent: false, signature: null, selfReady: false },
      rent: null,
      openDefects: 0,
      certificates: null,
    },
    facts.role,
  );
  return step.tone === "overdue";
}

const GROUP_ORDER: Record<TenancyGroup, number> = { active: 1, draft: 2, ending: 3, ended: 4 };

/**
 * Vuokrasuhdelistan järjestys: ensin toimenpiteitä vaativat, sitten voimassa,
 * luonnokset, päättymässä ja päättyneet. Saman ryhmän sisällä uusin ensin.
 * Toimenpiteitä vaativat ovat ylimpänä, koska niiden takia listaa avataan.
 */
export function sortTenancyRows<
  T extends { status: TenancyStatus; actionRequired: boolean; startDate: string | null; createdAt: string },
>(rows: T[]): T[] {
  const rank = (row: T) => (row.actionRequired ? 0 : GROUP_ORDER[tenancyGroup(row.status)]);
  return [...rows].sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    const byStart = (b.startDate ?? "").localeCompare(a.startDate ?? "");
    if (byStart !== 0) return byStart;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

// ---------------------------------------------------------------------------
// Asunnon tilan tekstit (asuntolista ja asunnon sivu)
// ---------------------------------------------------------------------------

export interface PropertyStatusView {
  label: string;
  tone: StatusTone;
  /** Lisätieto merkin vieressä, esimerkiksi vuokralainen ja vuokra. */
  detail: string | null;
  linkLabel: string;
  href: string;
  /** Huomautus, jos asunnolla on useampi samassa vaiheessa oleva vuokrasuhde. */
  note: string | null;
}

export function propertyStatusView(
  propertyId: string,
  status: PropertyStatus<
    PropertyTenancyFacts & { rentAmount: number | null; endsAt: string | null; tenantLabel: string | null }
  >,
): PropertyStatusView {
  const label = PROPERTY_STATUS_LABEL[status.kind];
  const tone = PROPERTY_STATUS_TONE[status.kind];
  const tenancy = status.tenancy;

  if (!tenancy) {
    return {
      label,
      tone,
      detail: null,
      linkLabel: "Luo vuokrasuhde",
      href: `/asunnot/${propertyId}/vuokrasuhde/uusi`,
      note: null,
    };
  }

  const parts: string[] = [];
  if (status.kind === "ending" && tenancy.endsAt) {
    parts.push(`Päättyy ${formatFinnishDate(tenancy.endsAt)}`);
  } else {
    if (tenancy.tenantLabel) parts.push(`Vuokralainen: ${tenancy.tenantLabel}`);
    if (tenancy.rentAmount !== null) parts.push(`${tenancy.rentAmount} €/kk`);
  }

  return {
    label,
    tone,
    detail: parts.length > 0 ? parts.join(" · ") : null,
    linkLabel: status.kind === "pending" ? "Jatka sopimusta" : "Avaa vuokrasuhde",
    href: `/vuokrasuhteet/${tenancy.id}`,
    // Toista vuokrasuhdetta ei piiloteta: se löytyy Vuokrasuhteet-sivulta.
    note:
      status.others === 0
        ? null
        : status.others === 1
          ? "Asunnolla on toinenkin samassa vaiheessa oleva vuokrasuhde. Näet molemmat Vuokrasuhteet-sivulla."
          : `Asunnolla on ${status.others + 1} samassa vaiheessa olevaa vuokrasuhdetta. Näet ne Vuokrasuhteet-sivulla.`,
  };
}
