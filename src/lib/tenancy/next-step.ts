/**
 * Vuokrasuhteen sivun ohjaus: mikä on seuraava tehtävä ja missä vaiheessa
 * ollaan (Jukan palaute 10.10.2026).
 *
 * ===========================================================================
 * YKSI TEHTÄVÄ KERRALLAAN
 *
 * Vuokrasuhteen sivulla oli yhdeksän samannäköistä painiketta ilman
 * järjestystä tai tilaa, eikä sivu kertonut, mitä pitäisi tehdä seuraavaksi.
 * Nyt sivun yläosassa on aina täsmälleen yksi tehtävä, ja se johdetaan
 * olemassa olevista tiedoista: sopimuksen ja osapuolten tiedoista,
 * allekirjoituskierroksista, katselmusten tilasta, vuokrakausista ja
 * huoltokirjasta. Uusia kenttiä kantaan ei tarvita.
 *
 * JÄRJESTYS ON VUOKRASUHTEEN JÄRJESTYS
 *
 * Sopimus ennen katselmusta, katselmus ennen arkea, arki ennen päättymistä.
 * Myöhässä oleva alkukatselmus menee vuokran kuittauksen edelle, koska
 * kuittauksen voi tehdä myöhemminkin, mutta kuukausia myöhemmin otettu kuva
 * ei enää kerro asunnon kunnosta alussa.
 *
 * PUHDAS FUNKTIO
 *
 * Kaikki tieto tulee parametrina (`overview.ts` kokoaa sen), joten jokainen
 * tila on testattavissa ilman kantaa ja eSinettiä.
 * ===========================================================================
 */

import type { TenancyStatus } from "../db/tenancies";
import { formatFinnishDate, inspectionDeadline } from "../inspection/deadline";

export type TenancyRole = "landlord" | "tenant";

/**
 * Oman allekirjoituksen tila lähetetyllä kierroksella.
 * `unknown`: eSinetiltä ei saatu tietoa juuri nyt.
 */
export type SignatureState = "mine" | "others" | "unknown";

export interface InspectionFacts {
  /** `none`: katselmusta ei ole vielä avattu kertaakaan. */
  status: "none" | "open" | "locked" | "signed";
  /** Onko pöytäkirja lähetetty allekirjoitettavaksi. */
  sent: boolean;
  /** Oman allekirjoituksen tila, kun pöytäkirja on lähetetty. */
  signature: SignatureState | null;
  /** Vuokralaisen näkymässä: onko hän itse merkinnyt olevansa valmis. */
  selfReady: boolean;
}

export type RentStatus = "unconfirmed" | "not_yet" | "partial" | "paid";

export interface TenancyState {
  status: TenancyStatus;
  /** `VVVV-KK-PP`. */
  today: string;
  startDate: string | null;
  contract: {
    /** Mitä sopimuksesta puuttuu (`contractGaps`). Tyhjä = valmis. */
    missing: string[];
    sent: boolean;
    signed: boolean;
    /** Kun sopimus on lähetetty mutta ei vielä allekirjoitettu. */
    signature: SignatureState | null;
  };
  parties: {
    /** Puuttuvat tiedot omalla osapuolirivillä. */
    ownMissing: number;
    /** Puuttuvat tiedot muiden osapuolten riveillä. */
    othersMissing: number;
    /** Ovatko kaikki vuokralaiset liittyneet. */
    tenantsJoined: boolean;
  };
  /** Onko vuokrasuhteen maksu vahvistettu (myös ilmainen ensimmäinen). */
  paid: boolean;
  initialInspection: InspectionFacts;
  finalInspection: InspectionFacts;
  /** Viimeisin vuokrakausi, jonka eräpäivä on mennyt. */
  rent: { periodMonth: string; status: RentStatus } | null;
  openDefects: number;
  /** Päättyneessä vuokrasuhteessa: arviot ja todistukset. */
  certificates: { canRate: boolean; canReply: boolean } | null;
}

export type PhaseKey = "sopimus" | "alkukatselmus" | "kaynnissa" | "paattyminen";

/**
 * `action`: sinun tehtäväsi. `overdue`: tehtäväsi, ja määräaika on mennyt.
 * `waiting`: odotetaan toista. `done`: mikään ei odota sinua.
 */
export type StepTone = "action" | "overdue" | "waiting" | "done";

export interface NextStep {
  /** Pysyvä tunniste testeille ja sivulle. */
  key: string;
  phase: PhaseKey;
  title: string;
  /** Yksi lause siitä, miksi. */
  reason: string;
  /** Määräaika `VVVV-KK-PP`, jos sellainen on. */
  deadline: string | null;
  tone: StepTone;
  /**
   * Polku vuokrasuhteen sivun alla (`sopimus`, `katselmus`) tai ankkuri
   * samalla sivulla (`#osapuolet`). `null`: ei linkkiä.
   */
  path: string | null;
  actionLabel: string | null;
}

const MONTH_GENITIVE = [
  "tammikuun",
  "helmikuun",
  "maaliskuun",
  "huhtikuun",
  "toukokuun",
  "kesäkuun",
  "heinäkuun",
  "elokuun",
  "syyskuun",
  "lokakuun",
  "marraskuun",
  "joulukuun",
];

const MONTH_NOMINATIVE = [
  "Tammikuu",
  "Helmikuu",
  "Maaliskuu",
  "Huhtikuu",
  "Toukokuu",
  "Kesäkuu",
  "Heinäkuu",
  "Elokuu",
  "Syyskuu",
  "Lokakuu",
  "Marraskuu",
  "Joulukuu",
];

/** `2026-10-01` → `lokakuun`. */
export function monthGenitive(periodMonth: string): string {
  return MONTH_GENITIVE[Number(periodMonth.slice(5, 7)) - 1] ?? "";
}

/** `2026-10-01` → `Lokakuu`. */
export function monthName(periodMonth: string): string {
  return MONTH_NOMINATIVE[Number(periodMonth.slice(5, 7)) - 1] ?? "";
}

/** Onko sopimus allekirjoitettu? Tila kertoo sen myös, jos rivi on vanha. */
export function isContractSigned(state: Pick<TenancyState, "status" | "contract">): boolean {
  return state.contract.signed || ["active", "ending", "ended", "certified"].includes(state.status);
}

/**
 * Mitä sopimuksesta puuttuu ennen lähetystä.
 *
 * `termsReviewed` on epätosi, jos vuokranantaja ei ole tallentanut ehtoja
 * kertaakaan: rivi syntyy oletusehdoilla vuokrasuhteen luonnissa, ja
 * oletukset on tarkoitettu lähtökohdaksi eikä valmiiksi sopimukseksi.
 */
export function contractGaps(facts: {
  termsReviewed: boolean;
  startDate: string | null;
  rentAmount: number | null;
  rentDueDay: number | null;
  keysCount: number | null;
}): string[] {
  const gaps: string[] = [];
  if (!facts.termsReviewed) gaps.push("Ehtoja ei ole vielä tarkistettu ja tallennettu");
  if (!facts.startDate) gaps.push("Alkupäivä");
  if (facts.rentAmount === null) gaps.push("Vuokra");
  if (facts.rentDueDay === null) gaps.push("Eräpäivä");
  if (facts.keysCount === null) gaps.push("Avainten määrä");
  return gaps;
}

function step(
  key: string,
  phase: PhaseKey,
  title: string,
  reason: string,
  options: Partial<Pick<NextStep, "deadline" | "tone" | "path" | "actionLabel">> = {},
): NextStep {
  return {
    key,
    phase,
    title,
    reason,
    deadline: options.deadline ?? null,
    tone: options.tone ?? "action",
    path: options.path ?? null,
    actionLabel: options.actionLabel ?? null,
  };
}

function contractStep(state: TenancyState, role: TenancyRole): NextStep {
  const { contract, parties } = state;

  if (contract.sent) {
    if (contract.signature === "mine") {
      return step(
        "sign_contract",
        "sopimus",
        "Allekirjoita sopimus",
        role === "landlord"
          ? "Sopimus odottaa allekirjoitustasi. Allekirjoitat pankkitunnuksilla."
          : "Sopimus odottaa allekirjoitustasi. Allekirjoituslinkki on sähköpostissasi.",
        { path: "allekirjoitus", actionLabel: "Avaa allekirjoitus" },
      );
    }
    return step(
      "waiting_contract_signatures",
      "sopimus",
      "Odotetaan allekirjoituksia",
      "Sopimus on lähetetty allekirjoitettavaksi. Vuokrasuhde alkaa, kun kaikki ovat allekirjoittaneet.",
      { tone: "waiting", path: "allekirjoitus", actionLabel: "Katso tilanne" },
    );
  }

  if (role === "tenant") {
    if (parties.ownMissing > 0) {
      return step(
        "own_details",
        "sopimus",
        "Täydennä omat tietosi",
        "Sopimukseen tarvitaan henkilötunnuksesi ja yhteystietosi ennen allekirjoitusta.",
        { path: "osapuolet", actionLabel: "Täydennä tiedot" },
      );
    }
    return step(
      "waiting_landlord_send",
      "sopimus",
      "Odotetaan vuokranantajaa",
      "Vuokranantaja viimeistelee sopimuksen ja lähettää sen allekirjoitettavaksi. Voit lukea luonnoksen ja kommentoida sitä.",
      { tone: "waiting", path: "sopimus", actionLabel: "Lue sopimusluonnos" },
    );
  }

  if (contract.missing.length > 0) {
    return step(
      "contract_fill",
      "sopimus",
      "Täydennä vuokrasopimus",
      `Sopimuksesta puuttuu vielä: ${contract.missing.join(", ").toLowerCase()}.`,
      { path: "sopimus", actionLabel: "Avaa sopimus" },
    );
  }

  if (parties.ownMissing > 0) {
    return step(
      "party_details",
      "sopimus",
      "Täydennä osapuolten tiedot",
      "Omista tiedoistasi puuttuu jotain, mitä sopimukseen tarvitaan.",
      { path: "osapuolet", actionLabel: "Täydennä tiedot" },
    );
  }

  if (parties.othersMissing > 0 && !parties.tenantsJoined) {
    return step(
      "waiting_tenant",
      "sopimus",
      "Odotetaan vuokralaista",
      "Vuokralainen ei ole vielä liittynyt. Hän täydentää omat tietonsa liityttyään. Voit lähettää kutsun uudelleen tai täyttää hänen tietonsa itse.",
      { tone: "waiting", path: "#osapuolet", actionLabel: "Lähetä kutsu uudelleen" },
    );
  }

  if (parties.othersMissing > 0) {
    return step(
      "party_details",
      "sopimus",
      "Täydennä osapuolten tiedot",
      "Vuokralaisen tiedoista puuttuu vielä jotain, mitä sopimukseen tarvitaan.",
      { path: "osapuolet", actionLabel: "Täydennä tiedot" },
    );
  }

  return step(
    "send_contract",
    "sopimus",
    "Lähetä sopimus allekirjoitettavaksi",
    state.paid
      ? "Sopimus ja osapuolten tiedot ovat valmiit. Allekirjoitus tehdään pankkitunnuksilla."
      : "Sopimus ja osapuolten tiedot ovat valmiit. Vahvista maksu ja lähetä sopimus.",
    { path: "allekirjoitus", actionLabel: "Siirry allekirjoitukseen" },
  );
}

/** Alku- tai loppukatselmuksen tehtävä. `null`, kun katselmus on allekirjoitettu. */
function inspectionStep(
  state: TenancyState,
  role: TenancyRole,
  kind: "initial" | "final",
): NextStep | null {
  const facts = kind === "initial" ? state.initialInspection : state.finalInspection;
  const phase: PhaseKey = kind === "initial" ? "alkukatselmus" : "paattyminen";
  const Name = kind === "initial" ? "Alkukatselmus" : "Loppukatselmus";
  const genitive = kind === "initial" ? "Alkukatselmuksen" : "Loppukatselmuksen";
  const inspectionPath = kind === "initial" ? "katselmus" : "loppukatselmus";
  const signingPath = kind === "initial" ? "allekirjoitus" : "paattyminen";
  const suffix = kind === "initial" ? "initial" : "final";

  if (facts.status === "signed") return null;

  if (facts.status === "none" || facts.status === "open") {
    if (role === "tenant" && facts.selfReady) {
      return step(
        `waiting_lock_${suffix}`,
        phase,
        "Odotetaan katselmuksen lukitusta",
        "Olet merkinnyt olevasi valmis. Vuokranantaja lukitsee katselmuksen, ja sen jälkeen pöytäkirja allekirjoitetaan.",
        { tone: "waiting", path: inspectionPath, actionLabel: "Avaa katselmus" },
      );
    }

    const finish =
      role === "landlord"
        ? "Lukitse katselmus, kun vuokralainen on valmis."
        : "Valitse lopuksi Olen valmis.";

    if (kind === "final") {
      return step(
        "final_inspection",
        phase,
        "Tee loppukatselmus",
        `Vuokrasuhde on irtisanottu. Kuvatkaa asunto samoista kohdista kuin alussa. ${finish}`,
        { path: inspectionPath, actionLabel: "Avaa loppukatselmus" },
      );
    }

    const deadline = state.startDate ? inspectionDeadline(state.startDate) : null;
    const overdue = deadline !== null && state.today > deadline;
    const reason = !deadline
      ? `Kuvatkaa asunto muuton yhteydessä. ${finish}`
      : overdue
        ? `Määräaika oli ${formatFinnishDate(deadline)}. Tehkää katselmus silti mahdollisimman pian. ${finish}`
        : `Kuvatkaa asunto viimeistään ${formatFinnishDate(deadline)}, eli 14 päivän kuluessa vuokrasuhteen alkamisesta. ${finish}`;

    return step("initial_inspection", phase, "Tee alkukatselmus", reason, {
      deadline,
      tone: overdue ? "overdue" : "action",
      path: inspectionPath,
      actionLabel: "Avaa katselmus",
    });
  }

  // Lukittu, ei vielä allekirjoitettu.
  if (!facts.sent) {
    if (role === "landlord") {
      return step(
        `send_protocol_${suffix}`,
        phase,
        kind === "initial"
          ? "Lähetä pöytäkirja allekirjoitettavaksi"
          : "Lähetä loppukatselmus allekirjoitettavaksi",
        `${Name} on lukittu. Pöytäkirja allekirjoitetaan pankkitunnuksilla.`,
        { path: signingPath, actionLabel: "Siirry allekirjoitukseen" },
      );
    }
    return step(
      `waiting_protocol_send_${suffix}`,
      phase,
      "Odotetaan pöytäkirjaa",
      `${Name} on lukittu. Vuokranantaja lähettää pöytäkirjan allekirjoitettavaksi, ja saat linkin sähköpostiisi.`,
      { tone: "waiting", path: inspectionPath, actionLabel: "Avaa katselmus" },
    );
  }

  if (facts.signature === "mine") {
    return step(
      `sign_protocol_${suffix}`,
      phase,
      kind === "initial" ? "Allekirjoita pöytäkirja" : "Allekirjoita loppukatselmus",
      role === "landlord"
        ? `${genitive} pöytäkirja odottaa allekirjoitustasi.`
        : `${genitive} pöytäkirja odottaa allekirjoitustasi. Allekirjoituslinkki on sähköpostissasi.`,
      { path: signingPath, actionLabel: "Avaa allekirjoitus" },
    );
  }

  return step(
    `waiting_protocol_signatures_${suffix}`,
    phase,
    "Odotetaan allekirjoituksia",
    facts.signature === "unknown"
      ? `${genitive} pöytäkirja on lähetetty allekirjoitettavaksi.`
      : `${genitive} pöytäkirja on lähetetty allekirjoitettavaksi. Toinen osapuoli ei ole vielä allekirjoittanut.`,
    { tone: "waiting", path: signingPath, actionLabel: "Katso tilanne" },
  );
}

function everydayStep(state: TenancyState, role: TenancyRole): NextStep {
  const rent = state.rent;
  if (role === "landlord" && rent && (rent.status === "unconfirmed" || rent.status === "not_yet")) {
    return step(
      "confirm_rent",
      "kaynnissa",
      `Kuittaa ${monthGenitive(rent.periodMonth)} vuokra`,
      rent.status === "unconfirmed"
        ? "Eräpäivä on mennyt. Merkitse, tuliko vuokra tilillesi. Vuokralainen näkee merkinnän."
        : "Merkitsit vuokran tilaan Ei vielä. Päivitä kuittaus, kun vuokra on tullut.",
      { path: "vuokrat", actionLabel: "Kuittaa vuokra" },
    );
  }

  if (state.openDefects > 0) {
    const count =
      state.openDefects === 1 ? "yksi avoin vika" : `${state.openDefects} avointa vikaa`;
    return step(
      "open_defects",
      "kaynnissa",
      "Käy läpi avoimet viat",
      role === "landlord"
        ? `Huoltokirjassa on ${count}. Merkitse vika korjatuksi, kun se on hoidettu.`
        : `Huoltokirjassa on ${count}. Voit seurata korjausta ja kommentoida.`,
      {
        tone: role === "landlord" ? "action" : "waiting",
        path: "huoltokirja",
        actionLabel: "Avaa huoltokirja",
      },
    );
  }

  return step(
    "all_good",
    "kaynnissa",
    "Ei kiireellistä tehtävää",
    "Vuokrasuhde on käynnissä, eikä mikään odota sinua juuri nyt.",
    { tone: "done" },
  );
}

function certificateStep(state: TenancyState, role: TenancyRole): NextStep {
  if (state.status === "certified") {
    return step(
      "certificates_ready",
      "paattyminen",
      "Vuokratodistus on valmis",
      "Voit avata todistuksesi ja jakaa sen linkillä.",
      { tone: "done", path: "todistukset", actionLabel: "Avaa todistus" },
    );
  }

  if (state.certificates?.canRate) {
    return step(
      "give_rating",
      "paattyminen",
      "Anna arvio",
      role === "landlord"
        ? "Voit suositella vuokralaista. Arvio tulee hänen vuokratodistukseensa. Arvio on vapaaehtoinen."
        : "Voit suositella vuokranantajaa. Arvio tulee hänen todistukseensa. Arvio on vapaaehtoinen.",
      { path: "todistukset", actionLabel: "Avaa todistukset" },
    );
  }

  if (state.certificates?.canReply) {
    return step(
      "reply_rating",
      "paattyminen",
      "Vastaa arvioon",
      "Toinen osapuoli on kirjoittanut sinusta arvion. Voit liittää siihen oman vastineen.",
      { path: "todistukset", actionLabel: "Avaa todistukset" },
    );
  }

  return step(
    "waiting_certificates",
    "paattyminen",
    "Todistukset valmistuvat",
    "Todistukset sinetöidään, kun arvioiden ja vastineiden aika on kulunut.",
    { tone: "waiting", path: "todistukset", actionLabel: "Avaa todistukset" },
  );
}

/** Täsmälleen yksi seuraava tehtävä tälle käyttäjälle. */
export function nextStep(state: TenancyState, role: TenancyRole): NextStep {
  if (!isContractSigned(state)) return contractStep(state, role);

  if (state.status === "ending") {
    return (
      inspectionStep(state, role, "final") ??
      step(
        "waiting_end",
        "paattyminen",
        "Odotetaan päättymistä",
        "Loppukatselmus on allekirjoitettu. Vuokrasuhde päättyy, kun allekirjoitus on käsitelty.",
        { tone: "waiting", path: "paattyminen", actionLabel: "Avaa päättyminen" },
      )
    );
  }

  if (state.status === "ended" || state.status === "certified") {
    return certificateStep(state, role);
  }

  return inspectionStep(state, role, "initial") ?? everydayStep(state, role);
}

export type PhaseStatus = "done" | "current" | "overdue" | "upcoming" | "missed";

export const PHASE_STATUS_LABEL: Record<PhaseStatus, string> = {
  done: "valmis",
  current: "kesken",
  overdue: "myöhässä",
  upcoming: "tulossa",
  missed: "jäi tekemättä",
};

export interface Phase {
  key: PhaseKey;
  number: number;
  title: string;
  status: PhaseStatus;
  /** Lyhyt tilateksti rivin alle. */
  detail: string;
  path: string;
}

/**
 * Vuokrasuhteen neljä vaihetta tiloineen.
 *
 * Allekirjoitus kuuluu Sopimus-vaiheeseen eikä ole oma vaiheensa: se on
 * sopimuksen viimeinen askel, ja erillisenä se näytti siltä, että sen voisi
 * tehdä milloin tahansa.
 */
export function tenancyPhases(state: TenancyState): Phase[] {
  const signed = isContractSigned(state);
  const afterActive = ["ending", "ended", "certified"].includes(state.status);

  const contract: Phase = signed
    ? { key: "sopimus", number: 1, title: "Sopimus", status: "done", detail: "Allekirjoitettu", path: "sopimus" }
    : state.contract.sent
      ? {
          key: "sopimus",
          number: 1,
          title: "Sopimus",
          status: "current",
          detail: "Odottaa allekirjoituksia",
          path: "allekirjoitus",
        }
      : { key: "sopimus", number: 1, title: "Sopimus", status: "current", detail: "Luonnos", path: "sopimus" };

  const ins = state.initialInspection;
  const deadline = state.startDate ? inspectionDeadline(state.startDate) : null;
  const overdue = deadline !== null && state.today > deadline;
  let inspection: Phase;
  const base = { key: "alkukatselmus" as const, number: 2, title: "Alkukatselmus", path: "katselmus" };
  if (ins.status === "signed") {
    inspection = { ...base, status: "done", detail: "Pöytäkirja allekirjoitettu" };
  } else if (afterActive) {
    inspection = { ...base, status: "missed", detail: "Pöytäkirjaa ei allekirjoitettu" };
  } else if (ins.status === "locked") {
    inspection = {
      ...base,
      status: "current",
      detail: ins.sent ? "Pöytäkirja odottaa allekirjoituksia" : "Lukittu, pöytäkirja lähettämättä",
      path: ins.sent ? "allekirjoitus" : "katselmus",
    };
  } else if (overdue) {
    inspection = { ...base, status: "overdue", detail: `Määräaika oli ${formatFinnishDate(deadline!)}` };
  } else {
    inspection = {
      ...base,
      status: signed || ins.status === "open" ? "current" : "upcoming",
      detail: deadline ? `Viimeistään ${formatFinnishDate(deadline)}` : "Muuton yhteydessä",
    };
  }

  const running: Phase = {
    key: "kaynnissa",
    number: 3,
    title: "Vuokrasuhde käynnissä",
    status: afterActive ? "done" : signed ? "current" : "upcoming",
    detail: afterActive ? "Päättynyt" : signed ? "Vuokranmaksu ja huoltokirja" : "Alkaa allekirjoituksesta",
    path: "vuokrat",
  };

  const ending: Phase = {
    key: "paattyminen",
    number: 4,
    title: "Päättyminen",
    status:
      state.status === "certified"
        ? "done"
        : state.status === "ending" || state.status === "ended"
          ? "current"
          : "upcoming",
    detail:
      state.status === "certified"
        ? "Todistukset valmiit"
        : state.status === "ended"
          ? "Arviot ja todistukset"
          : state.status === "ending"
            ? "Loppukatselmus"
            : "Irtisanominen, loppukatselmus ja todistukset",
    path:
      state.status === "ended" || state.status === "certified"
        ? "todistukset"
        : state.status === "ending"
          ? "loppukatselmus"
          : "paattyminen",
  };

  return [contract, inspection, running, ending];
}

/** Vuokranmaksu-rivin lyhyt tila. */
export function rentRowText(
  current: { periodMonth: string; dueDate: string; status: RentStatus } | null,
  today: string,
  role: TenancyRole,
): string {
  if (!current) return "Ei vuokrakausia tälle kuulle";
  const month = monthName(current.periodMonth);
  switch (current.status) {
    case "paid":
      return `${month}: vuokra tullut`;
    case "partial":
      return `${month}: osa vuokrasta tullut`;
    case "not_yet":
      return `${month}: ei vielä`;
    case "unconfirmed":
      if (current.dueDate > today) return `Seuraava eräpäivä ${formatFinnishDate(current.dueDate)}`;
      return role === "landlord" ? `${month}: kuittaamatta` : `${month}: ei vielä kuitattu`;
  }
}

/** Huoltokirja-rivin lyhyt tila. */
export function defectRowText(openDefects: number): string {
  if (openDefects === 0) return "Ei avoimia vikoja";
  if (openDefects === 1) return "1 avoin vika";
  return `${openDefects} avointa vikaa`;
}
