/**
 * Verolaskelman renderöinti ja sinetöinti (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * MIKSI LASKELMA SINETÖIDÄÄN
 *
 * Laskelma tehdään keväällä ja luvut siirretään OmaVeroon. Jos verottaja
 * kysyy niistä kolmen vuoden päästä, vuokranantajan on voitava näyttää sama
 * laskelma, jonka hän silloin teki — ei uudelleen laskettua, joka on ehtinyt
 * muuttua uusien kirjausten myötä.
 *
 * Sinetti tekee juuri sen: se kiinnittää sisällön ja rikkoutuu, jos yhtäkin
 * tavua muutetaan. Se ei todista, että luvut ovat oikein — sitä ei todista
 * mikään — vaan että ne ovat samat kuin silloin.
 *
 * KUITIT EIVÄT OLE LASKELMAN SISÄLLÄ
 *
 * CLAUDE.md 5.7 sanoo ”liitteenä kuitit”. Toteutin sen niin, että kuitit
 * säilyvät sovelluksessa ja laskelmassa kerrotaan niiden määrä — ne EIVÄT
 * ole upotettuina sinetöityyn PDF:ään. Kaksi syytä:
 *
 * 1. Vuoden kuitit ovat helposti 50 kuvaa. Upotettuna se on kymmeniä
 *    megatavuja, mikä ei mahdu `documents`-ämpäriin eikä ole kenenkään
 *    ladattavissa järkevästi.
 * 2. Verohallinto ei pyydä kuitteja veroilmoituksen liitteeksi. Ne on
 *    säilytettävä ja esitettävä pyydettäessä — juuri sen sovellus tekee.
 *
 * Tämä on poikkeama CLAUDE.md:n sanamuodosta, ja se on kirjattu
 * DECISIONS.md:hen. Jukka voi linjata toisin; silloin kuiteista tarvitaan
 * oma pienoiskuvakoko, koska kuitin tekstin on pysyttävä luettavana.
 * ===========================================================================
 */

import { createElement } from "react";
import { TaxReport, type TaxReportData, type TaxReportLine } from "@/documents/TaxReport";
import { renderDocumentPdf } from "@/documents/render";
import { CATEGORY_GUIDANCE, CLOSING_NOTE, DISCLAIMER } from "@content/tax-guidance.fi";
import { getServiceClient } from "../db/supabase";
import { requireExpenseAccess } from "../db/access";
import { getProperty } from "../db/properties";
import { collectTaxReport, saveSealedReport } from "../db/tax-reports";
import { assertRealEsinetti, getEsinettiClient } from "../esinetti";
import { isEmpty, type TaxReport as TaxReportNumbers } from "./report";

export type TaxSealResult =
  | { ok: true; sha256: string }
  | { ok: false; message: string };

/**
 * Kokoaa asiakirjan tiedot laskelmasta.
 *
 * Erillinen funktio, jotta esikatselu ja sinetöinti piirtävät varmasti saman
 * asiakirjan: jos nämä olisi kaksi koodipolkua, esikatselu voisi näyttää
 * muuta kuin mitä sinetöidään.
 */
export async function buildTaxReportData(
  userId: string,
  propertyId: string,
  year: number,
  now: Date = new Date(),
): Promise<TaxReportData | null> {
  const [property, numbers, receiptCount, ownerName] = await Promise.all([
    getProperty(userId, propertyId),
    collectTaxReport(userId, propertyId, year),
    countReceipts(userId, propertyId, year),
    lookupOwnerName(userId),
  ]);

  if (!property) return null;

  return {
    year,
    property: {
      street: property.street,
      postalCode: property.postalCode,
      city: property.city,
    },
    ownerName,
    rentalIncome: numbers.rentalIncome,
    incomeMonths: numbers.incomeMonths,
    annualLines: toLines(numbers, true),
    annualExpenses: numbers.annualExpenses,
    otherLines: toLines(numbers, false),
    otherEntries: numbers.otherEntries,
    net: numbers.net,
    receiptCount,
    disclaimer: DISCLAIMER,
    closingNote: CLOSING_NOTE,
    date: now.toISOString().slice(0, 10),
  };
}

/**
 * Omistajan nimi asiakirjaan.
 *
 * Luetaan `rs_users`:sta eikä vuokrasuhteen osapuoliriviltä: laskelma on
 * asunnon eikä yhden vuokrasuhteen, ja vuodessa voi olla kaksi eri
 * vuokrasuhdetta. Tyhjä nimi jätetään tyhjäksi — keksitty nimi asiakirjassa
 * olisi pahempi kuin puuttuva.
 */
async function lookupOwnerName(userId: string): Promise<string> {
  const { data } = await getServiceClient()
    .from("rs_users")
    .select("name")
    .eq("id", userId)
    .maybeSingle();

  return ((data as { name: string | null } | null)?.name ?? "").trim();
}

/** Laskelman rivit asiakirjan muotoon, ohjetekstit mukaan. */
function toLines(numbers: TaxReportNumbers, annual: boolean): TaxReportLine[] {
  return numbers.lines
    .filter((line) => line.deductibleAnnually === annual)
    .map((line) => ({
      label: line.label,
      count: line.count,
      recurringMonths: line.recurringMonths,
      total: line.total,
      km: line.km,
      // Vain `note` tulee asiakirjaan, ei `short`: lyhyt ohje on
      // käyttöliittymän apu kirjaushetkellä, ja asiakirjassa se olisi
      // toistoa. `note` on olemassa vain siellä, missä on tavallinen
      // väärinkäsitys — ja juuri se kuuluu paperille.
      note: CATEGORY_GUIDANCE[line.category].note,
    }));
}

/** Kuittien määrä vuodelta. Kuitit eivät tule asiakirjaan, vain luku. */
async function countReceipts(
  userId: string,
  propertyId: string,
  year: number,
): Promise<number> {
  await requireExpenseAccess(userId, propertyId);

  const supabase = getServiceClient();

  const { data: expenses } = await supabase
    .from("rs_expenses")
    .select("id")
    .eq("property_id", propertyId)
    .gte("date", `${year}-01-01`)
    .lte("date", `${year}-12-31`);

  const ids = ((expenses ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (ids.length === 0) return 0;

  const { count } = await supabase
    .from("rs_photos")
    .select("id", { count: "exact", head: true })
    .in("expense_id", ids);

  return count ?? 0;
}

/**
 * Renderöi ja sinetöi vuoden laskelman.
 *
 * Uudelleensinetöinti on sallittu: kirjaus voi puuttua tai olla väärässä
 * luokassa, ja korjattu laskelma on parempi kuin väärä. Vanha tiedosto
 * korvautuu (`upsert`), koska kahden ristiriitaisen laskelman säilyttäminen
 * samalta vuodelta olisi pahempi ongelma kuin yhden korvaaminen.
 */
export async function sealTaxReport(
  userId: string,
  propertyId: string,
  year: number,
  now: Date = new Date(),
): Promise<TaxSealResult> {
  const numbers = await collectTaxReport(userId, propertyId, year);

  if (isEmpty(numbers)) {
    return {
      ok: false,
      message: "Vuodelle ei ole kirjattu tuloja eikä kuluja. Laskelmassa ei olisi mitään.",
    };
  }

  const data = await buildTaxReportData(userId, propertyId, year, now);
  if (!data) return { ok: false, message: "Asuntoa ei löytynyt." };

  assertRealEsinetti();

  const rendered = await renderDocumentPdf(createElement(TaxReport, { data }));

  let sealed;
  try {
    sealed = await getEsinettiClient().sealDocument({
      name: `Verolaskelma-${year}.pdf`,
      pdfBytes: rendered.bytes,
      reason: "Vuokratulon yhteenveto",
      metadata: {
        // Ei osoitetta eikä nimeä: metadata upotetaan asiakirjaan pysyvästi.
        year,
        propertyId,
      },
    });
  } catch (err) {
    console.error("[verolaskelma] sinetöinti epäonnistui:", err instanceof Error ? err.message : err);
    return { ok: false, message: "Sinetöinti ei onnistunut." };
  }

  let bytes: Uint8Array;
  try {
    const response = await fetch(sealed.downloadUrl);
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    console.error("[verolaskelma] sinetöidyn asiakirjan lataus epäonnistui");
    return { ok: false, message: "Sinetöity laskelma ei latautunut." };
  }

  const path = `verolaskelmat/${propertyId}/${year}.pdf`;

  const { error } = await getServiceClient()
    .storage.from("documents")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });

  if (error) {
    console.error("[verolaskelma] tallennus epäonnistui:", error.message);
    return { ok: false, message: "Laskelman tallennus epäonnistui." };
  }

  await saveSealedReport({
    propertyId,
    year,
    report: numbers,
    sealedPath: path,
    sealedSha256: sealed.sealedSha256,
    now,
  });

  return { ok: true, sha256: sealed.sealedSha256 };
}
