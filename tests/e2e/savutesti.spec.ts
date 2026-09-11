import { expect, test } from "@playwright/test";

/**
 * Savutesti: sovellus latautuu, turvaotsakkeet ovat paikallaan ja
 * kirjautuminen ohjaa oikeaan paikkaan.
 *
 * ===========================================================================
 * MIKSI JUURI NÄMÄ VÄITTEET
 *
 * Kirjautumistestin `connection=email` ei ole muodollisuus. Auth0 pudottaa
 * tämän parametrin hiljaa, jos tenantin Authentication Profile ei ole
 * "Identifier First" — ja silloin käyttäjälle näytetään salasanalomake,
 * vaikka sovelluksessa ei ole salasanoja. Se ei näy mistään lokista eikä
 * kaada mitään. Tämä testi on ainoa paikka, jossa asetuksen taantuminen
 * huomataan. Ks. DECISIONS.md.
 *
 * CSP-testi ajetaan tuotantokäännöstä vasten (`playwright.config.ts`), koska
 * kehityksen policy on löysempi eikä paljastaisi rikkoutumista.
 * ===========================================================================
 */

test("etusivu latautuu ilman konsolivirheitä", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);

  await expect(page.getByRole("heading", { name: "Reilusoppari" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kirjaudu" })).toBeVisible();

  // CSP-rikkomus näkyy konsolivirheenä. Jos nonce ei päädy Next.js:n
  // skripteihin, sivu renderöityy mutta ei toimi — ja se näkyy tässä.
  expect(errors).toEqual([]);
});

test("turvaotsakkeet ovat paikallaan", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response!.headers();

  const csp = headers["content-security-policy"];
  expect(csp).toBeTruthy();
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toContain("frame-ancestors 'none'");
  // Yksikin 'unsafe-inline' skripteissä tekisi policysta koristeen.
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);

  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  // Kamera sallittu (katselmuskuvat), paikannus ei (EXIF-GPS poistetaan).
  expect(headers["permissions-policy"]).toContain("camera=(self)");
  expect(headers["permissions-policy"]).toContain("geolocation=()");
});

test("sovellusta ei indeksoida", async ({ page }) => {
  await page.goto("/");
  // Sovellus ei ole julkista sisältöä; markkinointisivusto on eri osoitteessa.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

/**
 * Ohitetaan, jos Auth0-osoite on CI:n keksitty arvo.
 *
 * Auth0:n SDK hakee kirjautumisosoitteen tenantin discovery-dokumentista, eli
 * `/auth/login` tekee oikean verkkopyynnön. Keksityllä osoitteella se
 * palauttaa 500:n. Vaihtoehtoina olisivat olleet oikean tenantin osoite
 * CI:hin (jolloin jokainen ajo riippuisi Auth0:n saatavuudesta) tai testin
 * poistaminen. Kumpikaan ei ole hyvä: parametrien katoaminen on nyt katettu
 * yksikkötestillä (`tests/unit/auth0-config.test.ts`), ja tämä testi todentaa
 * koko ketjun siellä missä oikea tenantti on käytettävissä.
 */
const auth0Domain = process.env.AUTH0_DOMAIN ?? "";
const realAuth0 = auth0Domain.length > 0 && !auth0Domain.startsWith("ci-testi.");

test("kirjautuminen ohjaa Auth0:aan sähköpostiyhteydellä", async ({ page }) => {
  // Ohitus testin sisällä eikä tiedoston tasolla: tiedoston tasolla
  // `test.skip` ohittaisi kaikki tämän tiedoston testit.
  test.skip(!realAuth0, "Auth0-osoite on CI:n korvike, ei oikea tenantti");

  // Ei seurata uudelleenohjausta perille asti: Auth0 on ulkopuolinen palvelu,
  // eikä CI saa olla riippuvainen sen saatavuudesta. Riittää että osoite,
  // johon ohjataan, on oikea.
  const response = await page.request.get("/auth/login", { maxRedirects: 0 });
  expect(response.status()).toBe(307);

  const location = response.headers()["location"];
  expect(location).toContain("/authorize");
  // Nämä kaksi ovat koko passwordless-kirjautumisen ehto.
  expect(location).toContain("connection=email");
  expect(location).toContain("ui_locales=fi");
  // PKCE: julkisessa clientissä koodinvaihto ei saa nojata pelkkään salaisuuteen.
  expect(location).toContain("code_challenge_method=S256");
  // Salasanoja ei ole missään vaiheessa.
  expect(location).not.toContain("connection=Username-Password-Authentication");
});

test("asuntosivut vaativat kirjautumisen", async ({ page }) => {
  // Suojaus tehdään sivukohtaisesti eikä middlewaressa (ks. src/middleware.ts),
  // joten jokainen suojattu reitti on syytä todeta erikseen. Yksi unohdettu
  // `getCurrentUser()` näkyisi vain tässä.
  for (const path of ["/asunnot", "/asunnot/uusi", "/asunnot/00000000-0000-4000-8000-000000000000"]) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    expect(response.headers()["location"], path).toContain("/auth/login");
  }
});

test("tuntematon polku on 404 eikä paljasta mitään", async ({ page }) => {
  const response = await page.goto("/ei-ole-olemassa");
  expect(response?.status()).toBe(404);
});
