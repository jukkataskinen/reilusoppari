import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenancy } from "@/lib/db/tenancies";
import { listCertificates, listCertificateShares } from "@/lib/db/certificates";
import { contactPermission, listConversations } from "@/lib/db/certificate-contact";
import { AppShell } from "@/components/AppShell";
import { CertificatePanel } from "@/components/CertificatePanel";
import { ContactPermission } from "@/components/ContactPermission";
import { fi } from "@/i18n/fi";

export const metadata: Metadata = {
  title: "Vuokratodistukset",
  robots: { index: false, follow: false },
};

/**
 * Vuokratodistukset (CLAUDE.md 5.8).
 *
 * ===========================================================================
 * MOLEMMAT TODISTUKSET SAMALLA SIVULLA
 *
 * Sivulla on kaksi todistusta: se, jonka sinä saat, ja se, jonka annat.
 * Erillisinä sivuina ne näyttäisivät eri asioilta — ja juuri
 * vastavuoroisuus on se, mikä tekee arviosta reilun. Kumpikin arvioi
 * toista, kumpikin näkee mitä hänestä sanottiin.
 * ===========================================================================
 */
export default async function CertificatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  if (!(await getTenancy(user.id, id))) notFound();

  const [certificates, shares, conversations] = await Promise.all([
    listCertificates(user.id, id),
    listCertificateShares(user.id, id),
    listConversations(user.id, id),
  ]);

  // Oma todistus ensin: se on se, jonka takia sivulle tullaan.
  const ordered = [...certificates].sort((a, b) => Number(b.isMine) - Number(a.isMine));

  /*
    Lupa haetaan vain sinetöidyille todistuksille.

    Sinetöimättömästä ei keskustella: sen sisältö voi vielä muuttua, eikä
    keskustelu saa koskea jotain, mitä ei ole lyöty lukkoon.
  */
  const permissions = new Map(
    await Promise.all(
      ordered
        .filter((certificate) => certificate.sealedAt)
        .map(
          async (certificate) =>
            [certificate.id, await contactPermission(certificate.id)] as const,
        ),
    ),
  );

  return (
    <AppShell>
      <h1 className="text-2xl">Vuokratodistukset</h1>
      <p className="mt-2 text-ink/70">
        Kumpikin antaa toisestaan arvion ja saa oman todistuksensa. Arvio on kaksiarvoinen:
        suositus tai ei arviota. Kielteistä vaihtoehtoa ei ole, eikä puuttuva arvio näy
        todistuksessa mitenkään.
      </p>

      {certificates.length === 0 ? (
        <p className="mt-6 text-sm text-ink/60">
          Todistukset syntyvät, kun loppukatselmuksen pöytäkirja on allekirjoitettu.
        </p>
      ) : null}

      {ordered.map((certificate) => {
        const permission = permissions.get(certificate.id);

        return (
          <div key={certificate.id}>
            <CertificatePanel
              tenancyId={id}
              certificate={certificate}
              shares={certificate.isMine ? shares : []}
            />

            {permission ? (
              <div className="px-5">
                <ContactPermission
                  tenancyId={id}
                  certificateId={certificate.id}
                  /* Luvan antaa todistuksen KIRJOITTAJA: se, joka ei ole sen kohde. */
                  canChange={!certificate.isMine}
                  allowed={permission.allowed}
                  revokedAt={permission.revokedAt}
                  openedCount={permission.openedCount}
                  maxMessages={permission.maxMessages}
                />
              </div>
            ) : null}
          </div>
        );
      })}

      {/* --- Keskustelut ---------------------------------------------------
          Näkyvät molemmille osapuolille: sekä luvan antajalle että sille,
          josta keskustellaan (CLAUDE.md 5.10). */}

      {conversations.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg">Keskustelut</h2>
          <p className="mt-2 text-sm text-ink/70">
            Todistukseen liittyvät keskustelut näkyvät molemmille osapuolille. Keskustelussa ei
            näytetä kenenkään yhteystietoja.
          </p>

          <ul className="mt-4 flex flex-col gap-3">
            {conversations.map((conversation) => (
              <li
                key={conversation.id}
                className="rounded-[var(--radius-panel)] border border-line bg-paper p-4"
              >
                <Link href={`/keskustelut/${conversation.id}`} className="font-medium underline underline-offset-4">
                  {conversation.initiatorName}
                </Link>
                <p className="mt-1 text-sm text-ink/60">
                  {conversation.messageCount === 1
                    ? "1 viesti"
                    : `${conversation.messageCount} viestiä`}
                  {conversation.closedAt ? " · suljettu" : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-10 text-sm">
        <Link href={`/vuokrasuhteet/${id}/paattyminen`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
