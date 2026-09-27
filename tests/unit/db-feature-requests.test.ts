import { afterAll, describe, expect, it } from "vitest";
import { getServiceClient, hasSupabaseCredentials } from "@/lib/db/supabase";
import {
  createFeatureRequest,
  getFeatureRequest,
  listFeatureRequests,
  updateFeatureRequest,
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

    const bobs = await listFeatureRequests({ userId: bob, asAdmin: false }, { statuses: ["new"] });
    expect(bobs.some((r) => r.id === id)).toBe(false);

    const admin = await listFeatureRequests({ userId: bob, asAdmin: true }, { statuses: ["new"] });
    expect(admin.some((r) => r.id === id)).toBe(true);
  });

  it("käsittely tallentaa tilan ja vastauksen", async () => {
    const carol = await createUser("carol");
    const id = await createFeatureRequest(carol, {
      feature: "muu",
      pagePath: null,
      title: "Toinen",
      description: "Testi",
      importance: "important",
    });
    expect(await updateFeatureRequest(carol, id, { status: "planned", response: "Kiitos" })).toBe(true);
    const r = await getFeatureRequest({ userId: carol, asAdmin: false }, id);
    expect(r?.status).toBe("planned");
    expect(r?.response).toBe("Kiitos");
  });
});
