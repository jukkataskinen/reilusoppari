"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signNowAction } from "@/app/vuokrasuhteet/signing-actions";
import { isCompletionMessage } from "@/lib/esinetti/embed-message";

/**
 * "Allekirjoita nyt": vuokranantaja allekirjoittaa heti, ilman sähköpostia
 * (Jukan havainto 10.10.2026).
 *
 * ===========================================================================
 * AINA UUSI IKKUNA, EI SAMA
 *
 * Allekirjoitus avautuu eSinetin upotuksena (`/sign/<token>?embed=1`) omaan
 * ikkunaansa. Pankkien sivut eivät toimi kehyksessä, ja kotinäytölle
 * asennetussa sovelluksessa ei ole takaisin-painiketta: samaan ikkunaan
 * avattu pankkisivu jättäisi käyttäjän jumiin (sama syy kuin PDF-linkeissä
 * 10.10.2026).
 *
 * IKKUNA AVATAAN HETI PAINALLUKSESTA
 *
 * Linkki haetaan palvelimelta vasta painalluksen jälkeen. Jos ikkuna
 * avattaisiin vasta sen jälkeen, selain pitäisi sitä ponnahdusikkunana ja
 * estäisi sen. Siksi tyhjä ikkuna avataan heti ja ohjataan osoitteeseen,
 * kun se on saatu. eSinetin oma `esinetti.js` avaa ikkunan itse, joten sitä
 * ei voi käyttää tässä järjestyksessä; sama protokolla toteutetaan suoraan.
 *
 * Jos selain estää ikkunan silti, näytetään linkki, jota painamalla se
 * aukeaa uuteen ikkunaan.
 *
 * TILA PÄIVITTYY KAHTA TIETÄ
 *
 * eSinetti ilmoittaa valmistumisesta viestillä (`esinetti:completed`), kun
 * Reilusopparin osoite on sen sallituissa domaineissa. Viesti hyväksytään
 * vain eSinetin originista. Varalla sivu päivittyy aina, kun käyttäjä palaa
 * siihen: kotinäytön sovelluksessa viesti ei välttämättä kulje.
 * ===========================================================================
 */
export function SignNow({
  tenancyId,
  kind,
  esinettiOrigin,
}: {
  tenancyId: string;
  kind: "sopimus" | "katselmus";
  esinettiOrigin: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isCompletionMessage(event.origin, event.data, esinettiOrigin)) return;
      setCompleted(true);
      setFallbackUrl(null);
      router.refresh();
    }
    function onVisible() {
      if (document.visibilityState === "visible") router.refresh();
    }
    window.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [esinettiOrigin, router]);

  async function start() {
    setMessage(null);
    setFallbackUrl(null);
    setPending(true);

    const popup = window.open("", "esinetti-allekirjoitus", "width=480,height=760");

    let result: { url?: string; message?: string };
    try {
      result = await signNowAction(tenancyId, kind);
    } catch {
      result = {};
    }
    setPending(false);

    if (!result.url) {
      popup?.close();
      setMessage(
        result.message ??
          "Allekirjoitusta ei voitu avata sovelluksessa. Allekirjoituslinkki on myös sähköpostissasi.",
      );
      return;
    }

    if (popup && !popup.closed) {
      popup.location.replace(result.url);
    } else {
      setFallbackUrl(result.url);
    }
  }

  if (completed) {
    return (
      <p className="mt-5 rounded-[10px] border border-line bg-canvas p-3 text-sm text-ink/70">
        Allekirjoituksesi on vastaanotettu. Tila päivittyy tälle sivulle hetken kuluttua.
      </p>
    );
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-6 font-medium text-paper disabled:opacity-50"
      >
        {pending ? "Avataan…" : "Allekirjoita nyt"}
      </button>
      <p className="mt-2 text-sm text-ink/70">
        Allekirjoitus avautuu omaan ikkunaansa. Tunnistaudu pankkitunnuksilla tai
        mobiilivarmenteella ja palaa sitten tähän.
      </p>

      {fallbackUrl ? (
        <p className="mt-3 text-sm">
          Selain esti ikkunan.{" "}
          {/* rel="opener": eSinetin sivu ilmoittaa valmistumisesta avaajalle. */}
          <a
            href={fallbackUrl}
            target="_blank"
            rel="opener"
            className="underline underline-offset-4"
            onClick={() => setFallbackUrl(null)}
          >
            Avaa allekirjoitus
          </a>
        </p>
      ) : null}

      {message ? (
        <p role="alert" className="mt-3 text-sm text-coral">
          {message}
        </p>
      ) : null}
    </div>
  );
}
