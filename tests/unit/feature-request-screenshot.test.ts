import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kehitystoiveen valinnainen kuvakaappaus (PLAN.md "Kehitysehdotukset",
 * docs/kehitysehdotukset.md kohta 1, migraatio 0021).
 *
 * Kuva rakennetaan tavu kerrallaan samaan tapaan kuin
 * `tests/unit/strip-metadata.test.ts`, jotta testin väite on luettavissa
 * koodista eikä piilossa binääritiedostossa.
 *
 * Tärkein väite: kuvan käsittelyn epäonnistuminen (liian suuri, tuntematon
 * muoto, kutsuraja, Storage-virhe) ei saa koskaan estää TOIVEEN syntymistä —
 * kuvakaappaus on spekissä valinnainen. Vain selvästi virheellinen kuva
 * pysäyttää lähetyksen kokonaan, jotta käyttäjä saa tilaisuuden korjata sen
 * (tekstikentät säilyvät lomakkeella, ks. `components/Form.tsx`).
 */

const createFeatureRequest = vi.fn(async () => "toive-1");
const attachFeatureRequestScreenshot = vi.fn(async () => true);
const checkRateLimit = vi.fn<
  (userId: string, endpoint: string, limit?: number, windowMinutes?: number) => Promise<{ allowed: boolean; count: number }>
>(async () => ({ allowed: true, count: 1 }));
const upload = vi.fn<
  (path: string, bytes: Uint8Array, options: { contentType: string; upsert: boolean }) => Promise<{ error: { message: string } | null }>
>(async () => ({ error: null }));
const remove = vi.fn<(paths: string[]) => Promise<{ error: null }>>(async () => ({ error: null }));
const redirect = vi.fn((url: string) => {
  throw new Error(`redirect ${url}`);
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "kayttaja-1", email: "testi@example.invalid" })),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/feature-requests", () => ({
  createFeatureRequest,
  attachFeatureRequestScreenshot,
}));
vi.mock("@/lib/db/supabase", () => ({
  getServiceClient: () => ({ storage: { from: () => ({ upload, remove }) } }),
}));
vi.mock("@/lib/security/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/security/rate-limit")>(
    "@/lib/security/rate-limit",
  );
  return { ...actual, checkRateLimit };
});
// GitHub-issue-asiakas ei liity toiveen luontiin, mutta moduuli importataan
// `actions.ts`:ssä muiden toimintojen takia — mockataan jottei se vaadi tokenia.
vi.mock("@/lib/dev-suggestions/github-issues", () => ({
  getGithubIssuesClient: () => ({ createIssue: vi.fn(), reopenWithComment: vi.fn() }),
  buildIssueBody: vi.fn(),
}));

const { createFeatureRequestAction } = await import("@/app/kehitystoiveet/actions");

/** Pienin kelvollinen JPEG: SOI ja SOS, ei metalohkoja. */
function validJpegBytes(): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x03, 0x01, 0xff, 0x00, 0x12, 0x34, 0xff, 0xd9]);
}

/** `Uint8Array` ei ole suoraan `BlobPart` TS:n DOM-tyypeissä; tiedosto rakennetaan tavuista tässä. */
function fileFromBytes(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}

function baseFields(): Record<string, string> {
  return {
    feature: "muu",
    pagePath: "",
    title: "Testiotsikko",
    description: "Testikuvaus, joka on tarpeeksi pitkä.",
    importance: "nice",
  };
}

function form(values: Record<string, string>, file?: File): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  if (file) data.set("screenshot", file);
  return data;
}

async function expectRedirectTo(promise: Promise<unknown>, url: string) {
  await expect(promise).rejects.toThrow(`redirect ${url}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  createFeatureRequest.mockResolvedValue("toive-1");
  attachFeatureRequestScreenshot.mockResolvedValue(true);
  checkRateLimit.mockResolvedValue({ allowed: true, count: 1 });
  upload.mockResolvedValue({ error: null });
  remove.mockResolvedValue({ error: null });
});

describe("kehitystoiveen kuvakaappaus", () => {
  it("liian suuri kuva hylätään kentän virheenä eikä toivetta tallenneta", async () => {
    const big = fileFromBytes(new Uint8Array(5 * 1024 * 1024), "kuva.jpg", "image/jpeg");
    const state = await createFeatureRequestAction({ errors: {} }, form(baseFields(), big));

    expect(state.errors.screenshot).toBe("Kuvakaappaus on liian suuri. Enintään 4 Mt.");
    expect(createFeatureRequest).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("tuntematon tiedostomuoto hylätään kentän virheenä eikä toivetta tallenneta", async () => {
    const bad = fileFromBytes(new Uint8Array([1, 2, 3, 4]), "kuva.gif", "image/gif");
    const state = await createFeatureRequestAction({ errors: {} }, form(baseFields(), bad));

    expect(state.errors.screenshot).toBe("Vain PNG- ja JPEG-kuvakaappaukset kelpaavat.");
    expect(createFeatureRequest).not.toHaveBeenCalled();
  });

  it("kuvien kutsuraja pysäyttää lähetyksen ennen toiveen tallennusta", async () => {
    checkRateLimit.mockImplementation(async (_userId: string, endpoint: string) => ({
      allowed: endpoint !== "kuva",
      count: 999,
    }));
    const jpeg = fileFromBytes(validJpegBytes(), "kuva.jpg", "image/jpeg");
    const state = await createFeatureRequestAction({ errors: {} }, form(baseFields(), jpeg));

    expect(state.message).toMatch(/Kuvia on lähetetty paljon/);
    expect(createFeatureRequest).not.toHaveBeenCalled();
  });

  it("kelvollinen kuva liitetään toiveeseen vasta onnistuneen tallennuksen jälkeen", async () => {
    const jpeg = fileFromBytes(validJpegBytes(), "kuva.jpg", "image/jpeg");

    await expectRedirectTo(
      createFeatureRequestAction({ errors: {} }, form(baseFields(), jpeg)),
      "/kehitystoiveet/toive-1?kiitos=1",
    );

    expect(createFeatureRequest).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledOnce();
    const [path, bytes, options] = upload.mock.calls[0];
    expect(path).toBe("kehitystoiveet/kayttaja-1/toive-1.jpg");
    expect(options.contentType).toBe("image/jpeg");
    expect(bytes.byteLength).toBeGreaterThan(0);

    expect(attachFeatureRequestScreenshot).toHaveBeenCalledWith(
      "toive-1",
      expect.objectContaining({
        storagePath: "kehitystoiveet/kayttaja-1/toive-1.jpg",
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        bytes: expect.any(Number),
      }),
    );
  });

  it("toive syntyy, vaikka kuvan Storage-tallennus epäonnistuisi", async () => {
    upload.mockResolvedValue({ error: { message: "verkkovirhe" } });
    const jpeg = fileFromBytes(validJpegBytes(), "kuva.jpg", "image/jpeg");

    await expectRedirectTo(
      createFeatureRequestAction({ errors: {} }, form(baseFields(), jpeg)),
      "/kehitystoiveet/toive-1?kiitos=1",
    );

    expect(createFeatureRequest).toHaveBeenCalledOnce();
    expect(attachFeatureRequestScreenshot).not.toHaveBeenCalled();
  });

  it("toive syntyy, vaikka rivin päivitys epäonnistuisi, ja tiedosto siivotaan", async () => {
    attachFeatureRequestScreenshot.mockResolvedValue(false);
    const jpeg = fileFromBytes(validJpegBytes(), "kuva.jpg", "image/jpeg");

    await expectRedirectTo(
      createFeatureRequestAction({ errors: {} }, form(baseFields(), jpeg)),
      "/kehitystoiveet/toive-1?kiitos=1",
    );

    expect(remove).toHaveBeenCalledWith(["kehitystoiveet/kayttaja-1/toive-1.jpg"]);
  });

  it("ilman kuvaa Storagea ei kosketeta", async () => {
    await expectRedirectTo(
      createFeatureRequestAction({ errors: {} }, form(baseFields())),
      "/kehitystoiveet/toive-1?kiitos=1",
    );

    expect(upload).not.toHaveBeenCalled();
    expect(attachFeatureRequestScreenshot).not.toHaveBeenCalled();
    expect(createFeatureRequest).toHaveBeenCalledOnce();
  });

  it("tyhjä tiedostokenttä (ei valintaa) käsitellään kuin puuttuva kuva", async () => {
    const empty = fileFromBytes(new Uint8Array(0), "", "");
    await expectRedirectTo(
      createFeatureRequestAction({ errors: {} }, form(baseFields(), empty)),
      "/kehitystoiveet/toive-1?kiitos=1",
    );

    expect(upload).not.toHaveBeenCalled();
  });
});
