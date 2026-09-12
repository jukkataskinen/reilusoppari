"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { addContractComment, saveContractTerms } from "@/lib/db/contracts";
import { fieldErrors } from "@/lib/property/schema";
import { contractFormToInput, contractTermsSchema } from "@/lib/tenancy/contract-schema";

/**
 * Sopimuksen ehtojen tallennus (CLAUDE.md 5.1).
 *
 * Vain vuokranantaja ja vain ennen allekirjoitusta — molemmat tarkistetaan
 * datakerroksessa (`db/contracts.ts`), ei täällä. Yksi tarkistus yhdessä
 * paikassa on parempi kuin kaksi, jotka voivat erota toisistaan.
 */

export interface ContractFormState {
  errors: Record<string, string>;
  message?: string;
  saved?: boolean;
}

export async function saveContractAction(
  _previous: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");

  const parsed = contractTermsSchema.safeParse(contractFormToInput(formData));
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error) };
  }

  try {
    const contract = await saveContractTerms(user.id, tenancyId, parsed.data);
    if (!contract) {
      return {
        errors: {},
        message: "Sopimusta ei voi enää muuttaa.",
      };
    }
  } catch {
    return { errors: {}, message: "Tallennus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}`);
  return { errors: {}, saved: true };
}

export interface CommentActionState {
  message?: string;
  sent?: boolean;
}

/**
 * Kommentti sopimusluonnoksesta (CLAUDE.md 5.2).
 *
 * Kumpikin osapuoli saa kommentoida. Osapuolitarkistus on datakerroksessa,
 * ei täällä.
 */
export async function addContractCommentAction(
  _previous: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const body = String(formData.get("body") ?? "");

  try {
    const result = await addContractComment(user.id, tenancyId, body);
    if (!result.ok) return { message: "Kirjoita kommentti ennen lähettämistä." };
  } catch {
    return { message: "Lähetys ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}/sopimus`);
  return { sent: true };
}
