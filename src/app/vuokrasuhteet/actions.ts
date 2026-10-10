"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import {
  changeInviteEmail,
  createTenancy,
  deleteTenancy,
  getTenancyProperty,
  removeInvite,
  resendInvite,
  type DeleteTenancyResult,
  type InviteChangeResult,
} from "@/lib/db/tenancies";
import { fieldErrors } from "@/lib/forms/schema";
import { tenancyFieldName, tenancyFormToInput, tenancySchema } from "@/lib/tenancy/schema";
import { inviteUrl } from "@/lib/tenancy/invite";
import {
  inviteEmailSchema,
  isOwnEmail,
  OWN_EMAIL_MESSAGE,
  KUTSUSAHKOPOSTIRAJA,
  KUTSUSAHKOPOSTIRAJA_VIESTI,
  PENDING_PARTY_MESSAGES,
  TENANCY_DELETION_MESSAGES,
} from "@/lib/tenancy/invite-management";
import { sendInviteEmail } from "@/lib/notifications/invite-email";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * Vuokrasuhteen luonti ja kutsujen hallinta (CLAUDE.md 5.1).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: kirjautunut käyttäjä. Palvelintoiminto on julkinen
 *    päätepiste, joten `getCurrentUser()` on tehtävä tässä eikä luotettava
 *    siihen, että lomakkeen näyttänyt sivu oli suojattu. Asunnon omistajuus
 *    tarkistetaan datakerroksessa.
 * 2. Henkilötieto: vuokralaisen nimi ja sähköposti. Ei lokiteta.
 * 3. Syöte: zod.
 * 4. Toisto: kaksi lähetystä luo kaksi vuokrasuhdetta. Hyväksytty —
 *    ylimääräisen luonnoksen voi jättää, eikä se maksa mitään ennen
 *    allekirjoitusta.
 * 5. **Kutsulinkit palautetaan lomakkeen tilassa, ei uudelleenohjauksessa.**
 *    Osoitteeseen laitettu tunniste päätyisi selaimen historiaan,
 *    palvelinlokeihin ja `Referer`-otsakkeisiin. Siksi luonnin jälkeen ei
 *    ohjata minnekään, vaan linkit näytetään samalla sivulla.
 * 6. Epäonnistuminen: kenttäkohtaiset virheet, ei tietokannan viestejä.
 * 7. Lokitus: ei tunnisteita.
 * ===========================================================================
 */

export interface IssuedInviteLink {
  name: string;
  email: string;
  url: string;
  /** Lähtikö kutsu sähköpostilla. Jos ei, vuokranantaja lähettää linkin itse. */
  emailSent: boolean;
}

export interface TenancyFormState {
  errors: Record<string, string>;
  message?: string;
  /** Luonnin jälkeen: vuokrasuhteen id ja kertaalleen näytettävät kutsulinkit. */
  created?: {
    tenancyId: string;
    invites: IssuedInviteLink[];
  };
}

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    "http://localhost:3000"
  );
}

export async function createTenancyAction(
  _previous: TenancyFormState,
  formData: FormData,
): Promise<TenancyFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const parsed = tenancySchema.safeParse(tenancyFormToInput(formData));
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error, tenancyFieldName) };
  }

  // Oma osoite vuokralaisen kohdalla on lähes aina vahinko, ja se johtaisi
  // tilaan, jossa vuokranantaja on oman vuokrasuhteensa vuokralainen (Jukan
  // havainto 10.10.2026). Liittyminen estetään myös kutsun puolella.
  const ownEmailErrors: Record<string, string> = {};
  parsed.data.tenants.forEach((tenant, index) => {
    if (isOwnEmail(tenant.email, user.email)) {
      ownEmailErrors[`tenantEmail${index}`] = OWN_EMAIL_MESSAGE;
    }
  });
  if (Object.keys(ownEmailErrors).length > 0) return { errors: ownEmailErrors };

  try {
    const { tenancy, invites } = await createTenancy(user.id, parsed.data);
    revalidatePath("/vuokrasuhteet");

    /*
      Kutsu lähtee myös sähköpostilla (CLAUDE.md 5.1). Linkki näytetään
      silti: jos viesti ei lähde tai menee roskapostiin, vuokranantaja voi
      lähettää linkin itse.
    */
    const address = await addressFor(user.id, tenancy.id);
    const links: IssuedInviteLink[] = [];
    for (const invite of invites) {
      const url = inviteUrl(appBaseUrl(), invite.token);
      const emailSent =
        (await inviteEmailAllowed(user.id)) &&
        (await sendInviteEmail({ to: invite.email, url, address }));
      links.push({ name: invite.name, email: invite.email, url, emailSent });
    }

    return { errors: {}, created: { tenancyId: tenancy.id, invites: links } };
  } catch {
    return {
      errors: {},
      message: "Vuokrasuhteen luonti ei onnistunut. Yritä hetken kuluttua uudelleen.",
    };
  }
}

/** Asunnon osoite kutsuviestiin. Puuttuva osoite ei estä lähetystä. */
async function addressFor(userId: string, tenancyId: string): Promise<string | null> {
  try {
    const property = await getTenancyProperty(userId, tenancyId);
    return property ? `${property.street}, ${property.postalCode} ${property.city}` : null;
  } catch {
    return null;
  }
}

/** Kasvattaa kutsusähköpostien laskuria. `false` = raja täynnä. */
async function inviteEmailAllowed(userId: string): Promise<boolean> {
  const limit = await checkRateLimit(
    userId,
    KUTSUSAHKOPOSTIRAJA.endpoint,
    KUTSUSAHKOPOSTIRAJA.limit,
    KUTSUSAHKOPOSTIRAJA.windowMinutes,
  );
  return limit.allowed;
}

/** Kutsurivin lomakkeiden yhteinen tila. */
export interface InviteRowState {
  /** Kenttäkohtaiset virheet (sähköpostin vaihto). */
  errors?: Record<string, string>;
  /** Yleinen virhe. */
  message?: string;
  /** Uusi kutsu: linkki näytetään kerran, ja kerrotaan lähtikö sähköposti. */
  issued?: { email: string; url: string; emailSent: boolean };
  removed?: boolean;
}

function ids(formData: FormData): { tenancyId: string; partyId: string } {
  return {
    tenancyId: String(formData.get("tenancyId") ?? ""),
    partyId: String(formData.get("partyId") ?? ""),
  };
}

/**
 * Uuden kutsun tulos lomakkeen tilaksi.
 *
 * Kutsulinkki palautetaan lomakkeen tilassa eikä uudelleenohjauksessa (ks.
 * tiedoston alku, kohta 5). Sähköposti lähetetään vasta onnistuneen
 * tallennuksen jälkeen: viesti ei saa lähteä linkillä, jota ei ole olemassa.
 */
async function issuedState(
  userId: string,
  tenancyId: string,
  result: InviteChangeResult,
): Promise<InviteRowState> {
  if (!result.ok) return { message: PENDING_PARTY_MESSAGES[result.reason] };

  revalidatePath(`/vuokrasuhteet/${tenancyId}`);
  const url = inviteUrl(appBaseUrl(), result.invite.token);
  const emailSent = await sendInviteEmail({
    to: result.invite.email,
    url,
    address: await addressFor(userId, tenancyId),
  });
  return { issued: { email: result.invite.email, url, emailSent } };
}

/**
 * Lähettää kutsun uudelleen samaan osoitteeseen. Uusi linkki mitätöi vanhan.
 *
 * Raja tarkistetaan ennen kuin uusi linkki luodaan: muuten jokainen rajan
 * yli mennyt painallus mitätöisi silti edellisen linkin.
 */
export async function resendInviteAction(
  _previous: InviteRowState,
  formData: FormData,
): Promise<InviteRowState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  if (!(await inviteEmailAllowed(user.id))) return { message: KUTSUSAHKOPOSTIRAJA_VIESTI };

  const { tenancyId, partyId } = ids(formData);
  const result = await resendInvite(user.id, tenancyId, partyId);
  return issuedState(user.id, tenancyId, result);
}

/** Vaihtaa kutsutun sähköpostin ja lähettää kutsun uuteen osoitteeseen. */
export async function changeInviteEmailAction(
  _previous: InviteRowState,
  formData: FormData,
): Promise<InviteRowState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const parsed = inviteEmailSchema.safeParse({ email: formData.get("email") ?? "" });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  if (isOwnEmail(parsed.data.email, user.email)) return { errors: { email: OWN_EMAIL_MESSAGE } };

  if (!(await inviteEmailAllowed(user.id))) return { message: KUTSUSAHKOPOSTIRAJA_VIESTI };

  const { tenancyId, partyId } = ids(formData);
  const result = await changeInviteEmail(user.id, tenancyId, partyId, parsed.data.email);
  if (!result.ok && result.reason === "duplicate") {
    return { errors: { email: PENDING_PARTY_MESSAGES.duplicate } };
  }
  return issuedState(user.id, tenancyId, result);
}

/**
 * Poistaa kutsun vuokralaiselta, joka ei ole liittynyt.
 *
 * Vahvistus on sekä käyttöliittymässä että tässä: `confirm=yes` puuttuu, jos
 * lomake lähetettiin ilman vahvistusvaihetta, eikä silloin poisteta mitään.
 */
export async function removeInviteAction(
  _previous: InviteRowState,
  formData: FormData,
): Promise<InviteRowState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  if (formData.get("confirm") !== "yes") {
    return { message: "Vahvista poisto ennen kuin kutsu poistetaan." };
  }

  const { tenancyId, partyId } = ids(formData);
  const result = await removeInvite(user.id, tenancyId, partyId);
  if (!result.ok) return { message: PENDING_PARTY_MESSAGES[result.reason] };

  revalidatePath(`/vuokrasuhteet/${tenancyId}`);
  return { removed: true };
}

export interface DeleteTenancyState {
  message?: string;
}

/**
 * Poistaa vuokrasuhdeluonnoksen. Onnistuessa ohjataan vuokrasuhteiden
 * listaan — osoitteessa ei ole mitään tunnistetta, joten ohjaus on turvallinen.
 */
export async function deleteTenancyAction(
  _previous: DeleteTenancyState,
  formData: FormData,
): Promise<DeleteTenancyState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  if (formData.get("confirm") !== "yes") {
    return { message: "Vahvista poisto ennen kuin vuokrasuhde poistetaan." };
  }

  const tenancyId = String(formData.get("tenancyId") ?? "");
  let result: DeleteTenancyResult;
  try {
    result = await deleteTenancy(user.id, tenancyId);
  } catch {
    return { message: "Poisto ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  if (!result.ok) {
    if (result.reason === "not_found") return { message: "Vuokrasuhdetta ei löytynyt." };
    if (result.reason === "failed") {
      return { message: "Poisto ei onnistunut. Päivitä sivu ja yritä uudelleen." };
    }
    return { message: TENANCY_DELETION_MESSAGES[result.reason] };
  }

  revalidatePath("/vuokrasuhteet");
  redirect("/vuokrasuhteet?poistettu=1");
}
