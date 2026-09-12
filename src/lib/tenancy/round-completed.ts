/**
 * `round.completed`: allekirjoitettujen asiakirjojen vastaanotto (CLAUDE.md 5.4).
 *
 * ===========================================================================
 * TÄMÄ ON SE HETKI, JOLLOIN VUOKRASUHDE ALKAA
 *
 * Kun kaikki ovat allekirjoittaneet, tapahtuu neljä asiaa:
 *   1. Sinetöidyt PDF:t ladataan omaan Storageen. Latauslinkkiä ei
 *      tallenneta — se vanhenee, ja vanhentunut linkki arkistossa on sama
 *      kuin ei asiakirjaa.
 *   2. Tiivisteet talteen. Niillä osoitetaan myöhemmin, että asiakirja on
 *      sama kuin allekirjoitettu.
 *   3. Osapuolten henkilöllisyys merkitään todennetuksi. Vahva
 *      tunnistautuminen tapahtui eSinetissä, ja tieto siitä on sen arvon
 *      perusta, jonka vuokratodistus myöhemmin saa.
 *   4. Vuokrakaudet generoidaan. Ilman niitä kuittausmuistutukset eivät
 *      lähtisi eikä vuokranmaksuhistoriaa syntyisi.
 *
 * IDEMPOTENTTI
 *
 * eSinetti voi lähettää saman tapahtuman uudelleen, jos vastauksemme ei
 * mennyt perille. Käsittely tarkistaa, onko työ jo tehty, eikä tee sitä
 * toista kertaa. Toisto ei siis tuota kaksinkertaisia vuokrakausia.
 * ===========================================================================
 */

import { getServiceClient } from "../db/supabase";
import { getEsinettiClient, type WebhookEvent } from "../esinetti";
import { createRentPeriods } from "../db/tenancies";
import type { Tenancy } from "../db/tenancies";

export type CompletionOutcome =
  | { handled: true; alreadyDone: boolean }
  | { handled: false; reason: string };

/** Kumpi asiakirja on kyseessä? Nimi on se, joka kierrokselle annettiin. */
function documentKind(name: string): "contract" | "inspection" | null {
  const lower = name.toLowerCase();
  if (lower.startsWith("vuokrasopimus")) return "contract";
  if (lower.startsWith("alkukatselmus") || lower.startsWith("loppukatselmus")) {
    return "inspection";
  }
  return null;
}

/**
 * Tallentaa sinetöidyn asiakirjan omaan Storageen.
 *
 * Ladataan eSinetiltä eikä tallenneta linkkiä: asiakirjan on oltava meillä,
 * ei viittaus toisen palvelun tiedostoon.
 */
async function storeSealed(
  tenancyId: string,
  roundId: string,
  documentId: string,
  fileName: string,
): Promise<string | null> {
  let bytes: Uint8Array;
  try {
    bytes = await getEsinettiClient().downloadRoundDocument(roundId, documentId);
  } catch (err) {
    console.error(
      "[signing] sinetöidyn asiakirjan lataus epäonnistui:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  const path = `${tenancyId}/${roundId}/${fileName}`;
  const { error } = await getServiceClient()
    .storage.from("documents")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });

  if (error) {
    console.error("[signing] sinetöidyn asiakirjan tallennus epäonnistui:", error.message);
    return null;
  }

  return path;
}

/**
 * Merkitsee osapuolen henkilöllisyyden todennetuksi.
 *
 * Yhdistäminen tapahtuu sähköpostilla: se on ainoa tunniste, joka on sekä
 * allekirjoittajalla että osapuolirivillä. Syntymäaikaa ei tallenneta, koska
 * webhook ei sitä välitä — nimi ja todennusaika riittävät siihen, mihin
 * tietoa käytetään.
 */
async function markIdentityVerified(
  tenancyId: string,
  signers: WebhookEvent["signers"],
): Promise<void> {
  const supabase = getServiceClient();

  const { data: parties } = await supabase
    .from("rs_tenancy_parties")
    .select("user_id, contact_email, invite_email")
    .eq("tenancy_id", tenancyId);

  const byEmail = new Map<string, string>();
  for (const party of (parties ?? []) as Array<{
    user_id: string | null;
    contact_email: string | null;
    invite_email: string | null;
  }>) {
    const email = (party.contact_email ?? party.invite_email)?.toLowerCase();
    if (email && party.user_id) byEmail.set(email, party.user_id);
  }

  const now = new Date().toISOString();

  for (const signer of signers) {
    if (signer.status !== "signed") continue;

    const userId = byEmail.get(signer.email.toLowerCase());
    if (!userId) continue;

    await supabase
      .from("rs_users")
      .update({ identity_verified_at: now, name: signer.name, updated_at: now })
      .eq("id", userId);
  }
}

/**
 * Käsittelee valmiin kierroksen.
 *
 * Palauttaa `handled: false`, jos tapahtuma ei kuulu meille — silloin
 * webhook-reitti vastaa silti 200, ettei eSinetti yritä loputtomasti
 * uudelleen.
 */
export async function handleRoundCompleted(
  event: WebhookEvent,
  tenancyId: string,
): Promise<CompletionOutcome> {
  const supabase = getServiceClient();

  const { data: tenancyRow } = await supabase
    .from("rs_tenancies")
    .select("id, status")
    .eq("id", tenancyId)
    .maybeSingle();

  if (!tenancyRow) return { handled: false, reason: "Vuokrasuhdetta ei löytynyt." };

  const { data: contractRow } = await supabase
    .from("rs_contracts")
    .select("signed_at")
    .eq("tenancy_id", tenancyId)
    .maybeSingle();

  // Jo käsitelty: eSinetti toistaa tapahtuman, jos vastauksemme ei mennyt
  // perille. Toinen käsittely tuottaisi kaksinkertaiset vuokrakaudet.
  if ((contractRow as { signed_at: string | null } | null)?.signed_at) {
    return { handled: true, alreadyDone: true };
  }

  const now = new Date().toISOString();

  /*
    Allekirjoitus merkitään ENNEN asiakirjojen käsittelyä ja siitä
    riippumatta.

    Ensin tämä tehtiin asiakirjasilmukan sisällä. Silloin idempotenssin
    vahti riippui siitä, tunnistettiinko asiakirjat: tapahtuma, jonka
    asiakirjoja emme tunnista — tai jossa niitä ei ole — ei jättänyt
    `signed_at`-leimaa, ja jokainen toisto generoi vuokrakaudet uudelleen.
    Kierros on valmis silloin kun se on valmis, riippumatta siitä montako
    tiedostoa siitä osasimme lukea.
  */
  await Promise.all([
    supabase
      .from("rs_contracts")
      .update({ signed_at: now, updated_at: now })
      .eq("tenancy_id", tenancyId),
    supabase
      .from("rs_inspections")
      .update({ status: "signed", signed_at: now, updated_at: now })
      .eq("tenancy_id", tenancyId)
      .eq("kind", "initial"),
  ]);

  for (const document of event.documents) {
    const kind = documentKind(document.name);
    if (!kind) continue;

    const path = await storeSealed(tenancyId, event.roundId, document.id, document.name);

    const patch = {
      esinetti_document_id: document.id,
      sealed_sha256: document.sealedSha256,
      sealed_path: path,
      updated_at: now,
    };

    if (kind === "contract") {
      await supabase.from("rs_contracts").update(patch).eq("tenancy_id", tenancyId);
    } else {
      await supabase
        .from("rs_inspections")
        .update(patch)
        .eq("tenancy_id", tenancyId)
        .eq("kind", "initial");
    }
  }

  await markIdentityVerified(tenancyId, event.signers);

  await supabase
    .from("rs_tenancies")
    .update({ status: "active", updated_at: now })
    .eq("id", tenancyId);

  /*
    Vuokrakaudet generoidaan vasta tässä, ei sopimusta luotaessa.

    Ennen allekirjoitusta sopimuksen ehdot voivat vielä muuttua, ja
    generoidut kaudet pitäisi luoda uudelleen joka muutoksella. Allekirjoitus
    on se hetki, jolloin vuokra ja eräpäivä ovat lopulliset.
  */
  const { data: fullTenancy } = await supabase
    .from("rs_tenancies")
    .select("id, property_id, landlord_user_id, status, start_date, end_date, rent_amount, rent_due_day, deposit_amount")
    .eq("id", tenancyId)
    .single();

  if (fullTenancy) {
    const row = fullTenancy as {
      id: string;
      property_id: string;
      landlord_user_id: string;
      status: string;
      start_date: string | null;
      end_date: string | null;
      rent_amount: string | number | null;
      rent_due_day: number | null;
      deposit_amount: string | number | null;
    };

    await createRentPeriods(tenancyId, {
      id: row.id,
      propertyId: row.property_id,
      landlordUserId: row.landlord_user_id,
      status: row.status,
      startDate: row.start_date,
      endDate: row.end_date,
      rentAmount: row.rent_amount === null ? null : Number(row.rent_amount),
      rentDueDay: row.rent_due_day,
      depositAmount: row.deposit_amount === null ? null : Number(row.deposit_amount),
    } as Tenancy);
  }

  return { handled: true, alreadyDone: false };
}


/**
 * Loppukatselmuksen kierros on valmis (CLAUDE.md 5.8).
 *
 * ===========================================================================
 * TÄSTÄ ALKAA ARVIOIDEN VAIHE
 *
 * Kun loppukatselmuksen pöytäkirja on allekirjoitettu, vuokrasuhde on
 * päättynyt: tila `ended`. Vasta sen jälkeen kumpikin voi antaa toisestaan
 * arvion, ja vasta arvioiden jälkeen todistukset sinetöidään.
 *
 * Järjestys on olennainen. Arvio ennen allekirjoitusta olisi painostuskeino:
 * "allekirjoita, niin saat hyvän arvion". Allekirjoituksen jälkeen kumpikaan
 * ei voi enää muuttaa toisen tilannetta.
 *
 * Idempotentti samalla tavalla kuin alkukierros: `signed_at` katselmuksella
 * on merkki siitä, että työ on jo tehty.
 * ===========================================================================
 */
export async function handleFinalRoundCompleted(
  event: WebhookEvent,
  tenancyId: string,
): Promise<CompletionOutcome> {
  const supabase = getServiceClient();

  const { data: inspection } = await supabase
    .from("rs_inspections")
    .select("id, signed_at")
    .eq("tenancy_id", tenancyId)
    .eq("kind", "final")
    .maybeSingle();

  const row = inspection as { id: string; signed_at: string | null } | null;
  if (!row) return { handled: false, reason: "Loppukatselmusta ei löytynyt." };
  if (row.signed_at) return { handled: true, alreadyDone: true };

  const now = new Date().toISOString();

  await supabase
    .from("rs_inspections")
    .update({ status: "signed", signed_at: now, updated_at: now })
    .eq("id", row.id);

  for (const document of event.documents) {
    const path = await storeSealed(tenancyId, event.roundId, document.id, document.name);

    await supabase
      .from("rs_inspections")
      .update({
        esinetti_document_id: document.id,
        sealed_sha256: document.sealedSha256,
        sealed_path: path,
        updated_at: now,
      })
      .eq("id", row.id);
  }

  await markIdentityVerified(tenancyId, event.signers);

  // Vuokrasuhde on päättynyt. Todistukset syntyvät vasta arvioiden jälkeen.
  await supabase
    .from("rs_tenancies")
    .update({ status: "ended", updated_at: now })
    .eq("id", tenancyId);

  return { handled: true, alreadyDone: false };
}
