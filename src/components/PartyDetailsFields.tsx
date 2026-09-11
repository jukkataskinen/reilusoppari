"use client";

import { useId, useState } from "react";
import type { PartyDetailsView } from "@/lib/tenancy/party-details";

/**
 * Osapuolen tunnistetiedot: nimi, henkilö- tai y-tunnus, puhelin, sähköposti.
 *
 * ===========================================================================
 * SAMA LOMAKE KAHDESSA PAIKASSA
 *
 * Näitä kenttiä tarvitaan sekä omissa perustiedoissa että vuokrasuhteen
 * osapuolissa. Kenttien nimet ja validointi ovat samat, joten ne ovat täällä
 * kerran: kaksi kopiota eroaisi toisistaan ensimmäisen muutoksen jälkeen.
 *
 * TUNNUS EI TULE SELAIMEEN VALMIIKSI TÄYTETTYNÄ
 *
 * `identifierMasked` on peitetty (131052-***T), eikä sitä voi käyttää kentän
 * oletusarvona — muuten tallennus kirjoittaisi tähtimerkit kantaan. Kenttä on
 * siis tyhjä, ja tallennettu tunnus näytetään sen vieressä. Tyhjä kenttä ei
 * tarkoita, että tunnus olisi poistettu: se pyyhitään vain, jos käyttäjä
 * rastittaa sen erikseen.
 * ===========================================================================
 */
export function PartyDetailsFields({
  details,
  errors,
  prefix = "",
  nameLabel = "Nimi",
}: {
  details: PartyDetailsView;
  errors: Record<string, string>;
  prefix?: string;
  nameLabel?: string;
}) {
  const [isCompany, setIsCompany] = useState(details.partyType === "yritys");
  const domId = useId();

  const field = (name: string) => {
    const error = errors[name];
    return {
      id: `${domId}-${name}`,
      name: `${prefix}${name}`,
      "aria-invalid": error ? true : undefined,
      className:
        "mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border bg-paper px-3 text-base " +
        (error ? "border-coral" : "border-line"),
    };
  };

  const FieldError = ({ name }: { name: string }) =>
    errors[name] ? <p className="mt-1.5 text-sm text-coral">{errors[name]}</p> : null;

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="text-sm font-medium">Osapuoli on</legend>
        <div className="flex gap-2">
          {(
            [
              ["henkilo", "Yksityishenkilö"],
              ["yritys", "Yritys tai yhteisö"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={
                "flex min-h-[var(--size-touch)] flex-1 cursor-pointer items-center justify-center rounded-full border px-4 text-sm " +
                (isCompany === (value === "yritys")
                  ? "border-ink bg-ink text-paper"
                  : "border-line bg-paper")
              }
            >
              <input
                type="radio"
                name={`${prefix}partyType`}
                value={value}
                defaultChecked={details.partyType === value}
                onChange={() => setIsCompany(value === "yritys")}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${domId}-name`} className="text-sm font-medium">
          {isCompany ? "Yrityksen nimi" : nameLabel}
        </label>
        <input {...field("name")} defaultValue={details.name ?? ""} autoComplete="name" />
        <FieldError name="name" />
      </div>

      {isCompany ? (
        <>
          <div>
            <label htmlFor={`${domId}-businessId`} className="text-sm font-medium">
              Y-tunnus
            </label>
            <input
              {...field("businessId")}
              defaultValue={details.businessId ?? ""}
              placeholder="1234567-8"
              inputMode="numeric"
            />
            <FieldError name="businessId" />
          </div>

          <div>
            <label htmlFor={`${domId}-signatoryName`} className="text-sm font-medium">
              Allekirjoittaja
            </label>
            <input {...field("signatoryName")} defaultValue={details.signatoryName ?? ""} />
            <p className="mt-1.5 text-sm text-ink/60">
              Yritys ei allekirjoita itse. Kerro kuka tekee sen sen puolesta.
            </p>
            <FieldError name="signatoryName" />
          </div>
        </>
      ) : (
        <div>
          <label htmlFor={`${domId}-personalId`} className="text-sm font-medium">
            Henkilötunnus
          </label>
          <input
            {...field("personalId")}
            defaultValue=""
            placeholder={details.identifierMasked ? "Tallennettu" : "010190-123A"}
            autoComplete="off"
            spellCheck={false}
          />
          {details.identifierMasked ? (
            <>
              <p className="mt-1.5 text-sm text-ink/60">
                Tallennettu: {details.identifierMasked}. Jätä kenttä tyhjäksi, jos se on oikein.
              </p>
              {/*
                Tyhjä kenttä tarkoittaa "säilytä". Poistaminen on siksi oma
                valintansa: muuten kerran tallennettua tunnusta ei saisi pois
                muuten kuin kirjoittamalla tilalle toinen.
              */}
              <label className="mt-2 flex min-h-[var(--size-touch)] items-center gap-3">
                <input
                  type="checkbox"
                  name={`${prefix}clearPersonalId`}
                  className="size-5"
                />
                <span className="text-sm">Poista tallennettu henkilötunnus</span>
              </label>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-ink/60">
              Tarvitaan sopimukseen, jotta osapuolet ovat yksilöitävissä. Näkyy vain sinulle ja
              toiselle osapuolelle — tallennetaan salattuna.
            </p>
          )}
          <FieldError name="personalId" />
        </div>
      )}

      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="flex-1">
          <label htmlFor={`${domId}-phone`} className="text-sm font-medium">
            Puhelin
          </label>
          <input
            {...field("phone")}
            defaultValue={details.phone ?? ""}
            type="tel"
            autoComplete="tel"
            placeholder="040 123 4567"
          />
          <FieldError name="phone" />
        </div>

        <div className="flex-1">
          <label htmlFor={`${domId}-email`} className="text-sm font-medium">
            Sähköposti
          </label>
          <input
            {...field("email")}
            defaultValue={details.email ?? ""}
            type="email"
            autoComplete="email"
          />
          <FieldError name="email" />
        </div>
      </div>

      {/*
        Maksutili vain vuokranantajalle. Vuokralaisen riville kirjattu tili
        päätyisi sopimuksessa kohtaan, jossa kerrotaan minne vuokra maksetaan.
      */}
      {details.role === "landlord" ? (
        <div>
          <label htmlFor={`${domId}-bankAccount`} className="text-sm font-medium">
            Tilinumero
          </label>
          <input
            {...field("bankAccount")}
            defaultValue={details.bankAccount ?? ""}
            placeholder="FI21 1234 5600 0007 85"
            spellCheck={false}
          />
          <p className="mt-1.5 text-sm text-ink/60">
            Tälle tilille vuokra maksetaan. Numero tulee sopimukseen, jottei sitä tarvitse kysyä
            erikseen ensimmäisen vuokran kohdalla.
          </p>
          <FieldError name="bankAccount" />
        </div>
      ) : null}
    </div>
  );
}
