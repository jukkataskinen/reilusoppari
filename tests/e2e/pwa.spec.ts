import { expect, test } from "@playwright/test";

/**
 * PWA:n asennettavuus.
 *
 * Selain asentaa sovelluksen vain, jos manifest, kuvakkeet ja service worker
 * ovat kaikki paikallaan. Yksikin 404 riittää siihen, että "Lisää
 * aloitusnäyttöön" ei ilmesty — eikä mikään kerro miksi. Nämä testit ovat
 * sitä varten.
 */

test("manifest on kelvollinen ja kuvakkeet löytyvät", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);

  const manifest = await response.json();
  expect(manifest.name).toBe("Reilusoppari");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");

  // Android tarvitsee maskable-kuvakkeen, muuten se piirtää valkoisen
  // taustan merkin ympärille.
  const purposes = manifest.icons.map((icon: { purpose: string }) => icon.purpose);
  expect(purposes).toContain("maskable");

  for (const icon of manifest.icons as Array<{ src: string }>) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.status(), icon.src).toBe(200);
  }
});

test("iOS-kuvake on tarjolla", async ({ request }) => {
  // iOS ei lue manifestin kuvakkeita kotivalikkoon vaan apple-touch-iconin.
  const response = await request.get("/apple-touch-icon.png");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
});

test("service worker tarjoillaan eikä se vaadi istuntoa", async ({ request }) => {
  const response = await request.get("/sw.js", { maxRedirects: 0 });
  // Jos middleware suojaisi tämän, rekisteröinti epäonnistuisi hiljaa.
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("javascript");

  const source = await response.text();
  // Tärkein sääntö: HTML:ää ei välimuistiteta. Navigaatiovastaus haetaan
  // verkosta eikä sitä talleteta.
  expect(source).toContain('request.mode === "navigate"');
  expect(source).toContain("/auth/");
});

test("offline-sivu on olemassa ja julkinen", async ({ page }) => {
  // Service worker tarvitsee tämän välimuistiin jo asennusvaiheessa, eli
  // ennen kirjautumista.
  const response = await page.goto("/offline");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Ei verkkoyhteyttä" })).toBeVisible();
});

test("service worker rekisteröityy ja näyttää offline-sivun yhteydettä", async ({
  page,
  context,
}) => {
  await page.goto("/");

  /**
   * HUOM `expect.poll` eikä `page.waitForFunction`.
   *
   * `waitForFunction` ei odota predikaatin palauttamaa Promisea vaan tutkii
   * paluuarvon totuusarvon selaimessa. Async-funktio palauttaa aina Promisen,
   * joka on aina tosi — odotus päättyisi heti, ja testi menisi läpi
   * tarkistamatta mitään. `expect.poll` odottaa asynkronisen funktion
   * tuloksen.
   */
  const readCache = async () =>
    page.evaluate(async () => {
      const keys = await caches.keys();
      if (keys.length === 0) return [] as string[];
      const cache = await caches.open(keys[0]);
      return (await cache.keys()).map((request) => new URL(request.url).pathname).sort();
    });

  // Esivälimuistiin kuuluu vain se, mikä on kaikille sama.
  await expect.poll(readCache, { timeout: 20_000 }).toContain("/offline");

  const cached = await readCache();
  expect(cached).toContain("/icon-512.png");
  expect(cached).toContain("/fonts/sans-variable.woff2");
  // Etusivua EI ole välimuistissa: se sisältäisi käyttäjän tiedot.
  expect(cached).not.toContain("/");
  expect(cached).not.toContain("/asunnot");

  await context.setOffline(true);
  await page.goto("/asunnot");
  // Yhteydettä näytetään offline-sivu eikä vanhaa sisältöä.
  await expect(page.getByRole("heading", { name: "Ei verkkoyhteyttä" })).toBeVisible();
  await context.setOffline(false);
});
