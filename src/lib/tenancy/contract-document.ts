/**
 * Sopimuksen tiedot asiakirjaksi (CLAUDE.md 5.1).
 *
 * Yksi paikka, jossa vuokrasuhteen ja sopimuksen data yhdistetään
 * `RentalAgreement`-komponentin odottamaan muotoon. Ilman tätä sama
 * yhdistely toistuisi esikatselussa, allekirjoituskierroksessa ja
 * arkistoinnissa — ja yksi niistä jäisi ennen pitkää jälkeen.
 */

import type { RentalAgreementData } from "@/documents/RentalAgreement";
import { getContractTerms } from "../db/contracts";
import { getTenancy, getTenancyProperty } from "../db/tenancies";

/**
 * Kokoaa sopimuksen asiakirjaa varten. `null` jos kutsuja ei ole osapuoli tai
 * vuokrasuhteesta puuttuu tietoja.
 */
export async function buildRentalAgreementData(
  userId: string,
  tenancyId: string,
): Promise<RentalAgreementData | null> {
  const tenancy = await getTenancy(userId, tenancyId);
  if (!tenancy) return null;

  const [property, terms] = await Promise.all([
    getTenancyProperty(userId, tenancyId),
    getContractTerms(userId, tenancyId),
  ]);

  if (!property) return null;
  if (!tenancy.startDate || !tenancy.rentDueDay || tenancy.rentAmount === null) return null;

  return {
    // Huoneluku ja pinta-ala asunnolta: asiakirja kuvaa kohteen ("2h+k,
    // noin 54 m²"), eikä sitä tarvitse kirjoittaa sopimuslomakkeella
    // uudelleen.
    property,
    landlordName: terms.landlordName ?? "",
    tenantNames: terms.tenantNames,

    startDate: tenancy.startDate,
    endDate: tenancy.endDate,

    rentAmount: tenancy.rentAmount,
    rentDueDay: tenancy.rentDueDay,
    depositAmount: tenancy.depositAmount ?? 0,

    noticePeriodMonths: terms.noticePeriodMonths,
    minimumTermMonths: terms.minimumTermMonths,
    furnished: terms.furnished,
    depositDueDate: terms.depositDueDate,
    waterChargeEur: terms.waterChargeEur,
    waterChargePerPerson: terms.waterChargePerPerson,
    broadbandIncluded: terms.broadbandIncluded,
    insuranceRequired: terms.insuranceRequired,
    rentIncreaseTerm: terms.rentIncreaseTerm,
    keysCount: terms.keysCount,
    smokingAllowed: terms.smokingAllowed,
    petsAllowed: terms.petsAllowed,
    waterIncluded: terms.waterIncluded,
    electricityIncluded: terms.electricityIncluded,
    otherTerms: terms.otherTerms,

    place: property.city,
    /**
     * Esikatselun päiväys on vuokrasuhteen alkupäivä eikä kuluva päivä.
     *
     * Päiväys määrää asiakirjan tiivisteen (`documents/render.ts`). Jos se
     * olisi kuluva päivä, saman sopimuksen esikatselu tuottaisi eri
     * tiivisteen joka päivä — eikä esikatselun ja allekirjoitettavan
     * asiakirjan vertaaminen tarkoittaisi mitään.
     */
    signedDate: tenancy.startDate,
  };
}
