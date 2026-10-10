import { describe, expect, it } from "vitest";
import {
  contractGaps,
  defectRowText,
  monthGenitive,
  nextStep,
  rentRowText,
  tenancyPhases,
  type InspectionFacts,
  type TenancyState,
} from "@/lib/tenancy/next-step";

/**
 * Vuokrasuhteen sivun "Seuraavaksi" ja vaiheet (Jukan palaute 10.10.2026).
 * Jokainen tila kummankin osapuolen silmin.
 */

const OPEN: InspectionFacts = { status: "none", sent: false, signature: null, selfReady: false };

type Patch = Partial<Omit<TenancyState, "contract" | "parties" | "initialInspection" | "finalInspection">> & {
  contract?: Partial<TenancyState["contract"]>;
  parties?: Partial<TenancyState["parties"]>;
  initialInspection?: Partial<InspectionFacts>;
  finalInspection?: Partial<InspectionFacts>;
};

/** Luonnos, jossa kaikki on valmista lähetettäväksi. */
function state(patch: Patch = {}): TenancyState {
  const base: TenancyState = {
    status: "draft",
    today: "2026-10-10",
    startDate: "2026-11-01",
    contract: { missing: [], sent: false, signed: false, signature: null },
    parties: { ownMissing: 0, othersMissing: 0, tenantsJoined: true },
    paid: true,
    initialInspection: OPEN,
    finalInspection: OPEN,
    rent: null,
    openDefects: 0,
    certificates: null,
  };
  return {
    ...base,
    ...patch,
    contract: { ...base.contract, ...patch.contract },
    parties: { ...base.parties, ...patch.parties },
    initialInspection: { ...base.initialInspection, ...patch.initialInspection },
    finalInspection: { ...base.finalInspection, ...patch.finalInspection },
  };
}

/** Allekirjoitettu ja käynnissä, alkukatselmus allekirjoitettu. */
function active(patch: Patch = {}): TenancyState {
  return state({
    status: "active",
    startDate: "2026-09-01",
    contract: { sent: true, signed: true },
    initialInspection: { status: "signed", sent: true },
    ...patch,
  });
}

describe("sopimusvaihe, vuokranantaja", () => {
  it("puuttuvat sopimuksen tiedot ensin", () => {
    const step = nextStep(
      state({ contract: { missing: ["Avainten määrä"] }, parties: { ownMissing: 2 } }),
      "landlord",
    );
    expect(step.key).toBe("contract_fill");
    expect(step.title).toBe("Täydennä vuokrasopimus");
    expect(step.reason).toContain("avainten määrä");
    expect(step.path).toBe("sopimus");
    expect(step.phase).toBe("sopimus");
  });

  it("omat osapuolitiedot puuttuvat", () => {
    const step = nextStep(state({ parties: { ownMissing: 1 } }), "landlord");
    expect(step.key).toBe("party_details");
    expect(step.title).toBe("Täydennä osapuolten tiedot");
    expect(step.path).toBe("osapuolet");
  });

  it("vuokralainen ei ole liittynyt ja hänen tietonsa puuttuvat: odotetaan, tarjotaan uudelleenlähetys", () => {
    const step = nextStep(state({ parties: { othersMissing: 2, tenantsJoined: false } }), "landlord");
    expect(step.key).toBe("waiting_tenant");
    expect(step.title).toBe("Odotetaan vuokralaista");
    expect(step.tone).toBe("waiting");
    expect(step.path).toBe("#osapuolet");
    expect(step.actionLabel).toBe("Lähetä kutsu uudelleen");
  });

  it("vuokralainen on liittynyt, mutta hänen tietonsa puuttuvat", () => {
    const step = nextStep(state({ parties: { othersMissing: 1, tenantsJoined: true } }), "landlord");
    expect(step.key).toBe("party_details");
  });

  it("liittymätön vuokralainen ei estä lähetystä, jos tiedot on täytetty", () => {
    const step = nextStep(state({ parties: { tenantsJoined: false } }), "landlord");
    expect(step.key).toBe("send_contract");
  });

  it("kaikki valmista: lähetä allekirjoitettavaksi", () => {
    const step = nextStep(state(), "landlord");
    expect(step.title).toBe("Lähetä sopimus allekirjoitettavaksi");
    expect(step.path).toBe("allekirjoitus");
    expect(step.tone).toBe("action");
  });

  it("maksamaton: sama tehtävä, syy kertoo maksusta", () => {
    expect(nextStep(state({ paid: false }), "landlord").reason).toContain("Vahvista maksu");
  });

  it("lähetetty, oma allekirjoitus puuttuu", () => {
    const step = nextStep(state({ status: "signing", contract: { sent: true, signature: "mine" } }), "landlord");
    expect(step.title).toBe("Allekirjoita sopimus");
    expect(step.path).toBe("allekirjoitus");
  });

  it("lähetetty, odotetaan toista", () => {
    const step = nextStep(state({ status: "signing", contract: { sent: true, signature: "others" } }), "landlord");
    expect(step.key).toBe("waiting_contract_signatures");
    expect(step.tone).toBe("waiting");
  });

  it("lähetetty, eSinetti ei vastannut: odotetaan", () => {
    const step = nextStep(state({ status: "signing", contract: { sent: true, signature: "unknown" } }), "landlord");
    expect(step.key).toBe("waiting_contract_signatures");
  });
});

describe("sopimusvaihe, vuokralainen", () => {
  it("omat tiedot puuttuvat", () => {
    const step = nextStep(state({ parties: { ownMissing: 1 } }), "tenant");
    expect(step.title).toBe("Täydennä omat tietosi");
    expect(step.path).toBe("osapuolet");
  });

  it("omat tiedot valmiit: odotetaan vuokranantajaa, vaikka sopimus olisi kesken", () => {
    const step = nextStep(state({ contract: { missing: ["Avainten määrä"] } }), "tenant");
    expect(step.key).toBe("waiting_landlord_send");
    expect(step.title).toBe("Odotetaan vuokranantajaa");
    expect(step.tone).toBe("waiting");
    expect(step.path).toBe("sopimus");
  });

  it("lähetetty, oma allekirjoitus puuttuu", () => {
    const step = nextStep(state({ status: "signing", contract: { sent: true, signature: "mine" } }), "tenant");
    expect(step.title).toBe("Allekirjoita sopimus");
    expect(step.reason).toContain("sähköpostissasi");
  });

  it("lähetetty, odotetaan toista", () => {
    expect(nextStep(state({ status: "signing", contract: { sent: true, signature: "others" } }), "tenant").key).toBe(
      "waiting_contract_signatures",
    );
  });
});

describe("alkukatselmus", () => {
  const signedNoInspection = (patch: Patch = {}) =>
    active({ initialInspection: { status: "none", sent: false }, ...patch });

  it("ei tehty, määräaika edessä", () => {
    const step = nextStep(signedNoInspection({ startDate: "2026-10-05" }), "landlord");
    expect(step.title).toBe("Tee alkukatselmus");
    expect(step.deadline).toBe("2026-10-19");
    expect(step.tone).toBe("action");
    expect(step.reason).toContain("19.10.2026");
    expect(step.reason).toContain("Lukitse katselmus");
    expect(step.phase).toBe("alkukatselmus");
  });

  it("myöhässä: coral", () => {
    const step = nextStep(signedNoInspection({ startDate: "2026-09-01" }), "landlord");
    expect(step.tone).toBe("overdue");
    expect(step.deadline).toBe("2026-09-15");
    expect(step.reason).toContain("Määräaika oli 15.9.2026");
  });

  it("vuokralaiselle sama tehtävä omalla ohjeella", () => {
    const step = nextStep(signedNoInspection({ initialInspection: { status: "open" } }), "tenant");
    expect(step.title).toBe("Tee alkukatselmus");
    expect(step.reason).toContain("Olen valmis");
  });

  it("vuokralainen on valmis: odotetaan lukitusta", () => {
    const step = nextStep(signedNoInspection({ initialInspection: { status: "open", selfReady: true } }), "tenant");
    expect(step.key).toBe("waiting_lock_initial");
    expect(step.tone).toBe("waiting");
  });

  it("ilman alkupäivää ei määräaikaa", () => {
    const step = nextStep(signedNoInspection({ startDate: null }), "landlord");
    expect(step.deadline).toBeNull();
    expect(step.tone).toBe("action");
  });

  it("lukittu, pöytäkirja lähettämättä", () => {
    const facts = { initialInspection: { status: "locked" as const, sent: false } };
    expect(nextStep(active(facts), "landlord").title).toBe("Lähetä pöytäkirja allekirjoitettavaksi");
    const tenant = nextStep(active(facts), "tenant");
    expect(tenant.key).toBe("waiting_protocol_send_initial");
    expect(tenant.tone).toBe("waiting");
  });

  it("lukittu ja lähetetty, oma allekirjoitus puuttuu", () => {
    const facts = { initialInspection: { status: "locked" as const, sent: true, signature: "mine" as const } };
    expect(nextStep(active(facts), "landlord").title).toBe("Allekirjoita pöytäkirja");
    expect(nextStep(active(facts), "tenant").title).toBe("Allekirjoita pöytäkirja");
  });

  it("lukittu ja lähetetty, odotetaan toista", () => {
    const facts = { initialInspection: { status: "locked" as const, sent: true, signature: "others" as const } };
    expect(nextStep(active(facts), "landlord").key).toBe("waiting_protocol_signatures_initial");
  });

  it("katselmus ei estä sopimusta: allekirjoittamaton sopimus on aina ensin", () => {
    expect(nextStep(state({ startDate: "2026-09-01" }), "landlord").key).toBe("send_contract");
  });
});

describe("vuokrasuhde käynnissä", () => {
  it("vuokranantaja kuittaa kuluvan kuun vuokran", () => {
    const step = nextStep(active({ rent: { periodMonth: "2026-10-01", status: "unconfirmed" } }), "landlord");
    expect(step.title).toBe("Kuittaa lokakuun vuokra");
    expect(step.path).toBe("vuokrat");
    expect(step.phase).toBe("kaynnissa");
  });

  it("Ei vielä -kuittaus pyytää päivitystä", () => {
    const step = nextStep(active({ rent: { periodMonth: "2026-09-01", status: "not_yet" } }), "landlord");
    expect(step.title).toBe("Kuittaa syyskuun vuokra");
    expect(step.reason).toContain("Ei vielä");
  });

  it("kuitattu vuokra ei ole tehtävä", () => {
    expect(nextStep(active({ rent: { periodMonth: "2026-10-01", status: "paid" } }), "landlord").key).toBe(
      "all_good",
    );
    expect(nextStep(active({ rent: { periodMonth: "2026-10-01", status: "partial" } }), "landlord").key).toBe(
      "all_good",
    );
  });

  it("vuokralainen ei kuittaa", () => {
    expect(nextStep(active({ rent: { periodMonth: "2026-10-01", status: "unconfirmed" } }), "tenant").key).toBe(
      "all_good",
    );
  });

  it("avoimet viat", () => {
    const landlord = nextStep(active({ openDefects: 2 }), "landlord");
    expect(landlord.title).toBe("Käy läpi avoimet viat");
    expect(landlord.reason).toContain("2 avointa vikaa");
    expect(landlord.tone).toBe("action");
    const tenant = nextStep(active({ openDefects: 1 }), "tenant");
    expect(tenant.reason).toContain("yksi avoin vika");
    expect(tenant.tone).toBe("waiting");
  });

  it("vuokra ennen vikoja", () => {
    expect(
      nextStep(active({ openDefects: 3, rent: { periodMonth: "2026-10-01", status: "unconfirmed" } }), "landlord")
        .key,
    ).toBe("confirm_rent");
  });

  it("ei mitään kiireellistä", () => {
    const step = nextStep(active(), "tenant");
    expect(step.title).toBe("Ei kiireellistä tehtävää");
    expect(step.tone).toBe("done");
    expect(step.path).toBeNull();
  });

  it("myöhässä oleva alkukatselmus menee vuokran edelle", () => {
    const step = nextStep(
      active({
        initialInspection: { status: "open" },
        rent: { periodMonth: "2026-10-01", status: "unconfirmed" },
      }),
      "landlord",
    );
    expect(step.key).toBe("initial_inspection");
    expect(step.tone).toBe("overdue");
  });
});

describe("päättyminen", () => {
  const ending = (patch: Patch = {}) => active({ status: "ending", ...patch });

  it("loppukatselmus tekemättä", () => {
    const step = nextStep(ending(), "landlord");
    expect(step.title).toBe("Tee loppukatselmus");
    expect(step.path).toBe("loppukatselmus");
    expect(step.phase).toBe("paattyminen");
  });

  it("myös vaikka alkukatselmus jäi tekemättä", () => {
    expect(nextStep(ending({ initialInspection: { status: "open" } }), "tenant").title).toBe("Tee loppukatselmus");
  });

  it("vuokralainen valmis: odotetaan lukitusta", () => {
    expect(nextStep(ending({ finalInspection: { status: "open", selfReady: true } }), "tenant").key).toBe(
      "waiting_lock_final",
    );
  });

  it("lukittu, lähettämättä", () => {
    const facts = { finalInspection: { status: "locked" as const } };
    const landlord = nextStep(ending(facts), "landlord");
    expect(landlord.title).toBe("Lähetä loppukatselmus allekirjoitettavaksi");
    expect(landlord.path).toBe("paattyminen");
    expect(nextStep(ending(facts), "tenant").key).toBe("waiting_protocol_send_final");
  });

  it("lähetetty: allekirjoita tai odota", () => {
    expect(
      nextStep(ending({ finalInspection: { status: "locked", sent: true, signature: "mine" } }), "tenant").title,
    ).toBe("Allekirjoita loppukatselmus");
    expect(
      nextStep(ending({ finalInspection: { status: "locked", sent: true, signature: "others" } }), "landlord").key,
    ).toBe("waiting_protocol_signatures_final");
  });

  it("allekirjoitettu, tila ei vielä päivittynyt", () => {
    expect(nextStep(ending({ finalInspection: { status: "signed", sent: true } }), "landlord").key).toBe(
      "waiting_end",
    );
  });

  it("päättynyt: arvio, vastine tai odotus", () => {
    const ended = (certificates: TenancyState["certificates"]) => active({ status: "ended", certificates });
    expect(nextStep(ended({ canRate: true, canReply: false }), "landlord").title).toBe("Anna arvio");
    expect(nextStep(ended({ canRate: false, canReply: true }), "tenant").title).toBe("Vastaa arvioon");
    expect(nextStep(ended({ canRate: false, canReply: false }), "tenant").key).toBe("waiting_certificates");
    expect(nextStep(ended(null), "tenant").key).toBe("waiting_certificates");
  });

  it("todistukset annettu", () => {
    const step = nextStep(active({ status: "certified" }), "tenant");
    expect(step.title).toBe("Vuokratodistus on valmis");
    expect(step.tone).toBe("done");
  });
});

describe("jokainen tehtävä on yksi ja kokonainen", () => {
  const samples: TenancyState[] = [
    state(),
    state({ contract: { missing: ["Vuokra"] } }),
    state({ parties: { ownMissing: 1 } }),
    state({ parties: { othersMissing: 1, tenantsJoined: false } }),
    state({ status: "signing", contract: { sent: true, signature: "mine" } }),
    active({ initialInspection: { status: "open" } }),
    active({ initialInspection: { status: "locked" } }),
    active({ rent: { periodMonth: "2026-10-01", status: "unconfirmed" } }),
    active({ openDefects: 1 }),
    active(),
    active({ status: "ending" }),
    active({ status: "ended" }),
    active({ status: "certified" }),
  ];

  it("ei huutomerkkejä, ja toiminnolla on aina nimi", () => {
    for (const sample of samples) {
      for (const role of ["landlord", "tenant"] as const) {
        const step = nextStep(sample, role);
        expect(step.title).not.toContain("!");
        expect(step.reason).not.toContain("!");
        expect(step.reason.length).toBeGreaterThan(10);
        expect(Boolean(step.path)).toBe(Boolean(step.actionLabel));
      }
    }
  });
});

describe("vaiheet", () => {
  it("luonnos: sopimus kesken, muut tulossa", () => {
    const phases = tenancyPhases(state());
    expect(phases.map((phase) => phase.key)).toEqual(["sopimus", "alkukatselmus", "kaynnissa", "paattyminen"]);
    expect(phases.map((phase) => phase.status)).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
    expect(phases[0].detail).toBe("Luonnos");
  });

  it("lähetetty sopimus vie allekirjoitukseen", () => {
    const [contract] = tenancyPhases(state({ status: "signing", contract: { sent: true } }));
    expect(contract.detail).toBe("Odottaa allekirjoituksia");
    expect(contract.path).toBe("allekirjoitus");
  });

  it("allekirjoitettu, katselmus myöhässä", () => {
    const phases = tenancyPhases(active({ initialInspection: { status: "open" } }));
    expect(phases.map((phase) => phase.status)).toEqual(["done", "overdue", "current", "upcoming"]);
    expect(phases[1].detail).toBe("Määräaika oli 15.9.2026");
  });

  it("allekirjoitettu, katselmus ajallaan", () => {
    const phases = tenancyPhases(active({ startDate: "2026-10-05", initialInspection: { status: "none" } }));
    expect(phases[1].status).toBe("current");
    expect(phases[1].detail).toBe("Viimeistään 19.10.2026");
  });

  it("katselmus lukittu", () => {
    const [, inspection] = tenancyPhases(active({ initialInspection: { status: "locked", sent: true } }));
    expect(inspection.status).toBe("current");
    expect(inspection.path).toBe("allekirjoitus");
  });

  it("päättymässä ja todistukset", () => {
    expect(tenancyPhases(active({ status: "ending" })).map((phase) => phase.status)).toEqual([
      "done",
      "done",
      "done",
      "current",
    ]);
    expect(tenancyPhases(active({ status: "certified" }))[3].status).toBe("done");
  });

  it("päättyessä tekemätön alkukatselmus näkyy sanana, ei myöhässä-värinä", () => {
    const [, inspection] = tenancyPhases(active({ status: "ending", initialInspection: { status: "open" } }));
    expect(inspection.status).toBe("missed");
  });
});

describe("apufunktiot", () => {
  it("sopimuksen puutteet", () => {
    expect(
      contractGaps({ termsReviewed: true, startDate: "2026-11-01", rentAmount: 800, rentDueDay: 5, keysCount: 2 }),
    ).toEqual([]);
    expect(
      contractGaps({ termsReviewed: false, startDate: null, rentAmount: null, rentDueDay: null, keysCount: null }),
    ).toHaveLength(5);
  });

  it("kuukaudet", () => {
    expect(monthGenitive("2026-01-01")).toBe("tammikuun");
    expect(monthGenitive("2026-12-01")).toBe("joulukuun");
  });

  it("vuokrarivi", () => {
    const row = (status: "paid" | "partial" | "not_yet" | "unconfirmed", dueDate = "2026-10-05") => ({
      periodMonth: "2026-10-01",
      dueDate,
      status,
    });
    expect(rentRowText(null, "2026-10-10", "landlord")).toBe("Ei vuokrakausia tälle kuulle");
    expect(rentRowText(row("paid"), "2026-10-10", "tenant")).toBe("Lokakuu: vuokra tullut");
    expect(rentRowText(row("partial"), "2026-10-10", "tenant")).toBe("Lokakuu: osa vuokrasta tullut");
    expect(rentRowText(row("not_yet"), "2026-10-10", "tenant")).toBe("Lokakuu: ei vielä");
    expect(rentRowText(row("unconfirmed"), "2026-10-10", "landlord")).toBe("Lokakuu: kuittaamatta");
    expect(rentRowText(row("unconfirmed"), "2026-10-10", "tenant")).toBe("Lokakuu: ei vielä kuitattu");
    expect(rentRowText(row("unconfirmed", "2026-10-15"), "2026-10-10", "landlord")).toBe(
      "Seuraava eräpäivä 15.10.2026",
    );
  });

  it("huoltokirjarivi", () => {
    expect(defectRowText(0)).toBe("Ei avoimia vikoja");
    expect(defectRowText(1)).toBe("1 avoin vika");
    expect(defectRowText(4)).toBe("4 avointa vikaa");
  });
});
