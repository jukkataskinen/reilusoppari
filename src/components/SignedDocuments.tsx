import type { SignedDocument } from "@/lib/tenancy/signed-documents";
import { FetchSignedDocuments } from "@/components/FetchSignedDocuments";

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("fi-FI", {
    timeZone: "Europe/Helsinki",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

/**
 * Allekirjoitetut asiakirjat (Jukka 10.10.2026).
 *
 * eSinetti on taustapalvelu: kumpikaan osapuoli ei käy siellä, vaan
 * sinetöidyt asiakirjat avataan täältä. PDF avautuu omaan ikkunaansa, koska
 * kotinäytön sovelluksessa ei ole takaisin-painiketta (PDF-linkit 10.10.2026).
 */
export function SignedDocuments({
  tenancyId,
  documents,
  showFetch,
}: {
  tenancyId: string;
  documents: SignedDocument[];
  /** Vuokranantajalle, kun valmiin kierroksen asiakirja puuttuu meiltä. */
  showFetch: boolean;
}) {
  if (documents.length === 0 && !showFetch) return null;

  return (
    <section className="mt-10">
      <h2 className="text-lg">Allekirjoitetut asiakirjat</h2>

      {documents.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3">
          {documents.map((document) => (
            <li
              key={document.kind}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-line bg-paper p-4"
            >
              <span>
                <span className="font-medium">{document.title}</span>
                <span className="block text-sm text-ink/60">
                  Allekirjoitettu {formatTimestamp(document.signedAt)}
                </span>
              </span>
              {document.available ? (
                <a
                  href={`/vuokrasuhteet/${tenancyId}/asiakirjat/${document.kind}`}
                  download
                  target="_blank"
                  rel="noopener"
                  className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
                >
                  Avaa PDF
                </a>
              ) : (
                <span className="text-sm text-ink/60">Asiakirja ei ole vielä tallessa</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {showFetch ? <FetchSignedDocuments tenancyId={tenancyId} /> : null}
    </section>
  );
}
