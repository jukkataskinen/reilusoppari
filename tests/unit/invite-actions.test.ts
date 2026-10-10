import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kutsun korjauksen, uudelleenlähetyksen ja poiston palvelintoiminnot
 * (Jukan havainto 10.10.2026).
 *
 * Datakerros on korvattu: sen omat säännöt testataan
 * `invite-management.test.ts`:ssä ja kantaa vasten `db-tenancies.test.ts`:ssä.
 * Tässä varmistetaan, että toiminto tarkistaa syötteen ennen kantaa, lähettää
 * kutsun oikeaan osoitteeseen vasta onnistuneen tallennuksen jälkeen,
 * noudattaa rajaa ja vaatii vahvistuksen ennen poistoa.
 */

process.env.NEXT_PUBLIC_APP_URL = "https://app.example";

const changeInviteEmail = vi.fn();
const resendInvite = vi.fn();
const removeInvite = vi.fn();
const deleteTenancy = vi.fn();
const sendInviteEmail = vi.fn(async () => true);
const checkRateLimit = vi.fn(async () => ({ allowed: true, count: 1 }));
const redirect = vi.fn((url: string) => {
  throw new Error(`redirect ${url}`);
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "vuokranantaja-1", email: "v@example.invalid" })),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/tenancies", () => ({
  createTenancy: vi.fn(),
  changeInviteEmail,
  resendInvite,
  removeInvite,
  deleteTenancy,
  getTenancyProperty: vi.fn(async () => ({
    street: "Testikatu 1",
    postalCode: "00100",
    city: "Helsinki",
  })),
}));
vi.mock("@/lib/notifications/invite-email", () => ({ sendInviteEmail }));
vi.mock("@/lib/security/rate-limit", () => ({ checkRateLimit }));

const {
  changeInviteEmailAction,
  deleteTenancyAction,
  removeInviteAction,
  resendInviteAction,
} = await import("@/app/vuokrasuhteet/actions");

const TOKEN = "a".repeat(64);

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const IDS = { tenancyId: "vuokrasuhde-1", partyId: "osapuoli-1" };

beforeEach(() => {
  vi.clearAllMocks();
  sendInviteEmail.mockResolvedValue(true);
  checkRateLimit.mockResolvedValue({ allowed: true, count: 1 });
});

describe("sähköpostin korjaus", () => {
  it("virheellinen osoite ei koske kantaan eikä lähetä mitään", async () => {
    const state = await changeInviteEmailAction({}, form({ ...IDS, email: "ei-osoite" }));
    expect(state.errors?.email).toBeTruthy();
    expect(changeInviteEmail).not.toHaveBeenCalled();
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });

  it("lähettää kutsun uuteen osoitteeseen ja kertoo sen", async () => {
    changeInviteEmail.mockResolvedValue({
      ok: true,
      invite: { email: "oikea@example.invalid", name: "Maija", token: TOKEN },
    });

    const state = await changeInviteEmailAction(
      {},
      form({ ...IDS, email: "Oikea@Example.invalid" }),
    );

    expect(changeInviteEmail).toHaveBeenCalledWith(
      "vuokranantaja-1",
      IDS.tenancyId,
      IDS.partyId,
      "oikea@example.invalid",
    );
    expect(sendInviteEmail).toHaveBeenCalledWith({
      to: "oikea@example.invalid",
      url: `https://app.example/kutsu/${TOKEN}`,
      address: "Testikatu 1, 00100 Helsinki",
    });
    expect(state.issued).toEqual({
      email: "oikea@example.invalid",
      url: `https://app.example/kutsu/${TOKEN}`,
      emailSent: true,
    });
  });

  it("toisen vuokrasuhteeseen ei lähetetä mitään", async () => {
    // Datakerros vastaa `not_found`, kun kutsuja ei ole vuokranantaja.
    changeInviteEmail.mockResolvedValue({ ok: false, reason: "not_found" });
    const state = await changeInviteEmailAction({}, form({ ...IDS, email: "x@example.invalid" }));
    expect(state.message).toMatch(/ei löytynyt/);
    expect(state.issued).toBeUndefined();
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });

  it("liittyneen osoitetta ei vaihdeta", async () => {
    changeInviteEmail.mockResolvedValue({ ok: false, reason: "joined" });
    const state = await changeInviteEmailAction({}, form({ ...IDS, email: "x@example.invalid" }));
    expect(state.message).toMatch(/jo liittynyt/);
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });

  it("toisen vuokralaisen osoite näkyy kentän virheenä", async () => {
    changeInviteEmail.mockResolvedValue({ ok: false, reason: "duplicate" });
    const state = await changeInviteEmailAction({}, form({ ...IDS, email: "x@example.invalid" }));
    expect(state.errors?.email).toMatch(/Toisella vuokralaisella/);
  });

  it("rajan ylittyessä vanhaa linkkiä ei mitätöidä", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, count: 11 });
    const state = await changeInviteEmailAction({}, form({ ...IDS, email: "x@example.invalid" }));
    expect(state.message).toMatch(/paljon lyhyessä ajassa/);
    expect(changeInviteEmail).not.toHaveBeenCalled();
  });
});

describe("kutsun uudelleenlähetys", () => {
  it("lähettää samaan osoitteeseen", async () => {
    resendInvite.mockResolvedValue({
      ok: true,
      invite: { email: "maija@example.invalid", name: "Maija", token: TOKEN },
    });
    const state = await resendInviteAction({}, form(IDS));
    expect(sendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "maija@example.invalid" }),
    );
    expect(state.issued?.emailSent).toBe(true);
  });

  it("kertoo, jos sähköposti ei lähtenyt, ja näyttää linkin", async () => {
    resendInvite.mockResolvedValue({
      ok: true,
      invite: { email: "maija@example.invalid", name: "Maija", token: TOKEN },
    });
    sendInviteEmail.mockResolvedValue(false);
    const state = await resendInviteAction({}, form(IDS));
    expect(state.issued?.emailSent).toBe(false);
    expect(state.issued?.url).toContain(TOKEN);
  });

  it("raja estää uuden linkin luonnin", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, count: 11 });
    const state = await resendInviteAction({}, form(IDS));
    expect(state.message).toBeTruthy();
    expect(resendInvite).not.toHaveBeenCalled();
  });
});

describe("kutsun poisto", () => {
  it("ei poista ilman vahvistusta", async () => {
    const state = await removeInviteAction({}, form(IDS));
    expect(state.message).toMatch(/Vahvista/);
    expect(removeInvite).not.toHaveBeenCalled();
  });

  it("poistaa vahvistuksen jälkeen", async () => {
    removeInvite.mockResolvedValue({ ok: true });
    const state = await removeInviteAction({}, form({ ...IDS, confirm: "yes" }));
    expect(removeInvite).toHaveBeenCalledWith("vuokranantaja-1", IDS.tenancyId, IDS.partyId);
    expect(state.removed).toBe(true);
  });

  it("liittynyttä ei poisteta", async () => {
    removeInvite.mockResolvedValue({ ok: false, reason: "joined" });
    const state = await removeInviteAction({}, form({ ...IDS, confirm: "yes" }));
    expect(state.removed).toBeUndefined();
    expect(state.message).toMatch(/jo liittynyt/);
  });
});

describe("vuokrasuhteen poisto", () => {
  it("ei poista ilman vahvistusta", async () => {
    const state = await deleteTenancyAction({}, form({ tenancyId: IDS.tenancyId }));
    expect(state.message).toMatch(/Vahvista/);
    expect(deleteTenancy).not.toHaveBeenCalled();
  });

  it("allekirjoitettua ei poisteta, ja syy kerrotaan", async () => {
    deleteTenancy.mockResolvedValue({ ok: false, reason: "signing" });
    const state = await deleteTenancyAction(
      {},
      form({ tenancyId: IDS.tenancyId, confirm: "yes" }),
    );
    expect(state.message).toMatch(/allekirjoitettu/);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("onnistunut poisto vie vuokrasuhteiden listaan", async () => {
    deleteTenancy.mockResolvedValue({ ok: true });
    await expect(
      deleteTenancyAction({}, form({ tenancyId: IDS.tenancyId, confirm: "yes" })),
    ).rejects.toThrow("redirect /vuokrasuhteet?poistettu=1");
  });
});
