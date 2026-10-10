import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lomakkeen palvelintoiminnot virhetilanteessa (Jukan havainto 2026-10-09).
 *
 * Arvot pysyvät lomakkeella selaimessa (`components/Form.tsx`), joten
 * palvelimen tehtävä on kertoa JOKAINEN puuttuva tai virheellinen kenttä
 * omalla nimellään — ei ohjata pois sivulta, ei tallentaa mitään eikä
 * palauttaa kirjoitettuja arvoja takaisin (ne voisivat olla arkoja).
 */

const createProperty = vi.fn();
const createTenancy = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`redirect ${url}`);
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "kayttaja-1", email: "testi@example.invalid" })),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/properties", () => ({ createProperty }));
vi.mock("@/lib/db/tenancies", () => ({
  createTenancy,
  getTenancyProperty: vi.fn(async () => null),
}));
vi.mock("@/lib/notifications/invite-email", () => ({ sendInviteEmail: vi.fn(async () => false) }));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, count: 1 })),
}));

const { createPropertyAction } = await import("@/app/asunnot/actions");
const { createTenancyAction } = await import("@/app/vuokrasuhteet/actions");

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const PROPERTY_ID = "6f1c1a52-6a0b-4d6e-9d5c-2b1e1f0a9c11";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("vuokrasuhteen luonti virheellä", () => {
  it("kertoo jokaisen puuttuvan kentän sen omalla nimellä", async () => {
    const state = await createTenancyAction(
      { errors: {} },
      form({ propertyId: PROPERTY_ID, depositAmount: "1700" }),
    );

    expect(state.errors).toEqual({
      tenantName0: "Vuokralaisen nimi puuttuu",
      tenantEmail0: "Sähköpostiosoite puuttuu",
      startDate: "Alkupäivä puuttuu",
      rentAmount: "Vuokra puuttuu",
      rentDueDay: "Eräpäivä puuttuu",
    });
    expect(state.created).toBeUndefined();
    expect(createTenancy).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("merkitsee vain virheellisen kentän, kun muut ovat kunnossa", async () => {
    const state = await createTenancyAction(
      { errors: {} },
      form({
        propertyId: PROPERTY_ID,
        tenantName0: "Maija Meikäläinen",
        tenantEmail0: "maija@example.invalid",
        tenantName1: "Matti Meikäläinen",
        tenantEmail1: "ei-osoite",
        startDate: "2026-11-01",
        rentAmount: "850",
        rentDueDay: "40",
        depositAmount: "1700",
      }),
    );

    expect(state.errors).toEqual({
      tenantEmail1: "Tarkista sähköpostiosoite",
      rentDueDay: "Eräpäivä on 1–31",
    });
    expect(createTenancy).not.toHaveBeenCalled();
  });

  it("ei palauta kirjoitettuja arvoja takaisin", async () => {
    const state = await createTenancyAction(
      { errors: {} },
      form({ propertyId: PROPERTY_ID, tenantName0: "Maija Meikäläinen" }),
    );
    expect(JSON.stringify(state)).not.toContain("Maija");
  });
});

describe("asunnon luonti virheellä", () => {
  it("kertoo jokaisen puuttuvan kentän eikä ohjaa pois sivulta", async () => {
    const state = await createPropertyAction(
      { errors: {} },
      form({ street: "", postalCode: "", city: "", propertyType: "kerrostalo" }),
    );

    expect(Object.keys(state.errors).sort()).toEqual(["city", "postalCode", "street"]);
    expect(state.errors.street).toBe("Katuosoite puuttuu");
    expect(createProperty).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("merkitsee vain väärin kirjoitetun valinnaisen kentän", async () => {
    const state = await createPropertyAction(
      { errors: {} },
      form({
        street: "Testikatu 1",
        postalCode: "00100",
        city: "Helsinki",
        propertyType: "kerrostalo",
        rooms: "2,5",
      }),
    );
    expect(state.errors).toEqual({ rooms: "Huoneluku on kokonaisluku" });
    expect(createProperty).not.toHaveBeenCalled();
  });
});
