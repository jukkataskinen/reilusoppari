/**
 * Todistuksen sinetöinti (CLAUDE.md 5.8).
 *
 * ===========================================================================
 * SINETÖINTI EI OLE ALLEKIRJOITUS
 *
 * Todistusta ei allekirjoita kukaan. Sen antaja on jo tunnistautunut vahvasti
 * loppukatselmuksen allekirjoituksessa, eikä uutta tunnistautumista pyydetä —
 * se olisi este, joka jättäisi todistukset syntymättä.
 *
 * Sinetöinti tekee eri asian: se kiinnittää asiakirjan sisällön. Sinetti
 * rikkoutuu, jos yhtäkin tavua muutetaan, ja aitouden voi tarkistaa
 * tiivisteellä ilman että kenenkään tarvitsee luottaa Reilusoppariin.
 *
 * TODISTUS SYNTYY AINA
 *
 * Sinetöinti tapahtuu vaiheessa `sealable`: arvio annettu ja vastineen
 * määräaika ohi, tai arviota ei annettu ja sen määräaika ohi. Kumpikaan
 * osapuoli ei voi estää todistuksen syntymistä tekemättä mitään.
 * ===========================================================================
 */

import { createElement } from "react";
import { TenancyCertificate, type CertificateData } from "@/documents/TenancyCertificate";
import { renderDocumentPdf } from "@/documents/render";
import { getServiceClient } from "../db/supabase";
import { collectStats, listCertificates } from "../db/certificates";
import { getTenancy, getTenancyProperty } from "../db/tenancies";
import { listPartyDetails } from "../tenancy/party-details";
import { assertRealEsinetti, getEsinettiClient } from "../esinetti";
import type { CertificateFor } from "./rules";

export type SealResult =
  | { ok: true; sha256: string }
  | { ok: false; message: string };

/**
 * Aitoustarkistuksen osoite.
 *
 * ===========================================================================
 * OSOITTEESSA EI OLE ASIAKIRJAN OMAA TIIVISTETTÄ
 *
 * Ensimmäinen versio yritti laittaa QR-koodiin osoitteen, jossa oli
 * asiakirjan oma tiiviste. Se on mahdotonta: tiiviste lasketaan sisällöstä,
 * johon QR-koodi kuuluu — sisältö riippuisi omasta tiivisteestään.
 *
 * Osoitteessa ei myöskään voi olla todistuksen tunnistetta: silloin kuka
 * tahansa linkin nähnyt pääsisi lukemaan todistuksen ilman jakolinkkiä.
 *
 * QR vie siis tarkistussivulle, jolla tiiviste syötetään. Se on askel
 * enemmän, mutta se on ainoa tapa, jossa tarkistus ei vaadi luottamusta
 * Reilusopparin linkkeihin. Todistuksen jakaminen tapahtuu erikseen
 * mitätöitävällä jakolinkillä.
 * ===========================================================================
 */
function verifyUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.reilusoppari.fi";
  return new URL("/todistus/tarkista", base).toString();
}

/**
 * Sinetöi yhden todistuksen.
 *
 * Asiakirja renderöidään tässä hetkessä tilastoineen ja arvioineen, ja
 * sinetöity tiedosto ladataan omaan Storageen — eSinetin latauslinkki
 * vanhenee, eikä arkistoon saa jäädä viittausta toisen palvelun tiedostoon.
 */
export async function sealCertificate(
  userId: string,
  tenancyId: string,
  forRole: CertificateFor,
  now: Date = new Date(),
): Promise<SealResult> {
  const certificates = await listCertificates(userId, tenancyId, now);
  const certificate = certificates.find((row) => row.forRole === forRole);

  if (!certificate) return { ok: false, message: "Todistusta ei löytynyt." };
  if (certificate.stage === "sealed") {
    return { ok: false, message: "Todistus on jo sinetöity." };
  }
  if (certificate.stage !== "sealable") {
    return {
      ok: false,
      message:
        certificate.stage === "not_ready"
          ? "Loppukatselmus on allekirjoitettava ensin."
          : "Todistus odottaa vielä arviota tai vastinetta.",
    };
  }

  assertRealEsinetti();

  const [tenancy, property, parties, stats] = await Promise.all([
    getTenancy(userId, tenancyId),
    getTenancyProperty(userId, tenancyId),
    listPartyDetails(userId, tenancyId),
    collectStats(tenancyId),
  ]);

  if (!tenancy || !property) return { ok: false, message: "Vuokrasuhteen tietoja puuttuu." };

  const subject = parties.find((party) => party.role === forRole);
  const issuer = parties.find((party) => party.role !== forRole);

  const sealedDate = now.toISOString().slice(0, 10);

  const data: CertificateData = {
    for: forRole,
    subjectName: subject?.name ?? "",
    issuerName: issuer?.name
      ? `${issuer.name}, ${forRole === "tenant" ? "vuokranantaja" : "vuokralainen"}`
      : "",
    property: {
      street: property.street,
      postalCode: property.postalCode,
      city: property.city,
    },
    startDate: tenancy.startDate ?? sealedDate,
    endDate: tenancy.endDate ?? sealedDate,
    rating: certificate.rating,
    comment: certificate.comment,
    reply: certificate.reply,
    stats,
    verifyUrl: verifyUrl(),
    sealedDate,
  };

  const rendered = await renderDocumentPdf(createElement(TenancyCertificate, { data }));

  let sealed;
  try {
    sealed = await getEsinettiClient().sealDocument({
      name: `Vuokratodistus-${forRole === "tenant" ? "vuokralainen" : "vuokranantaja"}.pdf`,
      pdfBytes: rendered.bytes,
      reason: "Vuokratodistus",
      metadata: {
        tenancyId,
        forRole,
        // Ei nimiä eikä tunnisteita: metadata upotetaan asiakirjaan pysyvästi.
        months: stats.months,
      },
    });
  } catch (err) {
    console.error(
      "[todistukset] sinetöinti epäonnistui:",
      err instanceof Error ? err.message : err,
    );
    return { ok: false, message: "Sinetöinti ei onnistunut." };
  }

  const supabase = getServiceClient();
  const path = `${tenancyId}/todistus-${forRole}.pdf`;

  let bytes: Uint8Array;
  try {
    const response = await fetch(sealed.downloadUrl);
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    console.error("[todistukset] sinetöidyn asiakirjan lataus epäonnistui");
    return { ok: false, message: "Sinetöity todistus ei latautunut." };
  }

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    console.error("[todistukset] tallennus epäonnistui:", uploadError.message);
    return { ok: false, message: "Todistuksen tallennus epäonnistui." };
  }

  const timestamp = now.toISOString();

  await supabase
    .from("rs_certificates")
    .update({
      stats,
      sealed_sha256: sealed.sealedSha256,
      sealed_path: path,
      sealed_at: timestamp,
      updated_at: timestamp,
    })
    .eq("id", certificate.id);

  /*
    Vuokrasuhde on `certified`, kun MOLEMMAT todistukset on sinetöity.

    Yksi sinetöity todistus ei riitä: toisen osapuolen todistus on yhtä lailla
    osa päättymistä, eikä tila saa näyttää valmiilta ennen kuin se on.
  */
  const after = await listCertificates(userId, tenancyId, now);
  if (after.every((row) => row.sealedAt || row.id === certificate.id)) {
    await supabase
      .from("rs_tenancies")
      .update({ status: "certified", updated_at: timestamp })
      .eq("id", tenancyId)
      .eq("status", "ended");
  }

  return { ok: true, sha256: sealed.sealedSha256 };
}

/** Aitoustarkistuksen osoite ulospäin. */
export { verifyUrl };
