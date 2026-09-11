import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ei yhteyttä" };

/**
 * Offline-sivu. Service worker näyttää tämän, kun verkkoa ei ole.
 *
 * Sivu on tarkoituksella tyhjä tiedosta: se on välimuistissa kaikille
 * käyttäjille samana, joten siinä ei saa olla mitään käyttäjäkohtaista.
 * Se on myös syy siihen, ettei tässä ole navigaatiota — linkit veisivät
 * sivuille, jotka eivät yhteydettä lataudu.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[var(--container-content)] flex-col justify-center px-6 py-12">
      <h1 className="text-2xl">Ei verkkoyhteyttä</h1>
      <p className="mt-3 text-ink/70">
        Reilusoppari tarvitsee yhteyden näyttääkseen vuokrasuhteen tiedot ajantasaisina.
        Vanhoja tietoja ei näytetä, koska ne voisivat olla vanhentuneita.
      </p>
      <p className="mt-3 text-ink/70">
        Jos olet kuvaamassa asuntoa, ota kuvat puhelimen kameralla ja palaa
        Reilusoppariin, kun yhteys palaa.
      </p>
    </main>
  );
}
