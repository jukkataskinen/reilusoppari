"use client";

import { useEffect, useState } from "react";

/**
 * Ilmoitusten käyttöönotto (CLAUDE.md 5.5).
 *
 * ===========================================================================
 * IPHONE VAATII KOTIVALIKKOON ASENTAMISEN
 *
 * Applen sääntö: selaimessa avattu sivusto ei saa lähettää ilmoituksia
 * lainkaan, vaikka käyttäjä antaisi luvan. Vasta kotivalikkoon lisätty
 * sovellus voi. Siksi iPhonella näytetään ohje eikä nappia — nappi, joka ei
 * voi toimia, on pahempi kuin ei nappia.
 *
 * Ohje näytetään siinä hetkessä, kun ilmoituksilla alkaa olla merkitystä,
 * eikä heti ensimmäisellä kirjautumisella. Asennuskehotus tuntemattomasta
 * palvelusta on se, mikä suljetaan katsomatta.
 *
 * LUPAA EI KYSYTÄ AUTOMAATTISESTI
 *
 * Selain kysyy luvan vasta kun käyttäjä painaa nappia. Sivun latauksessa
 * kysytty lupa on se, johon vastataan "estä" — ja estetty lupa on vaikea
 * perua, koska se on selaimen asetuksissa eikä sovelluksessa.
 * ===========================================================================
 */

type Tila = "tuntematon" | "ei_tuettu" | "vaatii_asennuksen" | "pois" | "paalla" | "estetty";

/**
 * VAPIDin julkinen avain selaimen odottamaan muotoon.
 *
 * Paluutyyppi on `ArrayBuffer` eikä `Uint8Array`: `applicationServerKey`
 * odottaa `BufferSource`ia, ja TypeScriptin uudempi `Uint8Array<ArrayBufferLike>`
 * ei kelpaa siihen sellaisenaan.
 */
function base64ToBuffer(base64: string): ArrayBuffer {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);

  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i);
  return buffer;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Onko sovellus avattu kotivalikosta? iOS vaatii sen ilmoituksiin. */
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export function PushToggle() {
  const [tila, setTila] = useState<Tila>("tuntematon");
  const [virhe, setVirhe] = useState<string | null>(null);
  const [odottaa, setOdottaa] = useState(false);

  useEffect(() => {
    async function selvita() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        // iOS ilman kotivalikkoasennusta: PushManageria ei ole olemassa.
        setTila(isIos() && !isStandalone() ? "vaatii_asennuksen" : "ei_tuettu");
        return;
      }

      if (Notification.permission === "denied") {
        setTila("estetty");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setTila(subscription ? "paalla" : "pois");
    }

    selvita().catch(() => setTila("ei_tuettu"));
  }, []);

  async function otaKayttoon() {
    setOdottaa(true);
    setVirhe(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setTila(permission === "denied" ? "estetty" : "pois");
        return;
      }

      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Ilmoituksia ei ole vielä otettu käyttöön tässä ympäristössä.");

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToBuffer(key),
      });

      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error("Tilaus ei tallentunut.");

      setTila("paalla");
    } catch (error) {
      setVirhe(error instanceof Error ? error.message : "Ilmoitusten käyttöönotto ei onnistunut.");
    } finally {
      setOdottaa(false);
    }
  }

  async function poistaKaytosta() {
    setOdottaa(true);
    setVirhe(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      setTila("pois");
    } catch {
      setVirhe("Ilmoitusten poistaminen ei onnistunut.");
    } finally {
      setOdottaa(false);
    }
  }

  if (tila === "tuntematon") return null;

  return (
    <section className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      <p className="font-medium">Ilmoitukset puhelimeen</p>

      {tila === "vaatii_asennuksen" ? (
        <>
          <p className="mt-2 text-sm text-ink/70">
            iPhonessa ilmoitukset toimivat vasta, kun Reilusoppari on lisätty kotivalikkoon.
            Se on Applen sääntö, eikä sitä voi kiertää selaimessa.
          </p>
          <ol className="mt-3 flex flex-col gap-1 text-sm text-ink/70">
            <li>1. Paina jakopainiketta selaimen alalaidassa</li>
            <li>2. Valitse “Lisää Koti-valikkoon”</li>
            <li>3. Avaa Reilusoppari kotivalikosta ja palaa tähän</li>
          </ol>
        </>
      ) : null}

      {tila === "ei_tuettu" ? (
        <p className="mt-2 text-sm text-ink/70">
          Tämä selain ei tue ilmoituksia. Näet kaiken saman sovelluksessa — ilmoitus on vain
          herätys, ei sisältö.
        </p>
      ) : null}

      {tila === "estetty" ? (
        <p className="mt-2 text-sm text-ink/70">
          Ilmoitukset on estetty selaimen asetuksissa. Salliminen tapahtuu siellä, ei täällä:
          avaa sivuston asetukset ja salli ilmoitukset.
        </p>
      ) : null}

      {tila === "pois" ? (
        <>
          <p className="mt-2 text-sm text-ink/70">
            Saat herätteen, kun on aika kuitata vuokra tai kun toinen osapuoli kirjaa jotain.
            Ilmoituksessa lukee sama asia kuin sovelluksessa.
          </p>
          <button
            type="button"
            onClick={otaKayttoon}
            disabled={odottaa}
            className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
          >
            {odottaa ? "Otetaan käyttöön…" : "Ota ilmoitukset käyttöön"}
          </button>
        </>
      ) : null}

      {tila === "paalla" ? (
        <>
          <p className="mt-2 text-sm text-ink/70">
            Ilmoitukset ovat käytössä tällä laitteella.
          </p>
          <button
            type="button"
            onClick={poistaKaytosta}
            disabled={odottaa}
            className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm disabled:opacity-60"
          >
            {odottaa ? "Poistetaan…" : "Poista ilmoitukset käytöstä"}
          </button>
        </>
      ) : null}

      {virhe ? (
        <p role="alert" className="mt-3 text-sm text-coral">
          {virhe}
        </p>
      ) : null}
    </section>
  );
}
