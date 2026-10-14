/**
 * Reilusopparin savutestin askeleet (docs/kriittiset-polut.md).
 *
 * Rajat (Jukan päätös 14.10.2026):
 * - Vain keksittyä aineistoa (`aineisto.tsx`), ei henkilötunnuksia.
 * - Kirjoitukset vain savutestin omalle käyttäjälle (`SAVUTESTI_AUTH0_SUB`),
 *   joka ei voi kirjautua: Auth0-tunnisteen etuliite `savutesti|` ei ole
 *   minkään Auth0-yhteyden muoto. Luotu asunto poistetaan saman ajon aikana.
 * - eSinetti ja Stripe vain lukevilla kutsuilla: ei kierroksia, ei
 *   sinetöintejä (eSinetti laskuttaa ne), ei maksusivuja.
 * - Ei sähköposteja eikä push-ilmoituksia.
 */
import { createHash } from "node:crypto";
import { renderDocumentPdf } from "@/documents/render";
import { getBillingClient, hasBillingCredentials } from "@/lib/billing";
import { createProperty, getProperty } from "@/lib/db/properties";
import { getServiceClient } from "@/lib/db/supabase";
import { getEsinettiClient, hasEsinettiCredentials } from "@/lib/esinetti";
import { propertySchema } from "@/lib/property/schema";
import { savutestiAsiakirjat } from "./aineisto";
import { SavutestiVirhe, varmista, type SavutestiAskel } from "./runner";

export const SAVUTESTI_AUTH0_SUB = "savutesti|reilusoppari";

function onPdf(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";
}

/** Asiakirjojen askeleet: jokainen pohja renderöidään tuotannon fonteilla. */
export function asiakirjaAskeleet(): SavutestiAskel[] {
  return savutestiAsiakirjat().map((asiakirja) => ({
    nimi: `asiakirja_${asiakirja.nimi}`,
    aja: async () => {
      const { bytes } = await renderDocumentPdf(asiakirja.elementti());
      varmista(onPdf(bytes), "ei_pdf");
      // Oma fontti puuttuu, jos se ei ole funktiopaketissa (next.config.ts):
      // pdfkit korvaisi sen hiljaa Helveticalla.
      varmista(Buffer.from(bytes).includes("PlusJakartaSans"), "fontti_puuttuu");
    },
  }));
}

async function savutestiKayttaja(): Promise<string> {
  const { data, error } = await getServiceClient()
    .from("rs_users")
    .upsert(
      { auth0_sub: SAVUTESTI_AUTH0_SUB, email: "savutesti@reilusoppari.invalid", name: "Savutesti (keksitty)" },
      { onConflict: "auth0_sub" },
    )
    .select("id")
    .single();
  if (error || !data) throw new SavutestiVirhe("kayttaja_epaonnistui");
  return data.id as string;
}

export function reilusoppariAskeleet(): SavutestiAskel[] {
  return [
    ...asiakirjaAskeleet(),
    {
      nimi: "tietokanta_kirjoitus",
      aja: async () => {
        const userId = await savutestiKayttaja();
        const property = await createProperty(
          userId,
          propertySchema.parse({
            name: "Savutesti",
            street: "Keksitie 1 A 2",
            postalCode: "40100",
            city: "Jyväskylä",
            propertyType: "kerrostalo",
            rooms: 2,
          }),
        );
        try {
          const read = await getProperty(userId, property.id);
          varmista(read?.id === property.id, "luku_epaonnistui");
        } finally {
          // Oletuskohdat poistuvat samalla (on delete cascade).
          const { error } = await getServiceClient()
            .from("rs_properties")
            .delete()
            .eq("id", property.id)
            .eq("owner_user_id", userId);
          varmista(!error, "siivous_epaonnistui");
        }
      },
    },
    {
      nimi: "esinetti_yhteys",
      aja: async () => {
        // Tuotannossa mock tarkoittaisi, ettei kukaan oikeasti allekirjoita.
        varmista(hasEsinettiCredentials(), "esinetti_mock");
        // Julkinen aitoustarkistus tiivisteellä, jota ei ole: ei luo mitään eikä maksa.
        const sha = createHash("sha256").update("reilusoppari-savutesti").digest("hex");
        const result = await getEsinettiClient().verifyDocument(sha);
        varmista(result, "esinetti_ei_vastaa");
      },
    },
    {
      nimi: "stripe_yhteys",
      aja: async () => {
        varmista(hasBillingCredentials(), "stripe_mock");
        // Haku ilman osumaa: lukeva kutsu, ei asiakasta eikä veloitusta.
        const found = await getBillingClient().findActiveSubscription({
          metadataKey: "savutesti",
          metadataValue: "ei-ole",
        });
        varmista(found === null, "odottamaton_osuma");
      },
    },
    {
      nimi: "sahkoposti_asetukset",
      aja: async () => {
        // Ei lähetetä mitään: tarkistetaan vain, että lähetys on asetettu.
        varmista(process.env.RESEND_API_KEY, "not_configured");
      },
    },
  ];
}
