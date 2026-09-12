"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  openPortalAction,
  startPortfolioAction,
  updatePortfolioQuantityAction,
} from "@/app/laskutus/portfolio-actions";
import { formatPrice } from "@/lib/billing/pricing";
import type { PortfolioView } from "@/lib/billing/portfolio";

function paiva(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${Number(day)}.${Number(month)}.${year}`;
}

/**
 * Salkkutilaus (CLAUDE.md 5.9).
 *
 * ===========================================================================
 * VERTAILU NÄYTETÄÄN LUKUINA, EI VÄITTEENÄ
 *
 * "Säästät salkulla" on väite, jonka voi vain uskoa tai olla uskomatta.
 * Molemmat luvut rinnakkain on laskelma, jonka voi tarkistaa — ja josta voi
 * olla eri mieltä, jos tietää suunnitelmistaan jotain, mitä historia ei
 * kerro.
 *
 * Siksi näkymä kertoo myös, MISTÄ luvut tulevat: montako vuokrasuhdetta
 * viime vuonna ja monestako asunnosta laskelma on tulostettu.
 *
 * KUN SALKKU EI KANNATA, SITÄ EI TARJOTA
 *
 * Silloinkin tilanne kerrotaan. Vaihtoehto — jättää koko asia mainitsematta
 * — tarkoittaisi, että käyttäjä kuulee salkusta vasta kun se sattuu olemaan
 * meille edullista.
 * ===========================================================================
 */
export function PortfolioPanel({
  view,
  tenanciesLastYear,
  plusProperties,
  mockMode,
}: {
  view: PortfolioView;
  tenanciesLastYear: number;
  plusProperties: number;
  /** Onko Stripe-yhteys määrittämättä? Silloin mitään ei veloiteta. */
  mockMode: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  /*
    Toiminto palauttaa joko viestin, osoitteen tai ei kumpaakaan.

    Osoite tarkoittaa siirtymää Stripeen: se tehdään selaimessa
    `window.location`illa eikä palvelimen `redirect`illa, koska
    `useTransition`in sisällä jälkimmäisen kulku on epävarma
    (`portfolio-actions.ts`).
  */
  function run(action: () => Promise<{ message?: string; url?: string }>) {
    setMessage(null);

    startTransition(async () => {
      try {
        const result = await action();

        if (result?.url) {
          window.location.href = result.url;
          return;
        }

        if (result?.message) setMessage(result.message);
        else router.refresh();
      } catch {
        // Verkkokatkos tai palvelinvirhe. Nappi vapautuu, ja käyttäjä näkee
        // syyn — hiljainen epäonnistuminen näyttäisi siltä, ettei painallus
        // rekisteröitynyt.
        setMessage("Toiminto ei onnistunut. Yritä hetken kuluttua uudelleen.");
      }
    });
  }

  return (
    <section className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      <h2 className="font-medium">Salkkuhinta</h2>

      {mockMode ? (
        <p className="mt-3 rounded-[10px] border border-coral p-3 text-sm">
          Stripe-yhteyttä ei ole määritetty, joten tilaaminen on
          harjoittelutilassa. Mitään ei veloiteta.
        </p>
      ) : null}

      {/* --- Alle viisi asuntoa ------------------------------------------- */}

      {view.kind === "too_few" ? (
        <>
          <p className="mt-2 text-sm text-ink/70">
            Salkkuhinta on 15 € asunnolta vuodessa, ja se sisältää kaikki vuokrasuhteet ja
            verolaskelmat. Se on tarjolla vähintään viidelle asunnolle.
          </p>
          <p className="mt-3 text-sm text-ink/70">
            Sinulla on {view.properties === 1 ? "yksi asunto" : `${view.properties} asuntoa`}.
            {view.missing === 1
              ? " Yksi lisää, niin salkkuhinta on mahdollinen."
              : ` ${view.missing} lisää, niin salkkuhinta on mahdollinen.`}
          </p>
        </>
      ) : null}

      {/* --- Vertailu ------------------------------------------------------ */}

      {view.kind === "offer" || view.kind === "not_worth_it" ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-ink/60">Salkkuhinta</dt>
              <dd className="mt-0.5 text-xl">{formatPrice(view.portfolioCents)}</dd>
              <dd className="text-sm text-ink/60">
                {view.properties} asuntoa · vuodessa
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink/60">Erikseen maksettuna</dt>
              <dd className="mt-0.5 text-xl">{formatPrice(view.separateCents)}</dd>
              <dd className="text-sm text-ink/60">viime vuoden käytöllä</dd>
            </div>
          </dl>

          {/*
            Mistä vertailuluku tulee. Ilman tätä se olisi luku, jota ei voi
            tarkistaa — ja käyttäjä joko uskoo sen tai ei.
          */}
          <p className="mt-3 text-sm text-ink/60">
            Vertailu perustuu toteutuneeseen vuoteen:{" "}
            {tenanciesLastYear === 1 ? "1 vuokrasuhde" : `${tenanciesLastYear} vuokrasuhdetta`} ja{" "}
            {plusProperties === 1
              ? "1 asunto, josta tulostit verolaskelman"
              : `${plusProperties} asuntoa, joista tulostit verolaskelman`}
            .
          </p>
        </>
      ) : null}

      {view.kind === "not_worth_it" ? (
        <p className="mt-4 rounded-[10px] border border-line bg-canvas p-3 text-sm text-ink/70">
          Salkku ei tällä käytöllä kannata sinulle: maksat erikseen vähemmän. Kerromme sen
          suoraan, koska ehdotus joka maksaa sinulle enemmän ei ole ehdotus. Tilanne voi
          muuttua, jos vuokrasuhteita tulee lisää — tämä näkymä laskee sen uudelleen.
        </p>
      ) : null}

      {view.kind === "offer" ? (
        <>
          <p className="mt-4 text-sm">
            Salkulla säästäisit{" "}
            <span className="font-medium">{formatPrice(view.savingCents)}</span> vuodessa. Hinta
            sisältää kaikki vuokrasuhteet ja verolaskelmat, eikä kertamaksuja tule erikseen.
          </p>

          <button
            type="button"
            onClick={() => run(startPortfolioAction)}
            disabled={pending}
            className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
          >
            {pending ? "Avataan…" : `Tilaa salkku ${formatPrice(view.portfolioCents)} / vuosi`}
          </button>
        </>
      ) : null}

      {/* --- Voimassa oleva tilaus ----------------------------------------- */}

      {view.kind === "active" ? (
        <>
          <p className="mt-2 text-2xl">{formatPrice(view.priceCents)}</p>
          <p className="mt-1 text-sm text-ink/60">
            {view.quantity} asuntoa · vuodessa
            {view.currentPeriodEnd ? ` · uusiutuu ${paiva(view.currentPeriodEnd)}` : ""}
          </p>

          {view.pastDue ? (
            <p className="mt-4 rounded-[10px] border border-coral p-3 text-sm">
              Viimeisin maksu ei mennyt läpi. Tarkista maksutapa asiakasportaalista, niin
              tilaus jatkuu keskeytyksettä.
            </p>
          ) : null}

          {/*
            Asuntomäärän muutosta EI tehdä automaattisesti: se olisi veloitus,
            jota käyttäjä ei ole hyväksynyt.
          */}
          {!view.covered ? (
            <div className="mt-4 rounded-[10px] border border-line bg-canvas p-4">
              <p className="text-sm">
                Sinulla on {view.properties} asuntoa, mutta tilauksesi kattaa {view.quantity}.
                Asunnot tilauksen ulkopuolella laskutetaan vuokrasuhteittain, kunnes päivität
                tilauksen.
              </p>
              <button
                type="button"
                onClick={() => run(updatePortfolioQuantityAction)}
                disabled={pending}
                className="mt-3 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
              >
                {pending ? "Päivitetään…" : `Päivitä tilaus ${view.properties} asuntoon`}
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => run(openPortalAction)}
            disabled={pending}
            className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm disabled:opacity-60"
          >
            {pending ? "Avataan…" : "Laskut ja maksutapa"}
          </button>

          <p className="mt-3 text-sm text-ink/60">
            Laskut, maksutavan vaihto ja tilauksen irtisanominen hoituvat Stripen
            asiakasportaalissa. Korttitietosi eivät tule Reilusopparille.
          </p>
        </>
      ) : null}

      {message ? (
        <p role="alert" className="mt-4 text-sm text-coral">
          {message}
        </p>
      ) : null}
    </section>
  );
}
