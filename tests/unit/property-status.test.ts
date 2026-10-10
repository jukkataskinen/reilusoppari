import { describe, expect, it } from "vitest";
import type { TenancyStatus } from "@/lib/db/tenancies";
import {
  propertyStatus,
  propertyStatusView,
  sortTenancyRows,
  tenancyActionRequired,
  tenancyGroup,
  type TenancyListFacts,
} from "@/lib/property/status";

/** Asunnon tila ja vuokrasuhdelistan värit ja järjestys (Jukka 10.10.2026). */

let seq = 0;
function tenancy(
  status: TenancyStatus,
  patch: Partial<{
    startDate: string | null;
    createdAt: string;
    rentAmount: number | null;
    endsAt: string | null;
    tenantLabel: string | null;
  }> = {},
) {
  seq += 1;
  return {
    id: `t${seq}`,
    status,
    startDate: "2026-10-01" as string | null,
    createdAt: `2026-10-01T00:00:00.${String(seq).padStart(3, "0")}Z`,
    rentAmount: 500 as number | null,
    endsAt: null as string | null,
    tenantLabel: "Vuokralainen Testi" as string | null,
    ...patch,
  };
}

describe("propertyStatus", () => {
  it("ilman vuokrasuhteita asunto on vapaa", () => {
    expect(propertyStatus([])).toEqual({ kind: "vacant", tenancy: null, others: 0 });
  });

  it("päättyneet ja todistetut eivät tee asunnosta varattua", () => {
    expect(propertyStatus([tenancy("ended"), tenancy("certified")]).kind).toBe("vacant");
  });

  it.each([
    ["draft", "pending"],
    ["inspection", "pending"],
    ["signing", "pending"],
    ["active", "rented"],
    ["ending", "ending"],
  ] as const)("%s → %s", (status, kind) => {
    expect(propertyStatus([tenancy(status)]).kind).toBe(kind);
  });

  it("etusija: voimassa > irtisanottu > kesken", () => {
    const draft = tenancy("draft");
    const ending = tenancy("ending");
    const active = tenancy("active");
    expect(propertyStatus([draft, ending, active]).tenancy).toBe(active);
    expect(propertyStatus([draft, ending]).tenancy).toBe(ending);
  });

  it("kaksi voimassa olevaa: uusin alkupäivä, toinen lasketaan muihin", () => {
    const older = tenancy("active", { startDate: "2026-09-01" });
    const newer = tenancy("active", { startDate: "2026-10-10" });
    const status = propertyStatus([older, newer]);
    expect(status.tenancy).toBe(newer);
    expect(status.others).toBe(1);
  });

  it("sama alkupäivä: uusin luontihetki", () => {
    const first = tenancy("active", { createdAt: "2026-10-10T08:00:00.000Z" });
    const second = tenancy("active", { createdAt: "2026-10-10T09:00:00.000Z" });
    expect(propertyStatus([first, second]).tenancy).toBe(second);
  });
});

describe("propertyStatusView", () => {
  it("vapaa: Luo vuokrasuhde", () => {
    expect(propertyStatusView("p1", propertyStatus([]))).toMatchObject({
      label: "Vapaa",
      tone: "gray",
      linkLabel: "Luo vuokrasuhde",
      href: "/asunnot/p1/vuokrasuhde/uusi",
      detail: null,
    });
  });

  it("vuokrattu: vuokralainen ja vuokra", () => {
    const t = tenancy("active");
    expect(propertyStatusView("p1", propertyStatus([t]))).toMatchObject({
      label: "Vuokrattu",
      tone: "moss",
      detail: "Vuokralainen: Vuokralainen Testi · 500 €/kk",
      linkLabel: "Avaa vuokrasuhde",
      href: `/vuokrasuhteet/${t.id}`,
      note: null,
    });
  });

  it("irtisanottu: päättymispäivä", () => {
    const view = propertyStatusView("p1", propertyStatus([tenancy("ending", { endsAt: "2026-11-30" })]));
    expect(view).toMatchObject({ label: "Irtisanottu", tone: "amber", detail: "Päättyy 30.11.2026" });
  });

  it("kesken: Jatka sopimusta", () => {
    const view = propertyStatusView("p1", propertyStatus([tenancy("signing")]));
    expect(view).toMatchObject({ label: "Sopimus kesken", tone: "sky", linkLabel: "Jatka sopimusta" });
  });

  it("kaksi samassa vaiheessa: huomautus", () => {
    const view = propertyStatusView("p1", propertyStatus([tenancy("active"), tenancy("active")]));
    expect(view.note).toContain("toinenkin");
  });
});

describe("tenancyActionRequired", () => {
  const base: TenancyListFacts = {
    status: "active",
    startDate: "2026-09-01",
    role: "landlord",
    initialInspection: "none",
    selfReady: false,
  };

  it("myöhässä oleva alkukatselmus vaatii toimenpiteitä", () => {
    expect(tenancyActionRequired(base, "2026-10-10")).toBe(true);
  });

  it("määräaikaa ei ole ohitettu", () => {
    expect(tenancyActionRequired({ ...base, startDate: "2026-10-01" }, "2026-10-10")).toBe(false);
  });

  it("lukittu tai allekirjoitettu katselmus ei ole myöhässä", () => {
    expect(tenancyActionRequired({ ...base, initialInspection: "locked" }, "2026-10-10")).toBe(false);
    expect(tenancyActionRequired({ ...base, initialInspection: "signed" }, "2026-10-10")).toBe(false);
  });

  it("valmiiksi merkinnyt vuokralainen odottaa, ei ole myöhässä", () => {
    expect(tenancyActionRequired({ ...base, role: "tenant", selfReady: true }, "2026-10-10")).toBe(false);
  });

  it("luonnos ja päättynyt eivät ole myöhässä", () => {
    expect(tenancyActionRequired({ ...base, status: "draft" }, "2026-10-10")).toBe(false);
    expect(tenancyActionRequired({ ...base, status: "ended" }, "2026-10-10")).toBe(false);
  });
});

describe("tenancyGroup ja järjestys", () => {
  it("ryhmät", () => {
    expect(tenancyGroup("signing")).toBe("draft");
    expect(tenancyGroup("certified")).toBe("ended");
  });

  const row = (id: string, status: TenancyStatus, actionRequired = false, startDate = "2026-10-01") => ({
    id,
    status,
    actionRequired,
    startDate,
    createdAt: "2026-10-01T00:00:00.000Z",
  });

  it("toimenpiteitä vaativat ensin, sitten voimassa, luonnos, päättymässä, päättynyt", () => {
    const sorted = sortTenancyRows([
      row("ended", "certified"),
      row("ending", "ending"),
      row("draft", "draft"),
      row("active", "active"),
      row("overdue", "active", true),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["overdue", "active", "draft", "ending", "ended"]);
  });

  it("saman ryhmän sisällä uusin ensin", () => {
    const sorted = sortTenancyRows([
      row("a", "active", false, "2026-09-01"),
      row("b", "active", false, "2026-10-01"),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
