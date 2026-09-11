"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { createProperty } from "@/lib/db/properties";
import { fieldErrors, propertyFormToInput, propertySchema } from "@/lib/property/schema";

/**
 * Asunnon luonti (CLAUDE.md 5.1).
 *
 * ===========================================================================
 * TIETOTURVAKATSELMUS (esinetti CLAUDE.md 0.1)
 *
 * 1. Kuka saa kutsua: kirjautunut käyttäjä. Palvelintoiminto on julkinen
 *    päätepiste siinä missä API-reittikin — selain voi kutsua sitä suoraan —
 *    joten `getCurrentUser()` on tehtävä TÄSSÄ eikä luottaa siihen, että
 *    sivu jolta lomake tuli oli suojattu.
 * 2. Henkilötieto: osoite. Ei lokiteta.
 * 3. Syöte: zod. Omistaja otetaan istunnosta, EI lomakkeelta — muuten
 *    kuka tahansa voisi luoda asunnon toisen nimiin.
 * 4. Toisto: kaksi peräkkäistä lähetystä luo kaksi asuntoa. Tämä on
 *    hyväksytty: sama osoite voi esiintyä perustellusti kahdesti (esim. kaksi
 *    huoneistoa samassa talossa), joten estäminen tekisi enemmän vahinkoa
 *    kuin duplikaatti, jonka käyttäjä voi arkistoida.
 * 5. Salaisuuksia ei käsitellä.
 * 6. Epäonnistuminen: kenttäkohtaiset virheet takaisin lomakkeelle, ei
 *    tietokannan viestejä.
 * 7. Lokitus: ei lomakedataa.
 * ===========================================================================
 */

export interface PropertyFormState {
  errors: Record<string, string>;
  /** Yleinen virhe, joka ei kohdistu yhteen kenttään. */
  message?: string;
}

export async function createPropertyAction(
  _previous: PropertyFormState,
  formData: FormData,
): Promise<PropertyFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const parsed = propertySchema.safeParse(propertyFormToInput(formData));
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error) };
  }

  let propertyId: string;
  try {
    const property = await createProperty(user.id, parsed.data);
    propertyId = property.id;
  } catch {
    return { errors: {}, message: "Tallennus ei onnistunut. Yritä hetken kuluttua uudelleen." };
  }

  revalidatePath("/asunnot");
  // `redirect` heittää, joten se on viimeisenä eikä try-lohkon sisällä:
  // muuten catch nappaisi sen ja näyttäisi virheen onnistuneesta luonnista.
  redirect("/asunnot/" + propertyId);
}
