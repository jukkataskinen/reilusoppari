"use client";

import {
  useEffect,
  useRef,
  useTransition,
  type FormEvent,
  type FormHTMLAttributes,
} from "react";
import { PROBLEM_SELECTORS, submitterEntry, validityMessage } from "@/lib/forms/validity";

/**
 * Lomake, joka EI tyhjene virheen jälkeen. Käytä tätä `<form action>`:n sijaan.
 *
 * ===========================================================================
 * MIKSI EI TAVALLINEN `<form action={...}>`
 *
 * React 19 tyhjentää lomakkeen aina, kun `action`-propin kautta lähetetty
 * toiminto valmistuu — myös silloin, kun palvelin palautti virheen. Jukka
 * huomasi tämän vuokrasuhteen luonnissa (9.10.2026): yksi puuttuva kenttä,
 * ja kaikki muutkin kirjoitetut tiedot katosivat.
 *
 * Tämä komponentti lähettää lomakkeen itse (`onSubmit` + `startTransition`),
 * jolloin React ei tyhjennä mitään. Kentät pysyvät selaimessa sellaisina
 * kuin käyttäjä ne kirjoitti — myös valinnat, rastit, päivämäärät ja
 * valitut tiedostot. Palvelimen ei tarvitse palauttaa arvoja takaisin,
 * joten henkilötunnus tai muu arka tieto ei kulje turhaan edestakaisin.
 *
 * Kun lomake PITÄÄ tyhjentää onnistumisen jälkeen (esim. kommenttikenttä),
 * anna `clearOn`-arvo: lomake tyhjenee aina, kun se vaihtuu totuudelliseksi
 * uudeksi arvoksi. Tyypillisesti `clearOn={state.sent ? state : null}`.
 *
 * Virheen jälkeen kohdistus siirtyy ensimmäiseen virheelliseen kenttään
 * (`aria-invalid="true"`) tai, jos sellaista ei ole, virheilmoitukseen.
 * Puhelimella virhe olisi muuten usein näytön ulkopuolella.
 *
 * Selaimen oma tarkistus (`required`, `type="email"`, `min`) on päällä,
 * ja sen viestit vaihdetaan suomeksi. Palvelin tarkistaa silti kaiken
 * uudelleen: selaimen tarkistus on käyttäjän apu, ei suojaus.
 * ===========================================================================
 */
export function Form({
  action,
  clearOn,
  children,
  method = "post",
  ...rest
}: Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit"> & {
  action: (formData: FormData) => void;
  clearOn?: unknown;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const awaitingResult = useRef(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    // Selain lisää painetun napin nimen ja arvon lomakedataan; koska
    // lähetämme itse, se on tehtävä käsin, tai kahden napin lomakkeet
    // (esim. "Kyllä" / "Ei vielä") eivät tietäisi kumpaa painettiin.
    const entry = submitterEntry(
      (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null,
    );
    if (entry) formData.append(entry[0], entry[1]);

    awaitingResult.current = true;
    startTransition(() => action(formData));
  };

  useEffect(() => {
    if (pending || !awaitingResult.current) return;
    awaitingResult.current = false;
    const form = ref.current;
    if (!form) return;
    for (const selector of PROBLEM_SELECTORS) {
      const target = form.querySelector<HTMLElement>(selector);
      if (!target) continue;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      if (target.matches("input, select, textarea")) {
        target.focus({ preventScroll: true });
      }
      return;
    }
  }, [pending]);

  useEffect(() => {
    if (clearOn) ref.current?.reset();
  }, [clearOn]);

  // Selaimen kupla suomeksi. Viesti asetetaan juuri ennen kuin selain
  // näyttää sen, ja poistetaan heti kun käyttäjä muuttaa kenttää — muuten
  // kenttä pysyisi virheellisenä vaikka se olisi jo korjattu.
  //
  // Kuuntelija on selaimen oma eikä Reactin `onInvalid`: `invalid`-tapahtuma
  // ei kupli, joten lomaketasolla sen saa kiinni vain capture-vaiheessa.
  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    const onInvalid = (event: Event) => {
      const field = event.target as HTMLInputElement;
      if (typeof field.setCustomValidity !== "function") return;
      field.setCustomValidity("");
      const message = validityMessage(field.validity, field);
      if (message) field.setCustomValidity(message);
    };
    const clear = (event: Event) => {
      const field = event.target as HTMLInputElement;
      if (typeof field.setCustomValidity === "function") field.setCustomValidity("");
    };
    form.addEventListener("invalid", onInvalid, true);
    form.addEventListener("input", clear, true);
    form.addEventListener("change", clear, true);
    return () => {
      form.removeEventListener("invalid", onInvalid, true);
      form.removeEventListener("input", clear, true);
      form.removeEventListener("change", clear, true);
    };
  }, []);

  return (
    <form
      ref={ref}
      // `method="post"` on varmistus siltä varalta, että lomake lähetetään
      // ennen kuin sivun JavaScript on latautunut: oletus GET laittaisi
      // kenttien arvot (nimet, tunnukset) osoiteriville ja selaimen historiaan.
      method={method}
      onSubmit={onSubmit}
      {...rest}
    >
      {children}
    </form>
  );
}
