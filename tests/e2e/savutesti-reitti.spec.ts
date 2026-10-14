import { expect, test } from "@playwright/test";

/**
 * Tuotannon savutestin reitti (`/api/savutesti`) tuotantokäännöstä vasten.
 *
 * MIKSI: asiakirjojen fontit luetaan levyltä ajon aikana, ja ne puuttuvat
 * funktiopaketista vain tuotantokäännöksessä. Tämä ajaa samat asiakirja-
 * askeleet kuin tuotannon aamuinen savutesti, `next build && next start`
 * -palvelimessa. Kanta-, eSinetti- ja Stripe-askeleet epäonnistuvat CI:ssä
 * ilman avaimia, joten niitä ei vaadita tässä; ne tarkistetaan tuotannossa.
 *
 * Salaisuus on CI:n testiarvo (playwright.config.ts), ei oikea.
 */
const SALAISUUS = process.env.SAVUTESTI_SECRET ?? "";

test.describe("savutestin reitti", () => {
  test.beforeEach(({}, testInfo) => {
    // Rajapinta ei riipu näytön koosta: yksi ajo riittää.
    test.skip(testInfo.project.name !== "tyopoyta", "Ajetaan vain kerran.");
  });

  test("on kiinni ilman salaisuutta", async ({ request }) => {
    const ilman = await request.get("/api/savutesti");
    expect(ilman.status()).toBe(401);
    const vaara = await request.get("/api/savutesti", { headers: { Authorization: "Bearer vaara" } });
    expect(vaara.status()).toBe(401);
  });

  test("asiakirjat renderöityvät tuotantokäännöksessä", async ({ request }) => {
    test.setTimeout(150_000);
    const response = await request.get("/api/savutesti", {
      headers: { Authorization: `Bearer ${SALAISUUS}` },
      timeout: 120_000,
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");

    const body = (await response.json()) as { ok: boolean; vaiheet: Record<string, unknown>[] };
    expect(Object.keys(body).sort()).toEqual(["ok", "vaiheet"]);
    // Vastauksessa ei ole muuta kuin nimi, tila, kesto ja koodi.
    for (const vaihe of body.vaiheet) {
      for (const avain of Object.keys(vaihe)) expect(["nimi", "ok", "ms", "koodi"]).toContain(avain);
    }

    const asiakirjat = body.vaiheet.filter((v) => String(v.nimi).startsWith("asiakirja_"));
    expect(asiakirjat).toHaveLength(4);
    for (const vaihe of asiakirjat) expect(vaihe, String(vaihe.nimi)).toMatchObject({ ok: true });
  });
});
