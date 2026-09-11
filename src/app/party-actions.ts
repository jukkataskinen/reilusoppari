"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { fieldErrors } from "@/lib/property/schema";
import { hasEncryptionKey } from "@/lib/identity/crypto";
import {
  applyOwnDefaults,
  partyDetailsFormToInput,
  partyDetailsSchema,
  savePartyDetails,
  saveOwnPartyDefaults,
} from "@/lib/tenancy/party-details";

/**
 * Osapuolten ja omien perustietojen tallennus.
 *
 * ===========================================================================
 * PUUTTUVA SALAUSAVAIN ON OMA VIRHEENSÄ
 *
 * Ilman `PERSON_DATA_KEY`-muuttujaa tunnusta ei voi salata. Se kerrotaan
 * omana viestinään eikä yleisenä "tallennus ei onnistunut" -tekstinä:
 * muuten kukaan ei arvaisi, mistä on kyse, ja sopimus lähtisi eteenpäin
 * tunnisteettomana.
 * ===========================================================================
 */

export interface PartyFormState {
  errors: Record<string, string>;
  message?: string;
  saved?: boolean;
}

const EI_AVAINTA =
  "Tunnistetietoja ei voi juuri nyt tallentaa turvallisesti. Muut tiedot tallentuvat normaalisti.";

export async function savePartyDetailsAction(
  _previous: PartyFormState,
  formData: FormData,
): Promise<PartyFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const partyId = String(formData.get("partyId") ?? "");

  const parsed = partyDetailsSchema.safeParse(partyDetailsFormToInput(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  if (parsed.data.personalId && !hasEncryptionKey()) {
    return { errors: {}, message: EI_AVAINTA };
  }

  try {
    const result = await savePartyDetails(user.id, tenancyId, partyId, parsed.data);
    if (!result.ok) {
      // Sama viesti riippumatta siitä, onko riviä olemassa vai eikö siihen
      // ole oikeutta: muuten virhe kertoisi, mitkä id:t ovat olemassa.
      return { errors: {}, message: "Näitä tietoja ei voi muokata." };
    }
  } catch {
    return { errors: {}, message: "Tallennus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}/osapuolet`);
  revalidatePath(`/vuokrasuhteet/${tenancyId}`);
  return { errors: {}, saved: true };
}

export async function saveOwnDetailsAction(
  _previous: PartyFormState,
  formData: FormData,
): Promise<PartyFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const parsed = partyDetailsSchema.safeParse(partyDetailsFormToInput(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  if (parsed.data.personalId && !hasEncryptionKey()) {
    return { errors: {}, message: EI_AVAINTA };
  }

  try {
    await saveOwnPartyDefaults(user.id, parsed.data);
  } catch {
    return { errors: {}, message: "Tallennus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  revalidatePath("/omat-tiedot");
  return { errors: {}, saved: true };
}

/** "Täytä omista tiedoistani" osapuolisivulla. */
export async function applyOwnDefaultsAction(
  _previous: PartyFormState,
  formData: FormData,
): Promise<PartyFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const partyId = String(formData.get("partyId") ?? "");

  try {
    const result = await applyOwnDefaults(user.id, tenancyId, partyId);
    if (!result.ok) return { errors: {}, message: "Näitä tietoja ei voi muokata." };
  } catch {
    return { errors: {}, message: "Kopiointi ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}/osapuolet`);
  return { errors: {}, saved: true };
}
