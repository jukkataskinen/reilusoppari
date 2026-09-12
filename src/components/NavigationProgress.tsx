"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Ohut palkki yläreunassa sivunvaihdon ajan (Jukan havainto 2026-09-12).
 *
 * ===========================================================================
 * MIKSI TÄMÄ EIKÄ `loading.tsx`
 *
 * Next.js tarjoaa tähän `loading.tsx`-tiedoston, ja se olisi ollut
 * yksinkertaisempi. Kokeilin sitä, ja se rikkoi suojattujen sivujen
 * uudelleenohjauksen: streamattu sivu ei voi enää asettaa vastauksen
 * tilakoodia, joten `/asunnot` palautti kirjautumattomalle 200:n
 * latausnäkymällä eikä 307:ää kirjautumiseen. Suojaus säilyi, mutta vastaus
 * oli huonompi — ja e2e-testi huomasi sen.
 *
 * Tämä toteutus ei koske reittien vastauksiin lainkaan. Se kuuntelee
 * linkkien painalluksia selaimessa ja piilottaa palkin, kun osoite vaihtuu.
 *
 * MITÄ TÄMÄ EI OLE
 *
 * Se ei ole edistymismittari: emme tiedä, kauanko palvelimella kestää.
 * Palkki liikkuu tasaisesti eikä väitä tietävänsä enempää. Sen ainoa
 * tehtävä on vastata kysymykseen "osuiko painallus vai onko tämä jumissa".
 *
 * VARMISTUS: PALKKI EI JÄÄ PÄÄLLE
 *
 * Jos sivunvaihto peruuntuu — käyttäjä painaa takaisin, palvelin ei vastaa —
 * palkki katoaisi muuten ruudulle pysyvästi ja näyttäisi siltä, että sovellus
 * jumitti. Ajastin piilottaa sen viimeistään 15 sekunnin kuluttua.
 * ===========================================================================
 */

/** Viive ennen palkin näyttämistä. Nopea sivunvaihto ei saa välkkyä. */
const VIIVE_MS = 140;

/** Viimeistään tässä ajassa palkki katoaa, vaikka mitään ei tapahtuisi. */
const VARMISTUS_MS = 15_000;

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [nakyy, setNakyy] = useState(false);

  // Osoitteen vaihtuminen tarkoittaa, että uusi sivu on paikallaan.
  useEffect(() => {
    setNakyy(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    let viive: ReturnType<typeof setTimeout> | null = null;
    let varmistus: ReturnType<typeof setTimeout> | null = null;

    function tyhjenna() {
      if (viive) clearTimeout(viive);
      if (varmistus) clearTimeout(varmistus);
      viive = null;
      varmistus = null;
    }

    function onClick(event: MouseEvent) {
      /*
        Ohitetaan painallukset, jotka eivät johda sivunvaihtoon tässä
        välilehdessä: muu kuin vasen nappi, näppäinyhdistelmät (uusi
        välilehti), ja tapahtumat, jotka joku on jo perunut.
      */
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const linkki = (event.target as Element | null)?.closest?.("a");
      if (!(linkki instanceof HTMLAnchorElement)) return;

      if (linkki.target && linkki.target !== "_self") return;
      if (linkki.hasAttribute("download")) return;

      const kohde = new URL(linkki.href, window.location.href);

      // Ulkoinen osoite lataa koko sivun: selain näyttää oman latausilmeensä.
      if (kohde.origin !== window.location.origin) return;

      // Sama sivu: ankkuri tai identtinen osoite ei vaihda näkymää.
      if (kohde.pathname === window.location.pathname && kohde.search === window.location.search) {
        return;
      }

      tyhjenna();
      viive = setTimeout(() => setNakyy(true), VIIVE_MS);
      varmistus = setTimeout(() => setNakyy(false), VARMISTUS_MS);
    }

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      tyhjenna();
    };
  }, []);

  if (!nakyy) return null;

  return (
    <div
      // `aria-hidden`: odotuksesta kertominen kuuluu sivun omalle
      // sisällölle, eikä ruudunlukijan käyttäjä hyödy liikkuvasta palkista.
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-sky/20"
    >
      <div className="h-full w-1/3 animate-[navprogress_1.1s_ease-in-out_infinite] bg-sky" />
    </div>
  );
}
