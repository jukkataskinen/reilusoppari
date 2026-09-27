"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { createFeatureRequest, updateFeatureRequest } from "@/lib/db/feature-requests";
import { featureRequestSchema, featureRequestUpdateSchema, isFeatureRequestAdmin } from "@/lib/feature-requests";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * Kehitystoiveet (DECISIONS.md 2026-09-27).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: toiveen jättää kuka tahansa kirjautunut, vuokranantaja
 *    tai vuokralainen. Tilan ja vastauksen muuttaa vain käsittelijä
 *    (FEATURE_REQUEST_ADMIN_EMAILS). Tarkistus on TÄSSÄ, koska palvelintoiminto
 *    on julkinen päätepiste, jota selain voi kutsua suoraan.
 * 2. Henkilötieto: toiveen teksti voi sisältää sitä. Ei lokiteta; lokiin menee
 *    vain toiminto ja tunniste.
 * 3. Syöte: zod. Jättäjä otetaan istunnosta, ei lomakkeelta. Sivun osoite
 *    hyväksytään vain sovelluksen sisäisenä polkuna.
 * 4. Toisto: raja toiveiden määrälle, ettei kukaan täytä jonoa.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: kenttäkohtaiset virheet lomakkeelle, ei tietokannan
 *    viestejä.
 * ===========================================================================
 */

export interface FeatureRequestFormState {
  errors: Record<string, string>;
  message?: string;
}

/** Enintään 20 toivetta tunnissa. Riittää innokkaallekin, ei roskaajalle. */
const RATE_ENDPOINT = "kehitystoive";
const RATE_PER_HOUR = 20;

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

  revalidatePath("/kehitystoiveet");
  redirect(`/kehitystoiveet/${id}?kiitos=1`);
}

export async function updateFeatureRequestAction(
  _previous: FeatureRequestFormState,
  formData: FormData,
): Promise<FeatureRequestFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  // Sama vastaus kuin puuttuvalle toiveelle: ei kerrota, onko toivetta olemassa.
  if (!isFeatureRequestAdmin(user.email)) return { errors: {}, message: "Toivetta ei löytynyt." };

  const id = String(formData.get("requestId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { errors: {}, message: "Toivetta ei löytynyt." };

  const parsed = featureRequestUpdateSchema.safeParse({
    status: formData.get("status") ?? "",
    response: formData.get("response") ?? "",
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error.issues) };

  try {
    const found = await updateFeatureRequest(user.id, id, parsed.data);
    if (!found) return { errors: {}, message: "Toivetta ei löytynyt." };
  } catch {
    return { errors: {}, message: "Tallennus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  revalidatePath("/kehitystoiveet");
  redirect(`/kehitystoiveet/${id}?tallennettu=1`);
}
