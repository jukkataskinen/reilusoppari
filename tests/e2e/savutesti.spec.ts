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

  // Tunnus on ylätunnisteessa, ei otsikkona: otsikko kertoo mitä palvelu
  // tekee, ei mikä sen nimi on.
  await expect(page.getByRole("banner").getByText("Reilusoppari")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Vuokrasuhteen yhteinen työkalu" }),
  ).toBeVisible();
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
  for (const path of [
    "/asunnot",
    "/asunnot/uusi",
    "/asunnot/00000000-0000-4000-8000-000000000000",
    "/asunnot/00000000-0000-4000-8000-000000000000/vuokrasuhde/uusi",
    "/vuokrasuhteet",
    "/vuokrasuhteet/00000000-0000-4000-8000-000000000000",
    // Kulut ja verolaskelma ovat vain asunnon omistajan.
    "/asunnot/00000000-0000-4000-8000-000000000000/kulut",
    "/asunnot/00000000-0000-4000-8000-000000000000/toistuvat-kulut",
    "/asunnot/00000000-0000-4000-8000-000000000000/verolaskelma",
    // Kuitin kuvaus: kulut ovat vuokranantajan kirjanpitoa.
    "/kuitti",
    // Todistuskeskustelu koskee kolmannen osapuolen tietoja.
    "/keskustelut/00000000-0000-4000-8000-000000000000",
    // Suositteluosoite paljastaisi käyttäjän tunnisteen.
    "/suosittele",
    "/omat-tiedot",
  ]) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    expect(response.headers()["location"], path).toContain("/auth/login");
  }
});

/*
  Kutsulinkki EI saa vaatia kirjautumista: vuokralaisella ei ole vielä tiliä,
  ja kirjautumiseen ohjaava kutsulinkki olisi hänelle umpikuja.

  Nämä ajetaan myös CI:ssä, jolla ei ole tietokanta-avaimia. Se on
  mahdollista, koska kutsun haku erottaa puuttuvan kokoonpanon
  tietokantakatkoksesta (`db/tenancies.ts`): ilman avaimia kutsuja ei ole,
  mutta katkos heitetään eikä näy käyttäjälle vanhentuneena kutsuna.
*/
test("kutsulinkki ei ohjaa kirjautumiseen", async ({ page }) => {
  const response = await page.request.get("/kutsu/" + "a".repeat(64), { maxRedirects: 0 });

  expect(response.status(), "kutsusivu ei saa olla uudelleenohjaus").toBeLessThan(300);
  expect(response.headers()["location"] ?? "").not.toContain("/auth/login");
});

test("tuntematon kutsu ei paljasta mitään", async ({ page }) => {
  // Tuntematon tunniste antaa saman vastauksen kuin vanhentunut.
  const response = await page.goto("/kutsu/" + "a".repeat(64));
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Kutsu ei ole voimassa" })).toBeVisible();
});

test("kutsusivua ei indeksoida", async ({ page }) => {
  await page.goto("/kutsu/" + "b".repeat(64));
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("tuntematon polku on 404 eikä paljasta mitään", async ({ page }) => {
  const response = await page.goto("/ei-ole-olemassa");
  expect(response?.status()).toBe(404);
});

/*
  Reitit, joissa kirjautumattoman pääsy maksaisi rahaa tai luovuttaisi
  tietoja.

  Nämä palauttavat 401 eivätkä ohjaa kirjautumiseen: ne ovat rajapintoja,
  joita kutsutaan koodista eikä selaimen osoiteriviltä. Uudelleenohjaus
  näkyisi kutsujalle onnistuneena vastauksena, jonka sisältö on
  kirjautumissivun HTML.
*/
test("maksavat ja tietoja luovuttavat rajapinnat vaativat kirjautumisen", async ({ page }) => {
  // Kuitin luku kutsuu Anthropicia: yksi kutsu maksaa oikeaa rahaa.
  const luku = await page.request.post("/api/kuitti/lue", {
    data: { imageBase64: "AAAA", mediaType: "image/jpeg" },
    maxRedirects: 0,
  });
  expect(luku.status()).toBe(401);

  // Vienti kokoaa kaikki käyttäjän tiedot yhteen pakettiin.
  const vienti = await page.request.get("/api/omat-tiedot/vienti", { maxRedirects: 0 });
  expect(vienti.status()).toBe(401);
});

/*
  Stripe-webhook hylkää allekirjoittamattoman pyynnön.

  Tämä reitti MYÖNTÄÄ käyttöoikeuden: ilman allekirjoitustarkistusta kuka
  tahansa osoitteen tietävä voisi merkitä vuokrasuhteen maksetuksi.
*/
test("Stripe-webhook hylkää allekirjoittamattoman pyynnön", async ({ page }) => {
  const response = await page.request.post("/api/stripe/webhook", {
    data: { id: "evt_1", type: "checkout.session.completed", data: { object: {} } },
    maxRedirects: 0,
  });

  expect(response.status()).toBe(401);
});
