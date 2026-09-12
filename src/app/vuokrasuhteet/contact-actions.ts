"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { canSendMessage, cleanMessage } from "@/lib/certificates/contact";
import {
  addMessage,
  getConversation,
  setContactPermission,
} from "@/lib/db/certificate-contact";
import { notifyUser } from "@/lib/notifications/tenancy";

/**
 * Yhteydenottolupa ja keskusteluviestit (CLAUDE.md 5.10).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: luvan muuttaminen vain todistuksen ANTAJA, viestin
 *    lähetys vain keskustelun osallistuja. Molemmat tarkistetaan
 *    datakerroksessa.
 * 2. Henkilötieto: viestit koskevat kolmatta osapuolta. Ei lokiteta.
 * 3. Syöte: viesti siivotaan ja katkaistaan (`cleanMessage`).
 * 4. IDOR: keskustelun id lomakkeesta, oikeustarkistus `getConversation`issa,
 *    joka palauttaa `null` sille, joka ei kuulu keskusteluun.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: neutraali viesti.
 * 7. Lokitus: ei viestien sisältöä, ei nimiä.
 * ===========================================================================
 */

export interface ContactActionState {
  message?: string;
  done?: boolean;
}

export async function setContactPermissionAction(
  _previous: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const certificateId = String(formData.get("certificateId") ?? "");
  const tenancyId = String(formData.get("tenancyId") ?? "");
  const allowed = formData.get("allowed") === "on";

  if (!certificateId) return { message: "Todistus puuttuu." };

  const result = await setContactPermission({
    userId: user.id,
    certificateId,
    allowed,
    now: new Date(),
  });

  if (!result.ok) return { message: result.message };

  revalidatePath(`/vuokrasuhteet/${tenancyId}/todistukset`);
  return { done: true };
}

export async function sendConversationMessageAction(
  _previous: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const conversationId = String(formData.get("conversationId") ?? "");
  const body = cleanMessage(String(formData.get("body") ?? ""));

  if (!body) return { message: "Kirjoita viesti." };

  const conversation = await getConversation(user.id, conversationId);
  if (!conversation) return { message: "Keskustelua ei löytynyt." };

  /*
    Vuokralainen NÄKEE keskustelun muttei kirjoita siihen.

    Keskustelu käydään hänestä, ja hän näkee sen kokonaisuudessaan — mutta
    osapuolia on kaksi: kysyjä ja luvan antaja. Jos kolmas voisi kirjoittaa,
    keskustelu muuttuisi joksikin muuksi kuin miksi se luvattiin.
  */
  const isParticipant =
    user.id === conversation.initiatorUserId || user.id === conversation.issuerUserId;

  const decision = canSendMessage({ closedAt: conversation.closedAt, isParticipant });
  if (!decision.allowed) return { message: decision.message };

  const ok = await addMessage({
    conversationId,
    authorUserId: user.id,
    body,
    now: new Date(),
  });

  if (!ok) return { message: "Viestiä ei voitu lähettää." };

  // Ilmoitus toiselle osapuolelle. Itse viesti on vain portaalissa.
  const recipient =
    user.id === conversation.initiatorUserId ? conversation.issuerUserId : conversation.initiatorUserId;

  if (recipient) {
    await notifyUser(recipient, {
      kind: "certificate.conversation",
      dedupeKey: `certificate.conversation:${conversationId}:${Date.now()}`,
      title: "Uusi viesti keskustelussa",
      body: "Vuokratodistukseen liittyvään keskusteluun on tullut viesti.",
      path: `/keskustelut/${conversationId}`,
    });
  }

  revalidatePath(`/keskustelut/${conversationId}`);
  return { done: true };
}
