import Link from "next/link";
import type { Metadata } from "next";
import { findCertificateByShare } from "@/lib/db/certificates";
import { resolveShare } from "@/lib/db/certificate-contact";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Vuokratodistus",
  robots: { index: false, follow: false },
};

/**
 * Jaettu vuokratodistus (CLAUDE.md 5.8).
 *
 * ===========================================================================
 * TÄMÄ SIVU ON TARKOITUKSELLA JULKINEN
 *
 * Vuokralainen jakaa todistuksensa seuraavalle vuokranantajalle, jolla ei ole
 * eikä tarvitse olla Reilusoppari-tiliä. Linkin tunniste on se, mikä antaa
 * pääsyn — 256-bittinen satunnaisluku, jota ei säilytetä selkokielisenä.
 *
 * Sivu näyttää VAIN todistuksen. Ei asuntoa, ei katselmuskuvia, ei
 * huoltokirjaa, ei kummankaan yhteystietoja. Todistus on se, mitä jaettiin.
 *
 * Vanhentunut ja mitätöity linkki antavat saman vastauksen kuin olematon:
 * muuten vastaus kertoisi, mitkä tunnisteet ovat joskus olleet olemassa.
 * ===========================================================================
 */
export default async function SharedCertificatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const certificate = await findCertificateByShare(token);

  /*
    Yhteydenottolupa haetaan erikseen eikä `findCertificateByShare`:sta.

    Jälkimmäinen kasvattaa katselukertaa, ja se on oikein: todistus
    näytetään. Luvan haku ei ole katselu, joten se kulkee omaa reittiään
    (`resolveShare`), joka ei koske laskuriin.
  */
  const share = certificate ? await resolveShare(token) : null;
  const mayAsk = share?.permission.allowed === true;

  if (!certificate) {
    return (
      <AppShell nav={false} signedIn={false}>
        <div className="py-10">
          <h1 className="text-2xl">Linkki ei ole voimassa</h1>
          <p className="mt-3 text-ink/70">
            Jakolinkki on vanhentunut tai se on mitätöity. Pyydä uusi linkki siltä, joka jakoi
            todistuksen.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell nav={false} signedIn={false}>
      <h1 className="text-2xl">Vuokratodistus</h1>
      <p className="mt-2 text-ink/70">
        Tämä todistus on jaettu sinulle linkillä. Se on sinetöity asiakirja: sinetti rikkoutuu,
        jos tiedostoa muutetaan yhdelläkään tavulla.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href={`/todistus/${token}/pdf`}
          download="vuokratodistus.pdf"
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
        >
          Tallenna PDF
        </a>

        {/*
          "Kysy lisää" näkyy vain, jos todistuksen ANTAJA on sallinut sen.
          Nappi, joka johtaa umpikujaan, on huonompi kuin ei nappia.
        */}
        {mayAsk ? (
          <Link
            href={`/todistus/${token}/kysy`}
            className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper"
          >
            Kysy lisää
          </Link>
        ) : null}
      </div>

      {mayAsk ? (
        <p className="mt-3 text-sm text-ink/70">
          Todistuksen antaja on sallinut, että häneltä voi kysyä lisää tästä vuokrasuhteesta.
          Keskustelu käydään tässä palvelussa, ja se edellyttää kirjautumista ja
          tunnistautumista — keskustelu koskee toisen ihmisen tietoja. Kummankaan yhteystietoja
          ei näytetä toiselle, ja se, jota keskustelu koskee, näkee sen.
        </p>
      ) : null}

      <object
        data={`/todistus/${token}/pdf`}
        type="application/pdf"
        className="mt-6 h-[78vh] w-full rounded-[var(--radius-panel)] border border-line bg-paper"
      >
        <div className="p-5">
          <p className="font-medium">Selain ei näytä asiakirjaa tässä</p>
          <p className="mt-2 text-sm text-ink/70">
            Tallenna se yllä olevasta painikkeesta ja avaa laitteen omasta tiedostonäkymästä.
          </p>
        </div>
      </object>

      {certificate.sealedSha256 ? (
        <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <p className="font-medium">Aitouden tarkistus</p>
          <p className="mt-2 text-sm text-ink/70">
            Asiakirjan tiiviste on alla. Voit tarkistaa sen aitouden itse — tarkistus ei vaadi
            luottamusta tähän palveluun.
          </p>
          <p className="mt-2 break-all font-mono text-xs text-ink/60">
            {certificate.sealedSha256}
          </p>
          <p className="mt-3 text-sm">
            <Link href="/todistus/tarkista" className="underline underline-offset-4">
              Tarkista aitous
            </Link>
          </p>
        </div>
      ) : null}
    </AppShell>
  );
}
