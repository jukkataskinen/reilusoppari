/**
 * Omien tietojen vienti (CLAUDE.md kohta 2 ja 6).
 *
 * ===========================================================================
 * MITÄ PAKETTIIN TULEE
 *
 * Se, mitä käyttäjä näkee sovelluksessa: omat tiedot, vuokrasuhteet
 * osapuolineen, vuokrahistoria, huoltokirja, katselmusten kuvat ja
 * allekirjoitetut asiakirjat. Vuokranantajalle lisäksi asuntojen kulut ja
 * kuitit.
 *
 * Rajaus on sama kuin näkymissä: jokainen haku kulkee osapuolitarkistuksen
 * läpi. Vienti ei ole oikotie sen ohi — se on sama tieto toisessa muodossa.
 *
 * HENKILÖTUNNUS TULEE PEITETTYNÄ
 *
 * Vaikka se on käyttäjän omaa tietoa ja hän on siihen oikeutettu, paketti
 * päätyy lataushakemistoon salaamattomana. Kokonainen tunnus siellä olisi
 * uusi riski ilman uutta hyötyä: käyttäjä tietää oman tunnuksensa jo, ja
 * kokonaisena se on sopimuksessa, joka on paketissa mukana. Tämä on
 * kirjattava tietosuojaselosteeseen.
 *
 * PAKETTI KOOTAAN MUISTISSA
 *
 * Se rajaa koon: muutaman sadan kuvan vuokrasuhde on kymmeniä megatavuja, ja
 * sitä isompi tili voi osua funktion aika- tai muistirajaan. Raja on
 * tiedossa ja kirjattu (DECISIONS.md); jos siihen törmätään, ratkaisu on
 * pakettien jakaminen vuokrasuhteittain eikä muistin kasvattaminen.
 * ===========================================================================
 */

import { listTenancies, listParties, getTenancyProperty } from "../db/tenancies";
import { listRentPeriods } from "../db/rent";
import { listMaintenanceEntries } from "../db/maintenance";
import { listInspectionPhotos, findInspection, downloadPhoto } from "../db/inspections";
import { listProperties } from "../db/properties";
import { listPropertyExpenses } from "../db/expenses";
import { listRecurringExpenses } from "../db/recurring-expenses";
import { listPartyDetails } from "../tenancy/party-details";
import { getServiceClient } from "../db/supabase";
import { safeName, type ZipEntry } from "./zip";

/** Montako tiedostoa ladataan yhtä aikaa Storagesta. */
const SAMANAIKAISIA = 8;

function json(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value, null, 2));
}

function teksti(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/**
 * Lukuohje paketin juureen.
 *
 * Zip-paketti, jossa on pelkkiä JSON-tiedostoja, on kirjanpitäjälle
 * käyttökelpoinen ja kaikille muille läpinäkymätön. Ohje kertoo mitä missäkin
 * on ja mitä paketista tarkoituksella puuttuu.
 */
function lukuohje(now: Date): string {
  return [
    "OMAT TIEDOT REILUSOPPARISTA",
    "",
    `Paketti on koottu ${now.toLocaleDateString("fi-FI")}.`,
    "",
    "MITÄ TÄSSÄ ON",
    "",
    "  omat-tiedot.json       Nimesi, sähköpostisi ja tilisi perustiedot.",
    "  vuokrasuhteet/         Kansio jokaisesta vuokrasuhteestasi:",
    "                           vuokrasuhde.json  osapuolet, vuokra, vakuus",
    "                           vuokrat.json      kuittaukset kuukausittain",
    "                           huoltokirja.json  viat, korjaukset, kommentit",
    "                           asiakirjat/       allekirjoitetut PDF:t",
    "                           kuvat/            katselmusten kuvat",
    "  asunnot/               Vain jos olet vuokranantaja: kulut ja kuitit.",
    "",
    "MITÄ TÄSSÄ EI OLE",
    "",
    "  Henkilötunnus on peitetty (esimerkiksi 131052-***T). Kokonaisena se on",
    "  vuokrasopimuksessa, joka on tässä paketissa mukana. Näin kokonainen",
    "  tunnus ei jää lataushakemistoon erilliseksi tiedostoksi.",
    "",
    "  Toisen osapuolen yhteystiedot ovat mukana vain siltä osin kuin ne",
    "  näkyvät sinulle sovelluksessakin.",
    "",
    "KUVIEN AITOUS",
    "",
    "  Jokaisesta kuvasta on tiiviste (sha256) vuokrasuhteen tiedoissa. Sillä",
    "  voi osoittaa, että kuva on sama kuin katselmuksessa tallennettu.",
    "",
    "Tämä paketti on sinun. Säilytä se huolellisesti: siinä on tietoja",
    "kodistasi ja sopimuksistasi.",
    "",
  ].join("\n");
}

/** Ajaa `fn`:n enintään `size` kerrallaan, järjestys säilyttäen. */
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return results;
}

/** Lataa asiakirjan `documents`-ämpäristä. `null`, jos sitä ei saada. */
async function downloadDocument(path: string): Promise<Uint8Array | null> {
  const { data, error } = await getServiceClient().storage.from("documents").download(path);

  if (error || !data) {
    console.error("[vienti] asiakirjan lataus epäonnistui:", error?.message);
    return null;
  }

  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Kokoaa käyttäjän tiedot paketin merkinnöiksi.
 *
 * Yksittäisen osan epäonnistuminen ei kaada vientiä: puuttuva kuva jää pois
 * ja muut tulevat mukaan. Tyhjä paketti olisi käyttäjälle huonompi
 * lopputulos kuin epätäydellinen.
 */
export async function collectUserData(
  userId: string,
  now: Date = new Date(),
): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [
    { name: "LUEMINUT.txt", bytes: teksti(lukuohje(now)) },
  ];

  const { data: user } = await getServiceClient()
    .from("rs_users")
    .select("email, name, phone, birthdate, identity_verified_at, locale, created_at")
    .eq("id", userId)
    .maybeSingle();

  entries.push({
    name: "omat-tiedot.json",
    bytes: json({
      ...(user ?? {}),
      huomautus:
        "Henkilötunnus on tallennettu salattuna eikä sitä anneta tässä kokonaisena. " +
        "Se on vuokrasopimuksessa, joka on paketissa mukana.",
    }),
  });

  /* --- Vuokrasuhteet --------------------------------------------------- */

  const tenancies = await listTenancies(userId);

  for (const tenancy of tenancies) {
    const property = await getTenancyProperty(userId, tenancy.id);
    const kansio = `vuokrasuhteet/${safeName(
      property ? `${property.street} ${tenancy.startDate ?? ""}`.trim() : tenancy.id,
    )}`;

    const [parties, details, rent, maintenance] = await Promise.all([
      listParties(userId, tenancy.id),
      listPartyDetails(userId, tenancy.id),
      listRentPeriods(userId, tenancy.id),
      listMaintenanceEntries(userId, tenancy.id),
    ]);

    entries.push({
      name: `${kansio}/vuokrasuhde.json`,
      bytes: json({
        vuokrasuhde: tenancy,
        asunto: property,
        // `listPartyDetails` peittää tunnisteen aina (`party-details.ts`).
        osapuolet: details,
        kutsut: parties,
      }),
    });

    entries.push({ name: `${kansio}/vuokrat.json`, bytes: json(rent) });
    entries.push({ name: `${kansio}/huoltokirja.json`, bytes: json(maintenance) });

    /* --- Katselmusten kuvat -------------------------------------------- */

    for (const kind of ["initial", "final"] as const) {
      let photos;
      try {
        /*
          `findInspection` eikä `getOrCreateInspection`.

          Vienti on lukeva toiminto: se ei saa luoda tyhjää loppukatselmusta
          vuokrasuhteelle, jolla sitä ei ole. Käyttäjä näkisi näkymässä
          alkaneen katselmuksen, jota kukaan ei ole aloittanut.
        */
        const inspection = await findInspection(userId, tenancy.id, kind);
        if (!inspection) continue;

        photos = await listInspectionPhotos(userId, tenancy.id, inspection.id);
      } catch {
        continue;
      }

      if (photos.length === 0) continue;

      const nimi = kind === "initial" ? "alkukatselmus" : "loppukatselmus";

      entries.push({
        name: `${kansio}/kuvat/${nimi}/tiedot.json`,
        bytes: json(
          photos.map((photo) => ({
            tiedosto: `${photo.id}.jpg`,
            huone: photo.room,
            selite: photo.note,
            kuvaaja: photo.uploaderName,
            rooli: photo.uploaderRole,
            vastaanotettu: photo.takenAtServer,
            sha256: photo.sha256,
          })),
        ),
      });

      const ladatut = await inBatches(photos, SAMANAIKAISIA, async (photo) => ({
        photo,
        bytes: await downloadPhoto(photo.storagePath),
      }));

      for (const { photo, bytes } of ladatut) {
        // Puuttuva kuva jätetään pois; tiedot.json kertoo silti sen tiivisteen.
        if (!bytes) continue;

        entries.push({
          name: `${kansio}/kuvat/${nimi}/${photo.id}.jpg`,
          bytes,
          // JPEG ei pienene deflatella.
          compress: false,
        });
      }
    }

    /* --- Allekirjoitetut asiakirjat ------------------------------------ */

    const asiakirjat = await sealedDocuments(userId, tenancy.id);

    for (const { nimi, bytes } of asiakirjat) {
      entries.push({ name: `${kansio}/asiakirjat/${nimi}`, bytes, compress: false });
    }
  }

  /* --- Asunnot: vain omistajalle --------------------------------------- */

  const properties = await listProperties(userId);

  for (const property of properties) {
    const kansio = `asunnot/${safeName(property.name ?? property.street)}`;

    entries.push({ name: `${kansio}/asunto.json`, bytes: json(property) });

    try {
      const [expenses, recurring] = await Promise.all([
        listPropertyExpenses(userId, property.id),
        listRecurringExpenses(userId, property.id),
      ]);

      entries.push({ name: `${kansio}/kulut.json`, bytes: json(expenses) });
      entries.push({ name: `${kansio}/toistuvat-kulut.json`, bytes: json(recurring) });

      const kuitit = expenses.flatMap((expense) =>
        expense.receipts.map((receipt) => ({ expense, receipt })),
      );

      const ladatut = await inBatches(kuitit, SAMANAIKAISIA, async (item) => ({
        ...item,
        bytes: await downloadPhoto(item.receipt.storagePath),
      }));

      for (const { expense, receipt, bytes } of ladatut) {
        if (!bytes) continue;
        entries.push({
          name: `${kansio}/kuitit/${expense.date}-${receipt.id}.jpg`,
          bytes,
          compress: false,
        });
      }
    } catch {
      // Ei omistaja: asuntoa ei pitäisi olla listalla lainkaan, mutta
      // epäonnistuminen ei saa kaataa muun paketin kokoamista.
      continue;
    }
  }

  return entries;
}

/** Vuokrasuhteen sinetöidyt asiakirjat, jotka kutsuja saa nähdä. */
async function sealedDocuments(
  userId: string,
  tenancyId: string,
): Promise<Array<{ nimi: string; bytes: Uint8Array }>> {
  const supabase = getServiceClient();

  const [{ data: contract }, { data: inspections }, { data: certificates }] = await Promise.all([
    supabase.from("rs_contracts").select("sealed_path").eq("tenancy_id", tenancyId).maybeSingle(),
    supabase.from("rs_inspections").select("kind, sealed_path").eq("tenancy_id", tenancyId),
    /*
      Vain OMA todistus.

      Toisen osapuolen todistus on hänen omaisuuttaan ja hän päättää kenelle
      se näytetään (CLAUDE.md 5.8). Sen liittäminen tähän pakettiin olisi
      kiertotie sen ympäri.
    */
    supabase
      .from("rs_certificates")
      .select("for_role, sealed_path, rs_tenancies(landlord_user_id)")
      .eq("tenancy_id", tenancyId),
  ]);

  const polut: Array<{ nimi: string; polku: string }> = [];

  const contractPath = (contract as { sealed_path: string | null } | null)?.sealed_path;
  if (contractPath) polut.push({ nimi: "vuokrasopimus.pdf", polku: contractPath });

  for (const row of (inspections ?? []) as Array<{ kind: string; sealed_path: string | null }>) {
    if (!row.sealed_path) continue;
    const nimi = row.kind === "initial" ? "alkukatselmus.pdf" : "loppukatselmus.pdf";
    polut.push({ nimi, polku: row.sealed_path });
  }

  const omaRooli = await ownRole(userId, tenancyId);

  for (const row of (certificates ?? []) as Array<{
    for_role: string;
    sealed_path: string | null;
  }>) {
    if (!row.sealed_path || row.for_role !== omaRooli) continue;
    polut.push({ nimi: "vuokratodistus.pdf", polku: row.sealed_path });
  }

  const ladatut = await inBatches(polut, SAMANAIKAISIA, async (item) => ({
    nimi: item.nimi,
    bytes: await downloadDocument(item.polku),
  }));

  return ladatut.filter(
    (item): item is { nimi: string; bytes: Uint8Array } => item.bytes !== null,
  );
}

/** Kutsujan rooli tässä vuokrasuhteessa. */
async function ownRole(userId: string, tenancyId: string): Promise<string | null> {
  const { data } = await getServiceClient()
    .from("rs_tenancy_parties")
    .select("role")
    .eq("tenancy_id", tenancyId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  return (data as { role: string } | null)?.role ?? null;
}
