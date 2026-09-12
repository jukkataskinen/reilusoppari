import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getTenancy } from "@/lib/db/tenancies";
import { listCertificates, listCertificateShares } from "@/lib/db/certificates";
import { AppShell } from "@/components/AppShell";
import { CertificatePanel } from "@/components/CertificatePanel";
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

  const [certificates, shares] = await Promise.all([
    listCertificates(user.id, id),
    listCertificateShares(user.id, id),
  ]);

  // Oma todistus ensin: se on se, jonka takia sivulle tullaan.
  const ordered = [...certificates].sort((a, b) => Number(b.isMine) - Number(a.isMine));

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

      {ordered.map((certificate) => (
        <CertificatePanel
          key={certificate.id}
          tenancyId={id}
          certificate={certificate}
          shares={certificate.isMine ? shares : []}
        />
      ))}

      <p className="mt-10 text-sm">
        <Link href={`/vuokrasuhteet/${id}/paattyminen`} className="underline underline-offset-4">
          {fi.common.back}
        </Link>
      </p>
    </AppShell>
  );
}
