import { describe, expect, it } from "vitest";
import {
  approveFeatureRequestSchema,
  featureLabel,
  featureOptions,
  featureRequestSchema,
  isFeature,
  isFeatureRequestAdmin,
  OTHER_FEATURE,
  rejectFeatureRequestSchema,
  requestChangesSchema,
  safePagePath,
} from "@/lib/feature-requests";
import { HELP_TOPICS } from "@/lib/help/topics";

/**
 * Kehitystoiveiden puhdas logiikka: toiminnot, lomakkeen tarkistus ja
 * käsittelijäoikeus (DECISIONS.md 2026-09-27).
 */

describe("toiminnot", () => {
  it("ovat ohjeaiheet ilman kehitystoiveita itseään, ja lisäksi muu", () => {
    const values = featureOptions().map((f) => f.value);
    expect(values).not.toContain("kehitystoiveet");
    expect(values).toContain(OTHER_FEATURE);
    expect(values.length).toBe(HELP_TOPICS.length);
  });

  it("tuntematon toiminto hylätään", () => {
    expect(isFeature("vuokranmaksu")).toBe(true);
    expect(isFeature("jotain")).toBe(false);
    expect(featureLabel("jotain")).toBe("Muu asia");
  });
});

describe("sivun osoite", () => {
  it("vain sovelluksen sisäinen polku", () => {
    expect(safePagePath("/vuokrasuhteet/abc-123/vuokrat")).toBe("/vuokrasuhteet/abc-123/vuokrat");
    expect(safePagePath("https://example.com/")).toBeNull();
    expect(safePagePath("//example")).toBeNull();
    expect(safePagePath("/a?b=c")).toBeNull();
    expect(safePagePath("/" + "a".repeat(250))).toBeNull();
    expect(safePagePath(null)).toBeNull();
  });
});

describe("lomake", () => {
  const valid = {
    feature: "vuokranmaksu",
    pagePath: "/vuokrasuhteet/x/vuokrat",
    title: "Muistutus",
    description: "Toivoisin muistutuksen.",
    importance: "nice",
  };

  it("hyväksyy kelvollisen toiveen", () => {
    const parsed = featureRequestSchema.parse(valid);
    expect(parsed.pagePath).toBe("/vuokrasuhteet/x/vuokrat");
  });

  it("kelvoton sivu ei kaada lomaketta vaan jää pois", () => {
    expect(featureRequestSchema.parse({ ...valid, pagePath: "javascript:alert(1)" }).pagePath).toBeNull();
  });

  it("vaatii toiminnon, otsikon ja kuvauksen", () => {
    const result = featureRequestSchema.safeParse({ ...valid, feature: "x", title: " ", description: "" });
    expect(result.success).toBe(false);
    const fields = result.error!.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["feature", "title", "description"]));
  });

  it("tärkeys vain sallituista", () => {
    expect(featureRequestSchema.safeParse({ ...valid, importance: "kiire" }).success).toBe(false);
  });

  it("hyväksynnän kuvaus on vapaaehtoinen ja tyhjä tallentuu tyhjänä", () => {
    expect(approveFeatureRequestSchema.parse({ approvedDescription: "  " }).approvedDescription).toBeNull();
    expect(approveFeatureRequestSchema.parse({ approvedDescription: "Muokattu" }).approvedDescription).toBe("Muokattu");
  });

  it("hylkäys ja muutospyyntö vaativat tekstin", () => {
    expect(rejectFeatureRequestSchema.safeParse({ response: "" }).success).toBe(false);
    expect(rejectFeatureRequestSchema.parse({ response: "Ei sovi palveluun." }).response).toBe("Ei sovi palveluun.");
    expect(requestChangesSchema.safeParse({ response: "  " }).success).toBe(false);
    expect(requestChangesSchema.parse({ response: "Korjaa X." }).response).toBe("Korjaa X.");
  });
});

describe("käsittelijä", () => {
  it("tunnistetaan listasta kirjainkoosta välittämättä", () => {
    const list = "jukka@example.fi, toinen@example.fi";
    expect(isFeatureRequestAdmin("Jukka@Example.fi", list)).toBe(true);
    expect(isFeatureRequestAdmin("muu@example.fi", list)).toBe(false);
  });

  it("ilman listaa kukaan ei ole käsittelijä", () => {
    expect(isFeatureRequestAdmin("jukka@example.fi", "")).toBe(false);
    expect(isFeatureRequestAdmin("jukka@example.fi", undefined)).toBe(false);
    expect(isFeatureRequestAdmin(null, "jukka@example.fi")).toBe(false);
  });
});
