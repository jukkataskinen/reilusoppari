import { afterAll, describe, expect, it } from "vitest";
import { getServiceClient, hasSupabaseCredentials } from "@/lib/db/supabase";
import { upsertSubscription } from "@/lib/db/billing";
import { BillingMockClient, getBillingClient, resetBillingClientForTests } from "@/lib/billing";
import { ensurePlusAccess, quotePlus } from "@/lib/billing/plus";
import { PLUS_YEARLY_CENTS } from "@/lib/billing/pricing";
import { PAYMENT_PROCESSING_MESSAGE } from "@/lib/billing/return-state";

/**
 * Plus-maksun laukaisu (CLAUDE.md 5.7, vaihe 5) integraatiotestinä oikeaa
 * Supabasea vasten. Ohitetaan siististi, jos tunnuksia ei ole (BLOCKERS.md:
 * yötyössä ei ole testikantaa).
 *
 * Mock-laskutusclient on tässä tahallaan: `STRIPE_SECRET_KEY` puuttuu
 * kehityksessä ja CI:ssä, ja juuri se tila on tärkein testata — se on tila,
 * jossa jokainen yö ajaa tämän testin.
 */
const RUN = hasSupabaseCredentials();
const PREFIX = `testi-plus-${Date.now()}`;

const created = { users: [] as string[], properties: [] as string[] };

async function createUser(label: string): Promise<string> {
  const { data, error } = await getServiceClient()
    .from("rs_users")
    .insert({ auth0_sub: `${PREFIX}-${label}`, email: `${PREFIX}-${label}@example.invalid` })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  created.users.push(data.id);
  return data.id;
}

async function createProperty(ownerId: string): Promise<string> {
  const { data, error } = await getServiceClient()
    .from("rs_properties")
    .insert({
      owner_user_id: ownerId,
      street: "Testikatu 1",
      postal_code: "00100",
      city: "Helsinki",
      property_type: "kerrostalo",
      rooms: 2,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  created.properties.push(data.id);
  return data.id;
}

afterAll(async () => {
  if (!RUN) return;
  const supabase = getServiceClient();
  // `rs_subscriptions` poistuu käyttäjän mukana (cascade).
  for (const id of created.properties) await supabase.from("rs_properties").delete().eq("id", id);
  for (const id of created.users) await supabase.from("rs_users").delete().eq("id", id);
});

describe.skipIf(!RUN)("Plus-maksu asunnolle (integraatio, live Supabase)", () => {
  it("ensimmäinen sinetöinti ohjaa maksamaan, toinen ei enää", async () => {
    resetBillingClientForTests();

    const owner = await createUser("omistaja");
    const property = await createProperty(owner);

    const ensimmainen = await quotePlus(owner, property);
    expect(ensimmainen?.paidVia).toBe("plus_yearly");
    expect(ensimmainen?.amountCents).toBe(PLUS_YEARLY_CENTS);

    const access = await ensurePlusAccess({
      userId: owner,
      propertyId: property,
      appUrl: "https://app.example.invalid",
    });
    expect(access.ok).toBe(false);
    if (!access.ok && "redirectUrl" in access) {
      expect(access.redirectUrl).toContain("/maksu/mock");
    } else {
      throw new Error("Odotettiin maksusivun osoitetta.");
    }

    // Mock-client näki checkout-pyynnön oikealla tuotteella ja asunnon id:llä.
    const mock = getBillingClient() as BillingMockClient;
    const checkout = mock.checkouts.at(-1);
    expect(checkout?.input.product).toBe("plus_yearly");
    expect(checkout?.input.amountCents).toBe(PLUS_YEARLY_CENTS);
    expect(checkout?.input.metadata.propertyId).toBe(property);
    // Tilaus on peruutettavissa asiakasportaalista, ei kertaluonteinen
    // palvelu — samasta syystä kuin salkkutilauksessa ei kysytä suostumusta.
    expect(checkout?.input.consentGiven).toBe(false);

    // Webhook kirjaisi tähän kohtaan Stripen tilauksen. Simuloidaan se
    // suoraan, jottei testi riipu oikeasta Stripestä.
    await upsertSubscription({
      userId: owner,
      kind: "plus_yearly",
      stripeSubscriptionId: `sub_${PREFIX}`,
      quantity: 1,
      status: "active",
      currentPeriodEnd: null,
      propertyId: property,
    });

    const toinen = await quotePlus(owner, property);
    expect(toinen?.amountCents).toBe(0);
    expect(toinen?.reason).toContain("kattaa");

    const accessKakkonen = await ensurePlusAccess({
      userId: owner,
      propertyId: property,
      appUrl: "https://app.example.invalid",
    });
    expect(accessKakkonen).toEqual({ ok: true, paidVia: "plus_yearly" });
  });

  it("ulkopuoliselle sama kuin olematon asunto (IDOR)", async () => {
    const owner = await createUser("omistaja2");
    const outsider = await createUser("ulkopuolinen");
    const property = await createProperty(owner);

    expect(await quotePlus(outsider, property)).toBeNull();

    const access = await ensurePlusAccess({
      userId: outsider,
      propertyId: property,
      appUrl: "https://app.example.invalid",
    });
    expect(access).toEqual({ ok: false, message: "Asuntoa ei löytynyt." });
  });

  it("juuri maksettu mutta kirjaamaton maksu ei avaa uutta maksusivua", async () => {
    // Jukka 10.10.2026: webhookia odottaessa painettu Sinetöi veloittaisi toisen kerran.
    resetBillingClientForTests();
    const owner = await createUser("odottaa");
    const property = await createProperty(owner);

    const mock = getBillingClient() as BillingMockClient;
    mock.completedCheckouts.push({
      id: "cs_juuri",
      subscriptionId: "sub_juuri",
      metadata: { propertyId: property, userId: owner, kind: "plus_yearly" },
      createdAt: new Date(),
    });

    const access = await ensurePlusAccess({ userId: owner, propertyId: property, appUrl: "https://app.example.invalid" });
    expect(access).toEqual({ ok: false, message: PAYMENT_PROCESSING_MESSAGE });
    expect(mock.checkouts).toHaveLength(0);
  });

  it("Stripessä voimassa oleva tilaus kirjataan ja sinetöinti jatkuu", async () => {
    // Korjaa tilauksen, jonka webhook jäi aikanaan kirjaamatta.
    resetBillingClientForTests();
    const owner = await createUser("korjaus");
    const property = await createProperty(owner);

    const mock = getBillingClient() as BillingMockClient;
    mock.activeSubscriptions.push({
      id: `sub_${PREFIX}_korjaus`,
      metadata: { propertyId: property, userId: owner, kind: "plus_yearly" },
      currentPeriodEnd: null,
    });

    const access = await ensurePlusAccess({ userId: owner, propertyId: property, appUrl: "https://app.example.invalid" });
    expect(access).toEqual({ ok: true, paidVia: "plus_yearly" });
    expect((await quotePlus(owner, property))?.amountCents).toBe(0);
    expect(mock.checkouts).toHaveLength(0);
  });
});
