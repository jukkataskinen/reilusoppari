import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenancy } from "@/lib/db/tenancies";
import { AppShell } from "@/components/AppShell";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Sopimuksen esikatselu",
  robots: { index: false, follow: false },
};

/**
 * Esikatselu sovelluksen sisällä.
 *
 * ===========================================================================
 * MIKSI KÄÄRE EIKÄ SUORA LINKKI PDF:ÄÄN
 *
 * Aiemmin linkki vei suoraan PDF:ään. Kotinäytölle asennetussa sovelluksessa
 * ei ole selaimen osoiteriviä eikä takaisin-painiketta, joten asiakirja
 * avautui näkymään, josta ei päässyt pois muuten kuin sulkemalla koko
 * sovellus (Jukan havainto 2026-09-11).
 *
 * Nyt asiakirja näytetään tällä sivulla, jolla on aina tie takaisin. Linkki
 * erilliseen välilehteen on silti jäljellä: kaikki selaimet eivät näytä
 * upotettua PDF:ää, ja iOS:ssä upotus näyttää vain ensimmäisen sivun.
 * ===========================================================================
 */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  if (!(await getTenancy(user.id, id))) notFound();

  const pdf = `/vuokrasuhteet/${id}/sopimus/esikatselu/pdf`;

  return (
    <AppShell>
      <h1 className="text-2xl">Sopimuksen esikatselu</h1>
      <p className="mt-2 text-ink/70">
        Tämä on sama asiakirja, joka allekirjoitetaan. Luonnos muuttuu, jos ehtoja vielä muokataan.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/vuokrasuhteet/${id}/sopimus`}
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper"
        >
          {fi.common.back}
        </Link>
        <a
          href={pdf}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
        >
          Avaa erillisenä
        </a>
      </div>

      {/*
        `object` eikä `iframe`: jos selain ei osaa näyttää PDF:ää, `object`
        näyttää sisällä olevan varatekstin sen sijaan että jättäisi tyhjän
        laatikon. Silloin linkki on ainoa tie asiakirjaan, ja se on tässä.
      */}
      <object
        data={pdf}
        type="application/pdf"
        className="mt-6 h-[70vh] w-full rounded-[var(--radius-panel)] border border-line bg-paper"
      >
        <div className="p-5">
          <p className="font-medium">Selain ei näytä asiakirjaa tässä</p>
          <p className="mt-2 text-sm text-ink/70">
            Avaa se erillisenä yllä olevasta painikkeesta. Asiakirja on sama.
          </p>
        </div>
      </object>

      <p className="mt-6 text-sm text-ink/60">
        Puhelimessa asiakirjasta näkyy usein vain ensimmäinen sivu. Koko sopimuksen näet
        avaamalla sen erillisenä.
      </p>
    </AppShell>
  );
}
