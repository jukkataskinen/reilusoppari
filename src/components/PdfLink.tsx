"use client";

import { useState } from "react";

/**
 * PDF-tallennus kotinäytön sovelluksessa (PLAN.md, Jukan havainnot 11.9. ja
 * 10.10.2026).
 *
 * ===========================================================================
 * KOTINÄYTÖN SOVELLUKSESSA EI OLE PALUUTA
 *
 * `target="_blank"` avaa näkymän, josta ei pääse pois kuin sulkemalla koko
 * sovellus (ei takaisin-nappia). Samaan ikkunaan avautuva lataus vie
 * näkymän pois sieltä mihin käyttäjä jäi. Molemmat ovat umpikuja
 * nimenomaan `display-mode: standalone`issa — selaimessa `target="_blank"`
 * toimii normaalisti, joten se säilyy oletuksena.
 *
 * Siksi kotinäytön sovelluksessa tiedosto haetaan itse ja annetaan
 * puhelimen jakovalikolle (`navigator.share`), joka ei vaihda näkymää
 * lainkaan. Jos jakaminen ei onnistu, pysytään siinä mitä selain tekisi
 * ilman JavaScriptiä: linkki, jolla on `href`, `download` ja
 * `target="_blank"`.
 * ===========================================================================
 */

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

const DEFAULT_CLASS_NAME =
  "inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm";

export function PdfLink({
  href,
  filename,
  className,
  children,
}: {
  href: string;
  filename: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [odottaa, setOdottaa] = useState(false);

  async function jaaTaiLataa(event: React.MouseEvent<HTMLAnchorElement>) {
    if (odottaa || !isStandalone()) return;

    const navigatorWithShare = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
    };
    if (!navigatorWithShare.share || !navigatorWithShare.canShare) return;

    event.preventDefault();
    setOdottaa(true);

    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error("Tiedoston hakeminen epäonnistui.");
      const blob = await response.blob();
      const file = new File([blob], filename, { type: blob.type || "application/pdf" });

      if (!navigatorWithShare.canShare({ files: [file] })) {
        throw new Error("Jakaminen ei ole tuettu.");
      }
      await navigatorWithShare.share({ files: [file] });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      // Jakovalikko ei onnistunut: avataan linkki, kuten ilman jakamista.
      window.open(href, "_blank", "noopener");
    } finally {
      setOdottaa(false);
    }
  }

  return (
    <a
      href={href}
      download={filename}
      target="_blank"
      rel="noopener"
      onClick={jaaTaiLataa}
      aria-disabled={odottaa}
      className={className ?? DEFAULT_CLASS_NAME}
    >
      {odottaa ? "Valmistellaan…" : children}
    </a>
  );
}
