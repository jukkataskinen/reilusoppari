/**
 * Mitkä asiakirjat lähtevät millekin kierrokselle (Jukan päätös 10.10.2026).
 *
 * ===========================================================================
 * SOPIMUS ENSIN, PÖYTÄKIRJA ERIKSEEN
 *
 * Vuokrasopimus tehdään yleensä ennen muuttoa, ja vuokralainen näkee
 * asunnon viat vasta muuttaessaan. Siksi sopimus allekirjoitetaan heti, kun
 * osapuolten tiedot ovat valmiit, eikä se odota katselmusta.
 *
 * Jos katselmus on jo lukittu sopimusta lähetettäessä, molemmat lähtevät
 * samalla kierroksella: yksi tunnistautuminen on vuokralaiselle helpompi
 * kuin kaksi, ja eSinetin tunnistus maksaa kerran.
 *
 * Muuten pöytäkirja allekirjoitetaan omana kierroksenaan, kun katselmus on
 * lukittu. Omaa kierrosta ei voi lähettää ennen sopimusta, koska silloin
 * sopimuksen lähetys ottaa pöytäkirjan mukaan itse.
 *
 * Säännöt ovat puhtaita funktioita, jotta ne voi testata ilman kantaa.
 * ===========================================================================
 */

export type InspectionStatus = "open" | "locked" | "signed";

export interface InspectionFacts {
  status: InspectionStatus;
  esinettiRoundId: string | null;
}

/** Tuleeko pöytäkirja sopimuksen kanssa samalle kierrokselle? */
export function includeInspectionWithContract(inspection: InspectionFacts | null): boolean {
  return inspection !== null && inspection.status === "locked" && !inspection.esinettiRoundId;
}

export type InspectionRoundBlock =
  | "not_landlord"
  | "contract_not_sent"
  | "inspection_not_locked"
  | "already_sent"
  | "already_signed";

export const INSPECTION_ROUND_MESSAGES: Record<InspectionRoundBlock, string> = {
  not_landlord: "Vain vuokranantaja voi lähettää pöytäkirjan allekirjoitettavaksi.",
  contract_not_sent:
    "Lähetä ensin sopimus allekirjoitettavaksi. Lukittu pöytäkirja lähtee silloin samalla.",
  inspection_not_locked: "Pöytäkirja voidaan allekirjoittaa, kun alkukatselmus on lukittu.",
  already_sent: "Pöytäkirja on jo lähetetty allekirjoitettavaksi.",
  already_signed: "Pöytäkirja on jo allekirjoitettu.",
};

/**
 * Voiko alkukatselmuksen pöytäkirjan lähettää omana kierroksenaan?
 * `null` = voi.
 */
export function inspectionRoundBlock(facts: {
  isLandlord: boolean;
  contractRoundId: string | null;
  inspection: InspectionFacts | null;
}): InspectionRoundBlock | null {
  if (!facts.isLandlord) return "not_landlord";
  const inspection = facts.inspection;
  if (inspection?.status === "signed") return "already_signed";
  if (inspection?.esinettiRoundId) return "already_sent";
  if (!inspection || inspection.status !== "locked") return "inspection_not_locked";
  if (!facts.contractRoundId) return "contract_not_sent";
  return null;
}

/**
 * Onko pöytäkirjalla oma kierros, erillään sopimuksesta?
 *
 * Yhteisellä kierroksella molemmilla riveillä on sama tunniste. Silloin
 * pöytäkirjan tila näytetään sopimuksen kierroksen kautta eikä kahdesti.
 */
export function hasSeparateInspectionRound(
  contractRoundId: string | null,
  inspectionRoundId: string | null,
): boolean {
  return Boolean(inspectionRoundId) && inspectionRoundId !== contractRoundId;
}
