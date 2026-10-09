"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import {
  approveFeatureRequest,
  attachFeatureRequestScreenshot,
  confirmSuggestionWorks,
  createFeatureRequest,
  getFeatureRequest,
  rejectFeatureRequest,
  requestSuggestionChanges,
} from "@/lib/db/feature-requests";
import { getServiceClient } from "@/lib/db/supabase";
import { buildIssueBody, getGithubIssuesClient } from "@/lib/dev-suggestions/github-issues";
import {
  approveFeatureRequestSchema,
  featureRequestSchema,
  isFeatureRequestAdmin,
  rejectFeatureRequestSchema,
  requestChangesSchema,
} from "@/lib/feature-requests";
import { stripImageMetadata, UnsupportedImageError } from "@/lib/photos/strip-metadata";
import { checkRateLimit, KUVARAJA, KUVARAJA_VIESTI } from "@/lib/security/rate-limit";

/**
 * Kehitystoiveet (DECISIONS.md 2026-09-27) ja niiden käsittely
 * kehitysehdotusten tilakoneella (docs/kehitysehdotukset.md, Jukka
 * 8.10.2026).
 *
 * Käsittelijän toiminnot (hyväksy, hylkää, toimii, tarvitsee muutoksen) ovat
 * omat palvelintoimintonsa — ei yhtä yleistä "aseta tila"-toimintoa — jotta
 * sallitut siirtymät tulevat `lib/dev-suggestions/state-machine.ts`:stä
 * eikä käsittelijä voi lomakkeella pyytää mitä tahansa tilaa.
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: toiveen jättää kuka tahansa kirjautunut, vuokranantaja
 *    tai vuokralainen. Tilan ja vastauksen muuttaa vain käsittelijä
 *    (FEATURE_REQUEST_ADMIN_EMAILS). Tarkistus on TÄSSÄ, koska palvelintoiminto
 *    on julkinen päätepiste, jota selain voi kutsua suoraan.
 * 2. Henkilötieto: toiveen teksti voi sisältää sitä. Ei lokiteta; lokiin menee
 *    vain toiminto ja tunniste. GitHub-issueen menee käsittelijän hyväksymä
 *    tai muokkaama kuvaus, ei alkuperäistä sellaisenaan — käsittelijän
 *    vastuulla on poistaa henkilötiedot ennen hyväksyntää.
 * 3. Syöte: zod. Jättäjä otetaan istunnosta, ei lomakkeelta. Sivun osoite
 *    hyväksytään vain sovelluksen sisäisenä polkuna. Valinnainen kuvakaappaus:
 *    vain JPEG ja PNG, koko rajattu, EXIF poistetaan palvelimella samalla
 *    tavalla kuin kuittikuville (`lib/photos/strip-metadata.ts`).
 * 4. Toisto: raja toiveiden määrälle, ettei kukaan täytä jonoa. Kuvakaappaus
 *    kuluttaa samaa kuvien kutsurajaa kuin muu kuvien lataus (CLAUDE.md
 *    kohta 6) — vain silloin, kun toiveessa on kuva, ettei tekstitoive
 *    kuluta kuvien kiintiötä.
 * 5. Salaisuuksia ei käsitellä — `GITHUB_ISSUES_TOKEN` jää palvelimelle
 *    (`lib/dev-suggestions/github-issues.ts`).
 * 6. Epäonnistuminen: kenttäkohtaiset virheet lomakkeelle, ei tietokannan
 *    viestejä. GitHub-kutsun epäonnistuminen ei estä hyväksyntää, eikä
 *    kuvakaappauksen tallennuksen epäonnistuminen estä toiveen syntymistä —
 *    toive on jo tallessa sitä yritettäessä.
 * ===========================================================================
 */

export interface FeatureRequestFormState {
  errors: Record<string, string>;
  message?: string;
}

/** Enintään 20 toivetta tunnissa. Riittää innokkaallekin, ei roskaajalle. */
const RATE_ENDPOINT = "kehitystoive";
const RATE_PER_HOUR = 20;

/** Sama raja kuin muussa kuvien latauksessa (Vercelin funktio ottaa vastaan 4,5 Mt). */
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;

function firstErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export async function createFeatureRequestAction(
  _previous: FeatureRequestFormState,
  formData: FormData,
): Promise<FeatureRequestFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const parsed = featureRequestSchema.safeParse({
    feature: formData.get("feature") ?? "",
    pagePath: formData.get("pagePath"),
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    importance: formData.get("importance") ?? "",
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error.issues) };

  /*
    Valinnainen kuvakaappaus (docs/kehitysehdotukset.md kohta 1, migraatio
    0021). Tyhjä tiedostokenttä tulee selaimelta nollakokoisena File-oliona,
    ei puuttuvana, joten koko ratkaisee eikä pelkkä läsnäolo.
  */
  const screenshotFile = formData.get("screenshot");
  const hasScreenshot = screenshotFile instanceof File && screenshotFile.size > 0;
  if (hasScreenshot && screenshotFile.size > MAX_SCREENSHOT_BYTES) {
    return { errors: { screenshot: "Kuvakaappaus on liian suuri. Enintään 4 Mt." } };
  }

  let screenshot: Awaited<ReturnType<typeof stripImageMetadata>> | null = null;
  if (hasScreenshot) {
    // Samaa rajaa kuin muu kuvien lataus, mutta vain kun toiveessa on kuva.
    const raja = await checkRateLimit(user.id, KUVARAJA.endpoint, KUVARAJA.limit, KUVARAJA.windowMinutes);
    if (!raja.allowed) return { errors: {}, message: KUVARAJA_VIESTI };

    try {
      screenshot = stripImageMetadata(new Uint8Array(await screenshotFile.arrayBuffer()));
    } catch (err) {
      if (err instanceof UnsupportedImageError) {
        return { errors: { screenshot: "Vain PNG- ja JPEG-kuvakaappaukset kelpaavat." } };
      }
      console.error("[kehitystoiveet] kuvakaappauksen käsittely epäonnistui");
      return { errors: { screenshot: "Kuvakaappausta ei voitu käsitellä." } };
    }
  }

  let id: string;
  try {
    const { allowed } = await checkRateLimit(user.id, RATE_ENDPOINT, RATE_PER_HOUR, 60);
    if (!allowed) {
      return { errors: {}, message: "Olet lähettänyt monta toivetta lyhyessä ajassa. Kokeile myöhemmin uudelleen." };
    }
    id = await createFeatureRequest(user.id, parsed.data);
  } catch {
    return { errors: {}, message: "Tallennus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  /*
    Kuvakaappaus liitetään vasta onnistuneen tallennuksen jälkeen. Rivi on
    jo olemassa, joten latauksen epäonnistuminen ei saa estää toiveen
    syntymistä — se jää näkymään ilman kuvaa, mikä on parempi kuin kadonnut
    toive. Rivin kirjaus ja Storage-lataus eivät ole samassa transaktiossa,
    joten osittainen tulos siivotaan itse kummin päin tahansa epäonnistuu.
  */
  if (screenshot) {
    const extension = screenshot.format === "image/png" ? "png" : "jpg";
    const storagePath = `kehitystoiveet/${user.id}/${id}.${extension}`;
    const sha256 = createHash("sha256").update(screenshot.bytes).digest("hex");

    const { error: uploadError } = await getServiceClient()
      .storage.from("photos")
      .upload(storagePath, screenshot.bytes, { contentType: screenshot.format, upsert: false });

    if (uploadError) {
      console.error("[kehitystoiveet] kuvakaappauksen tallennus epäonnistui:", uploadError.message);
    } else {
      const saved = await attachFeatureRequestScreenshot(id, {
        storagePath,
        sha256,
        bytes: screenshot.bytes.byteLength,
        width: screenshot.width,
        height: screenshot.height,
      });
      if (!saved) await getServiceClient().storage.from("photos").remove([storagePath]);
    }
  }

  revalidatePath("/kehitystoiveet");
  redirect(`/kehitystoiveet/${id}?kiitos=1`);
}

class AdminActionError extends Error {}

/** Käsittelijän tarkistus ja toiveen tunnisteen poiminta — sama jokaisessa alla olevassa toiminnossa. */
async function requireAdminAndId(formData: FormData): Promise<{ id: string; adminUserId: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  // Sama vastaus kuin puuttuvalle toiveelle: ei kerrota, onko toivetta olemassa.
  if (!isFeatureRequestAdmin(user.email)) throw new AdminActionError("Toivetta ei löytynyt.");

  const id = String(formData.get("requestId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AdminActionError("Toivetta ei löytynyt.");
  return { id, adminUserId: user.id };
}

export async function approveFeatureRequestAction(
  _previous: FeatureRequestFormState,
  formData: FormData,
): Promise<FeatureRequestFormState> {
  let id: string, adminUserId: string;
  try {
    ({ id, adminUserId } = await requireAdminAndId(formData));
  } catch (err) {
    return { errors: {}, message: err instanceof AdminActionError ? err.message : "Toivetta ei löytynyt." };
  }

  const parsed = approveFeatureRequestSchema.safeParse({ approvedDescription: formData.get("approvedDescription") ?? "" });
  if (!parsed.success) return { errors: firstErrors(parsed.error.issues) };

  try {
    const request = await getFeatureRequest({ userId: adminUserId, asAdmin: true }, id);
    if (!request) return { errors: {}, message: "Toivetta ei löytynyt." };

    // GitHub-issue luodaan ENNEN tilan vaihtoa, jotta issue-numero kirjataan
    // samalla siirtymällä (docs/kehitysehdotukset.md kohta 4). Ilman tokenia
    // `createIssue` palauttaa null — hyväksyntä tallentuu silti.
    const description = parsed.data.approvedDescription ?? request.description;
    const issueNumber = await getGithubIssuesClient().createIssue({
      title: request.title,
      body: buildIssueBody({ description, feature: request.feature, pagePath: request.pagePath, requestId: request.id }),
    });

    const outcome = await approveFeatureRequest(adminUserId, id, {
      approvedDescription: parsed.data.approvedDescription,
      githubIssueNumber: issueNumber,
    });
    if (!outcome.ok) return { errors: {}, message: "Toivetta ei voinut hyväksyä sen nykyisessä tilassa." };
  } catch {
    return { errors: {}, message: "Tallennus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  revalidatePath("/kehitystoiveet");
  redirect(`/kehitystoiveet/${id}?tallennettu=1`);
}

export async function rejectFeatureRequestAction(
  _previous: FeatureRequestFormState,
  formData: FormData,
): Promise<FeatureRequestFormState> {
  let id: string, adminUserId: string;
  try {
    ({ id, adminUserId } = await requireAdminAndId(formData));
  } catch (err) {
    return { errors: {}, message: err instanceof AdminActionError ? err.message : "Toivetta ei löytynyt." };
  }

  const parsed = rejectFeatureRequestSchema.safeParse({ response: formData.get("response") ?? "" });
  if (!parsed.success) return { errors: firstErrors(parsed.error.issues) };

  try {
    const outcome = await rejectFeatureRequest(adminUserId, id, parsed.data.response);
    if (!outcome.ok) return { errors: {}, message: "Toivetta ei voinut hylätä sen nykyisessä tilassa." };
  } catch {
    return { errors: {}, message: "Tallennus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  revalidatePath("/kehitystoiveet");
  redirect(`/kehitystoiveet/${id}?tallennettu=1`);
}

export async function confirmWorksAction(
  _previous: FeatureRequestFormState,
  formData: FormData,
): Promise<FeatureRequestFormState> {
  let id: string, adminUserId: string;
  try {
    ({ id, adminUserId } = await requireAdminAndId(formData));
  } catch (err) {
    return { errors: {}, message: err instanceof AdminActionError ? err.message : "Toivetta ei löytynyt." };
  }

  try {
    const outcome = await confirmSuggestionWorks(adminUserId, id);
    if (!outcome.ok) return { errors: {}, message: "Toivetta ei voinut merkitä valmiiksi sen nykyisessä tilassa." };
  } catch {
    return { errors: {}, message: "Tallennus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  revalidatePath("/kehitystoiveet");
  redirect(`/kehitystoiveet/${id}?tallennettu=1`);
}

export async function requestChangesAction(
  _previous: FeatureRequestFormState,
  formData: FormData,
): Promise<FeatureRequestFormState> {
  let id: string, adminUserId: string;
  try {
    ({ id, adminUserId } = await requireAdminAndId(formData));
  } catch (err) {
    return { errors: {}, message: err instanceof AdminActionError ? err.message : "Toivetta ei löytynyt." };
  }

  const parsed = requestChangesSchema.safeParse({ response: formData.get("response") ?? "" });
  if (!parsed.success) return { errors: firstErrors(parsed.error.issues) };

  try {
    const request = await getFeatureRequest({ userId: adminUserId, asAdmin: true }, id);
    const outcome = await requestSuggestionChanges(adminUserId, id, parsed.data.response);
    if (!outcome.ok) return { errors: {}, message: "Pyyntöä ei voinut kirjata toiveen nykyisessä tilassa." };

    // Avataan GitHub-issue uudelleen, jos sellainen on — parhaalla yrityksellä:
    // sovelluksen oma tila on joka tapauksessa totuus, GitHub seuraa perässä.
    if (request?.githubIssueNumber) {
      await getGithubIssuesClient().reopenWithComment(request.githubIssueNumber, parsed.data.response);
    }
  } catch {
    return { errors: {}, message: "Tallennus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  revalidatePath("/kehitystoiveet");
  redirect(`/kehitystoiveet/${id}?tallennettu=1`);
}
