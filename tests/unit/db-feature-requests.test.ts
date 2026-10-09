import { afterAll, describe, expect, it } from "vitest";
import { getServiceClient, hasSupabaseCredentials } from "@/lib/db/supabase";
import {
  approveFeatureRequest,
  attachFeatureRequestScreenshot,
  confirmSuggestionWorks,
  createFeatureRequest,
  getFeatureRequest,
  getFeatureRequestByIssueNumber,
  getFeatureRequestsByIssueNumbers,
  listFeatureRequests,
  markSuggestionInProgress,
  markSuggestionTestable,
  rejectFeatureRequest,
  requestSuggestionChanges,
} from "@/lib/db/feature-requests";

/**
 * Kehitystoiveiden integraatiotestit oikeaa Supabasea vasten (migraatio 0018).
 *
 * Tärkein väite: käyttäjä ei näe toisen toivetta edes oikealla id:llä. Rajaus
 * on koodissa, koska sovellus ohittaa RLS:n service_role-avaimella.
 *
 * Ohitetaan siististi, jos tunnuksia ei ole.
 */
const RUN = hasSupabaseCredentials();
const PREFIX = `testi-toive-${Date.now()}`;
const users: string[] = [];

async function createUser(label: string): Promise<string> {
  const { data, error } = await getServiceClient()
    .from("rs_users")
    .insert({ auth0_sub: `${PREFIX}-${label}`, email: `${PREFIX}-${label}@example.invalid` })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  users.push(data.id);
  return data.id;
}

afterAll(async () => {
  if (!RUN) return;
  // Toiveet poistuvat käyttäjän mukana (on delete cascade).
  for (const id of users) await getServiceClient().from("rs_users").delete().eq("id", id);
});

describe.skipIf(!RUN)("kehitystoiveet (integraatio, live Supabase)", () => {
  it("oma toive näkyy, toisen ei", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const id = await createFeatureRequest(alice, {
      feature: "vuokranmaksu",
      pagePath: "/vuokrasuhteet",
      title: "Testitoive",
      description: "Testi",
      importance: "nice",
    });

    expect(await getFeatureRequest({ userId: alice, asAdmin: false }, id)).not.toBeNull();
    expect(await getFeatureRequest({ userId: bob, asAdmin: false }, id)).toBeNull();

    const bobs = await listFeatureRequests({ userId: bob, asAdmin: false }, { statuses: ["uusi"] });
    expect(bobs.some((r) => r.id === id)).toBe(false);

    const admin = await listFeatureRequests({ userId: bob, asAdmin: true }, { statuses: ["uusi"] });
    expect(admin.some((r) => r.id === id)).toBe(true);
  });

  it("hyväksyntä siirtää tilan ja kirjaa issue-numeron", async () => {
    const carol = await createUser("carol");
    const id = await createFeatureRequest(carol, {
      feature: "muu",
      pagePath: null,
      title: "Toinen",
      description: "Testi",
      importance: "important",
    });
    const outcome = await approveFeatureRequest(carol, id, { approvedDescription: "Siistitty kuvaus", githubIssueNumber: 42 });
    expect(outcome).toEqual({ ok: true, status: "hyvaksytty" });
    const r = await getFeatureRequest({ userId: carol, asAdmin: false }, id);
    expect(r?.status).toBe("hyvaksytty");
    expect(r?.approvedDescription).toBe("Siistitty kuvaus");
    expect(r?.githubIssueNumber).toBe(42);

    // Hyväksyttyä ei voi hyväksyä toiseen kertaan, mutta hylätä voi yhä.
    expect(await approveFeatureRequest(carol, id, { approvedDescription: null, githubIssueNumber: null })).toEqual({
      ok: false,
      reason: "invalid_transition",
    });
    expect(await rejectFeatureRequest(carol, id, "Ei sovi palveluun.")).toEqual({ ok: true, status: "hylatty" });
    const rejected = await getFeatureRequest({ userId: carol, asAdmin: false }, id);
    expect(rejected?.status).toBe("hylatty");
    expect(rejected?.response).toBe("Ei sovi palveluun.");
  });

  it("webhookin tapahtumat kulkevat koko kaaren issue-numerolla", async () => {
    const dave = await createUser("dave");
    const admin = await createUser("dave-admin");
    const id = await createFeatureRequest(dave, {
      feature: "muu",
      pagePath: null,
      title: "Kolmas",
      description: "Testi",
      importance: "nice",
    });
    await approveFeatureRequest(admin, id, { approvedDescription: null, githubIssueNumber: 777 });

    expect((await getFeatureRequestByIssueNumber(777))?.id).toBe(id);
    expect(await getFeatureRequestByIssueNumber(778)).toBeNull();
    expect((await getFeatureRequestsByIssueNumbers([777, 778])).map((r) => r.id)).toEqual([id]);
    expect(await getFeatureRequestsByIssueNumbers([])).toEqual([]);

    // PR avattu -> työn alla.
    expect(await markSuggestionInProgress(id)).toEqual({ ok: true, status: "tyon_alla" });
    // PR yhdistetty -> testattavana.
    expect(await markSuggestionTestable(id)).toEqual({ ok: true, status: "testattavana" });
    // Tarvitsee muutoksen -> takaisin työn alle.
    expect(await requestSuggestionChanges(admin, id, "Korjaa X.")).toEqual({ ok: true, status: "tyon_alla" });
    // Uusi PR yhdistetty -> testattavana, ja käsittelijä vahvistaa.
    await markSuggestionTestable(id);
    expect(await confirmSuggestionWorks(admin, id)).toEqual({ ok: true, status: "valmis" });

    const done = await getFeatureRequest({ userId: dave, asAdmin: false }, id);
    expect(done?.status).toBe("valmis");
  });

  it("kuvakaappaus liittyy toiveeseen ja näkyy haussa (migraatio 0021)", async () => {
    const erkki = await createUser("erkki");
    const id = await createFeatureRequest(erkki, {
      feature: "muu",
      pagePath: null,
      title: "Neljäs",
      description: "Testi",
      importance: "nice",
    });

    const before = await getFeatureRequest({ userId: erkki, asAdmin: false }, id);
    expect(before?.screenshotStoragePath).toBeNull();

    const ok = await attachFeatureRequestScreenshot(id, {
      storagePath: `${PREFIX}/${id}.jpg`,
      sha256: "a".repeat(64),
      bytes: 1234,
      width: 390,
      height: 844,
    });
    expect(ok).toBe(true);

    const after = await getFeatureRequest({ userId: erkki, asAdmin: false }, id);
    expect(after?.screenshotStoragePath).toBe(`${PREFIX}/${id}.jpg`);
  });
});
