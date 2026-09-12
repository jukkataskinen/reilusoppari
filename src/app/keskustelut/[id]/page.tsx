import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getConversation } from "@/lib/db/certificate-contact";
import { AppShell } from "@/components/AppShell";
import { ConversationForm } from "@/components/ConversationForm";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Keskustelu",
  robots: { index: false, follow: false },
};

function hetki(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()} klo ${pad(date.getHours())}.${pad(date.getMinutes())}`;
}

/**
 * Vuokratodistukseen liittyvä keskustelu (CLAUDE.md 5.10).
 *
 * ===========================================================================
 * KOLME NÄKEE, KAKSI KIRJOITTAA
 *
 * Kysyjä ja luvan antaja keskustelevat. Se, JOSTA keskustellaan, näkee
 * keskustelun kokonaisuudessaan muttei kirjoita siihen. Hänen näkymänsä on
 * tarkoituksellinen eikä tekninen sivuseikka: kummastakaan osapuolesta ei
 * puhuta hänen selkänsä takana palvelun sisällä.
 *
 * YHTEYSTIETOJA EI NÄYTETÄ
 *
 * Näkyvissä on vain nimi, joka on vahvasta tunnistautumisesta todennettu.
 * Ei sähköpostia, ei puhelinnumeroa, ei osoitetta — kumpaankaan suuntaan.
 *
 * JÄLJELLE JÄÄVÄ RAJOITE
 *
 * Kaksi ihmistä voi aina siirtyä puhelimeen. Portaali ei estä sitä eikä
 * yritä. Se tekee palvelun sisäisestä keskustelusta helpomman vaihtoehdon ja
 * pitää sen läpinäkyvänä sille, jota se koskee.
 * ===========================================================================
 */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const conversation = await getConversation(user.id, id);

  // `null` myös sille, joka ei kuulu keskusteluun: sama vastaus kuin
  // olemattomalle, jottei vastaus kerro mitä keskusteluja on olemassa.
  if (!conversation) notFound();

  const isAsker = user.id === conversation.initiatorUserId;
  const isIssuer = user.id === conversation.issuerUserId;
  const isSubject = !isAsker && !isIssuer;

  return (
    <AppShell>
      <h1 className="text-2xl">Keskustelu vuokratodistuksesta</h1>

      <p className="mt-2 text-ink/70">
        {isAsker
          ? "Kysyit lisää vuokrasuhteesta, josta sinulle jaettiin todistus."
          : isIssuer
            ? `${conversation.initiatorName} kysyy lisää vuokrasuhteesta, josta annoit todistuksen.`
            : "Tämä keskustelu käydään sinusta. Näet sen kokonaisuudessaan."}
      </p>

      {isSubject ? (
        <p className="mt-4 rounded-[var(--radius-panel)] border border-line bg-canvas p-4 text-sm text-ink/70">
          Näet keskustelun, koska se koskee sinua. Et voi kirjoittaa siihen: osapuolet ovat
          kysyjä ja se, joka antoi sinusta todistuksen. Voit pyytää todistuksen antajaa
          perumaan yhteydenottoluvan, jolloin keskustelu sulkeutuu uusilta viesteiltä.
        </p>
      ) : null}

      <p className="mt-4 text-sm text-ink/60">
        Avattu {hetki(conversation.openedAt)}. Kummankaan yhteystietoja ei näytetä toiselle.
      </p>

      {/* --- Viestit ------------------------------------------------------- */}

      {conversation.messages.length === 0 ? (
        <p className="mt-6 text-ink/70">Keskustelussa ei ole vielä viestejä.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {conversation.messages.map((message) => (
            <li
              key={message.id}
              className={
                "rounded-[var(--radius-panel)] border border-line p-4 " +
                (message.authorUserId === user.id ? "bg-canvas" : "bg-paper")
              }
            >
              <p className="text-sm text-ink/60">
                {message.authorName || (message.fromAsker ? "Kysyjä" : "Todistuksen antaja")} ·{" "}
                {hetki(message.sentAt)}
              </p>
              <p className="mt-2 whitespace-pre-wrap">{message.body}</p>
            </li>
          ))}
        </ul>
      )}

      {/* --- Kirjoitus ----------------------------------------------------- */}

      {conversation.closedAt ? (
        <p className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-4 text-sm text-ink/70">
          Keskustelu on suljettu {hetki(conversation.closedAt)}. Uusia viestejä ei voi lähettää,
          mutta jo lähetetyt jäävät näkyviin kaikille kolmelle.
        </p>
      ) : isSubject ? null : (
        <ConversationForm conversationId={conversation.id} />
      )}

      <p className="mt-10 text-sm">
        <Link
          href={isSubject || isIssuer ? `/vuokrasuhteet/${conversation.tenancyId}/todistukset` : "/vuokrasuhteet"}
          className="underline underline-offset-4"
        >
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
