import { describe, expect, it } from "vitest";
import {
  inspectionDeadline,
  inspectionDeadlineView,
  plannedInspectionReminders,
} from "@/lib/inspection/deadline";

/**
 * Alkukatselmuksen määräaika: 14 päivää vuokrasuhteen alkamisesta, muistutus
 * molemmille 7 ja 14 päivän kohdalla, jos katselmusta ei ole lukittu.
 */

const TENANCY = "11111111-1111-1111-1111-111111111111";
const at = (date: string) => new Date(`${date}T09:00:00.000Z`);

describe("määräaika", () => {
  it("on 14 päivää alkamisesta, myös kuun vaihteen yli", () => {
    expect(inspectionDeadline("2026-10-01")).toBe("2026-10-15");
    expect(inspectionDeadline("2026-10-25")).toBe("2026-11-08");
  });

  it("näkyy avoimelle katselmukselle ja kertoo myöhästymisen", () => {
    expect(inspectionDeadlineView("2026-10-01", "open", "2026-10-15")).toEqual({
      phase: "open",
      deadline: "2026-10-15",
      overdue: false,
    });
    expect(inspectionDeadlineView("2026-10-01", null, "2026-10-16")).toEqual({
      phase: "open",
      deadline: "2026-10-15",
      overdue: true,
    });
  });

  it("ei koske lukittua eikä allekirjoitettua", () => {
    expect(inspectionDeadlineView("2026-10-01", "locked", "2026-12-01")).toEqual({ phase: "locked" });
    expect(inspectionDeadlineView("2026-10-01", "signed", "2026-12-01")).toEqual({ phase: "signed" });
  });

  it("ilman alkupäivää ei ole määräaikaa", () => {
    expect(inspectionDeadlineView(null, "open", "2026-10-01")).toEqual({
      phase: "open",
      deadline: null,
      overdue: false,
    });
  });
});

describe("muistutukset", () => {
  const state = { tenancyId: TENANCY, startDate: "2026-10-01", status: "open" as const };

  it("ei mitään ennen seitsemättä päivää", () => {
    expect(plannedInspectionReminders(state, at("2026-10-07"))).toEqual([]);
  });

  it("seitsemäntenä päivänä molemmille", () => {
    const planned = plannedInspectionReminders(state, at("2026-10-08"));
    expect(planned.map((p) => [p.kind, p.recipient])).toEqual([
      ["inspection.deadline.7", "landlord"],
      ["inspection.deadline.7", "tenant"],
    ]);
    expect(planned[0].body).toContain("15.10.2026");
    expect(planned[0].path).toBe(`/vuokrasuhteet/${TENANCY}/katselmus`);
    expect(planned[0].dedupeKey).toBe(`inspection.deadline.7:${TENANCY}`);
  });

  it("neljäntenätoista päivänä toinen muistutus, ensimmäinen ei enää", () => {
    const planned = plannedInspectionReminders(state, at("2026-10-15"));
    expect(planned.map((p) => p.kind)).toEqual(["inspection.deadline.14", "inspection.deadline.14"]);
  });

  it("myöhässä ajettu ajo lähettää vielä, kuukausien takainen ei", () => {
    expect(plannedInspectionReminders(state, at("2026-10-21"))).toHaveLength(2);
    expect(plannedInspectionReminders(state, at("2026-10-22"))).toEqual([]);
  });

  it("lukittu tai avaamaton katselmus", () => {
    expect(plannedInspectionReminders({ ...state, status: "locked" }, at("2026-10-08"))).toEqual([]);
    expect(plannedInspectionReminders({ ...state, status: "signed" }, at("2026-10-15"))).toEqual([]);
    // Avaamaton katselmus on kesken siinä missä avoinkin.
    expect(plannedInspectionReminders({ ...state, status: null }, at("2026-10-08"))).toHaveLength(2);
  });

  it("ei huutomerkkejä", () => {
    for (const p of plannedInspectionReminders(state, at("2026-10-15"))) {
      expect(p.title + p.body).not.toContain("!");
    }
  });
});
