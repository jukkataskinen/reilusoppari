"use client";

import { useEffect } from "react";

/**
 * Rekisteröi service workerin.
 *
 * Rekisteröinti tehdään `load`-tapahtuman jälkeen, jotta se ei kilpaile
 * ensimmäisen sivulatauksen kanssa kaistasta — puhelinverkossa se näkyy.
 *
 * Kehityksessä rekisteröintiä ei tehdä lainkaan: service worker jää muuten
 * elämään localhostille ja tarjoilee vanhoja tiedostoja seuraavassa
 * projektissa, joka käyttää samaa porttia. Se on vaikea huomata ja vielä
 * vaikeampi selittää.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        // Epäonnistunut rekisteröinti ei saa rikkoa sovellusta: PWA on lisä,
        // ei edellytys.
        console.warn("[pwa] service workerin rekisteröinti ei onnistunut:", error?.message);
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
