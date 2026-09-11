"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createTenancy, reissueInvite } from "@/lib/db/tenancies";
import { fieldErrors } from "@/lib/property/schema";
import { tenancyFormToInput, tenancySchema } from "@/lib/tenancy/schema";
import { inviteUrl } from "@/lib/tenancy/invite";

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
    return { errors: fieldErrors(parsed.error) };
  }

  try {
    const { tenancy, invites } = await createTenancy(user.id, parsed.data);
    revalidatePath("/vuokrasuhteet");

    return {
      errors: {},
      created: {
        tenancyId: tenancy.id,
        invites: invites.map((invite) => ({
          name: invite.name,
          email: invite.email,
          url: inviteUrl(appBaseUrl(), invite.token),
        })),
      },
    };
  } catch {
    return {
      errors: {},
      message: "Vuokrasuhteen luonti ei onnistunut. Yritä hetken kuluttua uudelleen.",
    };
  }
}

export interface ReissueState {
  url?: string;
  message?: string;
}

/**
 * Luo uuden kutsulinkin ja mitätöi vanhan.
 *
 * Vanhan linkin mitätöityminen sanotaan käyttöliittymässä ääneen: jos
 * vuokranantaja on jo ehtinyt lähettää vanhan linkin, hänen on tiedettävä
 * ettei se enää toimi.
 */
export async function reissueInviteAction(
  _previous: ReissueState,
  formData: FormData,
): Promise<ReissueState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const tenancyId = String(formData.get("tenancyId") ?? "");
  const partyId = String(formData.get("partyId") ?? "");

  const invite = await reissueInvite(user.id, tenancyId, partyId);
  if (!invite) {
    return { message: "Uutta kutsua ei voitu luoda." };
  }

  revalidatePath(`/vuokrasuhteet/${tenancyId}`);
  return { url: inviteUrl(appBaseUrl(), invite.token) };
}
