import { describe, expect, it } from "vitest";
import {
  acceptInviteBlocker,
  inviteEmailSchema,
  isOwnEmail,
  isSelfJoined,
  OWN_EMAIL_MESSAGE,
  pendingPartyBlocker,
  tenancyDeletionBlocker,
  TENANCY_DELETION_MESSAGES,
  type PendingPartyFacts,
  type TenancyDeletionFacts,
} from "@/lib/tenancy/invite-management";
import type { TenancyStatus } from "@/lib/db/tenancies";
import { inviteEmailContent } from "@/lib/notifications/invite-email";

/**
 * Kutsun korjauksen ja vuokrasuhteen poiston säännöt (Jukan havainto
 * 10.10.2026). Datakerros kysyy päätöksen näiltä funktioilta, joten
 * omistajuus, liittyneen suojaus ja poiston esteet testataan tässä
 * kokonaan ilman kantaa.
 */

const LANDLORD = "vuokranantaja";

function facts(overrides: Partial<PendingPartyFacts> = {}): PendingPartyFacts {
  return {
    userId: LANDLORD,
    tenancy: { landlordUserId: LANDLORD, status: "draft" },
    party: { role: "tenant", userId: null, joinedAt: null },
    ...overrides,
  };
}

describe("kutsun hallinta: kuka saa", () => {
  it("vuokranantaja saa lähettää, korjata ja poistaa liittymättömän kutsun", () => {
    expect(pendingPartyBlocker(facts(), "resend")).toBeNull();
    expect(pendingPartyBlocker(facts(), "change_email")).toBeNull();
    expect(pendingPartyBlocker(facts(), "remove")).toBeNull();
  });

  it("toinen käyttäjä ei saa, eikä hänelle kerrota kutsun olemassaolosta", () => {
    const outsider = facts({ userId: "ulkopuolinen" });
    for (const action of ["resend", "change_email", "remove"] as const) {
      expect(pendingPartyBlocker(outsider, action)).toBe("not_found");
    }
  });

  it("vuokralainen ei saa hallita toisen vuokralaisen kutsua", () => {
    // Vuokralainen on osapuoli (näkee vuokrasuhteen), mutta ei vuokranantaja.
    const tenant = facts({ userId: "vuokralainen-1" });
    expect(pendingPartyBlocker(tenant, "change_email")).toBe("not_found");
  });

  it("olematon vuokrasuhde tai osapuoli", () => {
    expect(pendingPartyBlocker(facts({ tenancy: null }), "resend")).toBe("not_found");
    expect(pendingPartyBlocker(facts({ party: null }), "resend")).toBe("not_found");
  });

  it("vuokranantajan omaa riviä ei käsitellä kutsuna", () => {
    const own = facts({ party: { role: "landlord", userId: LANDLORD, joinedAt: "2026-10-01" } });
    expect(pendingPartyBlocker(own, "remove")).toBe("not_found");
  });

  it("liittynyttä vuokralaista ei voi korjata, kutsua uudelleen eikä poistaa", () => {
    const joined = facts({
      party: { role: "tenant", userId: "vuokralainen-1", joinedAt: "2026-10-02T10:00:00Z" },
    });
    for (const action of ["resend", "change_email", "remove"] as const) {
      expect(pendingPartyBlocker(joined, action)).toBe("joined");
    }
  });

  it("allekirjoituksen alettua osoitetta ei voi korjata eikä kutsua poistaa", () => {
    const signing = facts({ tenancy: { landlordUserId: LANDLORD, status: "signing" } });
    expect(pendingPartyBlocker(signing, "change_email")).toBe("status");
    expect(pendingPartyBlocker(signing, "remove")).toBe("status");
    // Mutta samaan osoitteeseen saa lähettää uudelleen.
    expect(pendingPartyBlocker(signing, "resend")).toBeNull();
  });

  it("katselmusvaiheessa korjaus on vielä mahdollinen", () => {
    const inspection = facts({ tenancy: { landlordUserId: LANDLORD, status: "inspection" } });
    expect(pendingPartyBlocker(inspection, "change_email")).toBeNull();
  });
});

describe("vuokranantaja itse vuokralaisen paikalla (Jukan havainto 10.10.2026)", () => {
  const selfJoined = (status: TenancyStatus) =>
    facts({
      tenancy: { landlordUserId: LANDLORD, status },
      party: { role: "tenant", userId: LANDLORD, joinedAt: "2026-10-10T08:00:00Z" },
    });

  it("tunnistetaan vain, kun vuokralaisen paikalla on vuokranantajan tili", () => {
    expect(isSelfJoined(LANDLORD, LANDLORD)).toBe(true);
    expect(isSelfJoined(LANDLORD, "vuokralainen-1")).toBe(false);
    expect(isSelfJoined(LANDLORD, null)).toBe(false);
  });

  it("vuokranantaja saa korjata, lähettää uudelleen ja poistaa ennen allekirjoitusta", () => {
    for (const status of ["draft", "inspection"] as const) {
      for (const action of ["resend", "change_email", "remove"] as const) {
        expect(pendingPartyBlocker(selfJoined(status), action)).toBeNull();
      }
    }
  });

  it("allekirjoituksen alettua mitään ei muuteta, ei edes uudelleenlähetyksellä", () => {
    for (const action of ["resend", "change_email", "remove"] as const) {
      expect(pendingPartyBlocker(selfJoined("signing"), action)).toBe("status");
      expect(pendingPartyBlocker(selfJoined("active"), action)).toBe("status");
    }
  });

  it("oikea liittynyt vuokralainen on yhä suojattu", () => {
    const joined = facts({
      party: { role: "tenant", userId: "vuokralainen-1", joinedAt: "2026-10-02T10:00:00Z" },
    });
    expect(pendingPartyBlocker(joined, "change_email")).toBe("joined");
  });

  it("toinen käyttäjä ei saa korjata vuokranantajan virhettä", () => {
    const outsider = { ...selfJoined("draft"), userId: "ulkopuolinen" };
    expect(pendingPartyBlocker(outsider, "remove")).toBe("not_found");
  });

  it("liittyneiden laskussa vuokranantaja itse ei estä poistoa liittyneenä", () => {
    // `getTenancyDeletionFacts` jättää itse liittyneen pois; sääntö itse
    // katsoo vain lukua.
    expect(tenancyDeletionBlocker(deletion({ joinedTenants: 0 }))).toBeNull();
  });
});

describe("oma sähköposti kutsussa", () => {
  it("sama osoite eri kirjainkoolla ja välilyönneillä on oma", () => {
    expect(isOwnEmail(" Jukka@Example.FI ", "jukka@example.fi")).toBe(true);
    expect(isOwnEmail("jukka@example.fi", "JUKKA@EXAMPLE.FI")).toBe(true);
  });

  it("eri osoite ei ole oma, eikä tyhjä oma osoite täsmää mihinkään", () => {
    expect(isOwnEmail("maija@example.fi", "jukka@example.fi")).toBe(false);
    expect(isOwnEmail("", "")).toBe(false);
  });

  it("virheviesti kertoo, mitä tehdä", () => {
    expect(OWN_EMAIL_MESSAGE).toBe("Tämä on oma sähköpostiosoitteesi. Anna vuokralaisen osoite.");
  });
});

describe("kutsun lunastus", () => {
  const base = {
    userId: "vuokralainen-1",
    userEmail: "maija@example.fi",
    inviteEmail: "maija@example.fi",
    landlordUserId: LANDLORD,
  };

  it("oikea vuokralaisen tili saa lunastaa", () => {
    expect(acceptInviteBlocker(base)).toBeNull();
    expect(acceptInviteBlocker({ ...base, userEmail: " Maija@Example.FI" })).toBeNull();
  });

  it("vuokranantaja ei saa liittyä omaan vuokrasuhteeseensa, vaikka osoite täsmää", () => {
    expect(
      acceptInviteBlocker({ ...base, userId: LANDLORD, userEmail: "maija@example.fi" }),
    ).toBe("own_tenancy");
  });

  it("vuokranantajalle kerrotaan oma vuokrasuhde myös, kun osoite on eri", () => {
    expect(
      acceptInviteBlocker({ ...base, userId: LANDLORD, userEmail: "jukka@example.fi" }),
    ).toBe("own_tenancy");
  });

  it("väärä tili saa väärän tilin syyn", () => {
    expect(acceptInviteBlocker({ ...base, userEmail: "toinen@example.fi" })).toBe(
      "wrong_account",
    );
  });
});

describe("sähköpostin tarkistus", () => {
  it("hyväksyy osoitteen ja muuttaa sen pieniksi kirjaimiksi", () => {
    const parsed = inviteEmailSchema.safeParse({ email: "  Maija@Example.FI " });
    expect(parsed.success && parsed.data.email).toBe("maija@example.fi");
  });

  it("hylkää tyhjän ja virheellisen", () => {
    expect(inviteEmailSchema.safeParse({ email: "" }).success).toBe(false);
    expect(inviteEmailSchema.safeParse({ email: "ei-osoite" }).success).toBe(false);
  });
});

function deletion(overrides: Partial<TenancyDeletionFacts> = {}): TenancyDeletionFacts {
  return {
    isLandlord: true,
    status: "draft",
    joinedTenants: 0,
    signingStarted: false,
    paid: false,
    certificates: 0,
    expenses: 0,
    ...overrides,
  };
}

describe("vuokrasuhteen poisto", () => {
  it("luonnoksen voi poistaa", () => {
    expect(tenancyDeletionBlocker(deletion())).toBeNull();
    expect(tenancyDeletionBlocker(deletion({ status: "inspection" }))).toBeNull();
  });

  it("vain vuokranantaja voi poistaa", () => {
    expect(tenancyDeletionBlocker(deletion({ isLandlord: false }))).toBe("not_landlord");
  });

  it("liittynyt vuokralainen estää poiston", () => {
    expect(tenancyDeletionBlocker(deletion({ joinedTenants: 1 }))).toBe("joined");
  });

  it("allekirjoitus tai allekirjoitukseen lähettäminen estää poiston", () => {
    expect(tenancyDeletionBlocker(deletion({ signingStarted: true }))).toBe("signing");
    for (const status of ["signing", "active", "ending", "ended"] as const) {
      expect(tenancyDeletionBlocker(deletion({ status }))).toBe("signing");
    }
  });

  it("maksu tai käytetty ilmainen vuokrasuhde estää poiston", () => {
    expect(tenancyDeletionBlocker(deletion({ paid: true }))).toBe("paid");
  });

  it("todistukset estävät poiston", () => {
    expect(tenancyDeletionBlocker(deletion({ status: "certified", certificates: 2 }))).toBe(
      "certificates",
    );
  });

  it("kulut estävät poiston, koska kuitit lähtisivät mukana", () => {
    expect(tenancyDeletionBlocker(deletion({ expenses: 1 }))).toBe("expenses");
  });

  it("allekirjoitetun sopimuksen syy sanotaan suoraan ja kerrotaan vaihtoehto", () => {
    expect(TENANCY_DELETION_MESSAGES.signing).toContain("allekirjoitettu");
    expect(TENANCY_DELETION_MESSAGES.signing).toContain("Voit päättää vuokrasuhteen");
  });
});

describe("kutsuviesti", () => {
  it("kertoo osoitteen ja voimassaolon, eikä sisällä linkkiä tekstissä", () => {
    const content = inviteEmailContent({
      to: "maija@example.invalid",
      url: "https://app.example/kutsu/abc",
      address: "Testikatu 1, 00100 Helsinki",
    });
    expect(content.body).toContain("Testikatu 1");
    expect(content.body).toContain("30 päivää");
    expect(content.body).not.toContain("/kutsu/");
  });
});
