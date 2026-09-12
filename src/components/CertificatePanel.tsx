"use client";

import { useActionState, useState } from "react";
import {
  createShareAction,
  giveRatingAction,
  replyAction,
  revokeShareAction,
  sealAction,
  type CertificateActionState,
} from "@/app/vuokrasuhteet/certificate-actions";
import type { CertificateRow, ShareRow } from "@/lib/db/certificates";

const initialState: CertificateActionState = {};

function päivä(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${Number(day)}.${Number(month)}.${year}`;
}

/**
 * Yksi todistus: arvio, vastine, sinetöinti ja jakolinkit.
 *
 * ===========================================================================
 * KIELTEISTÄ VAIHTOEHTOA EI OLE
 *
 * Arviossa on kaksi valintaa: "Suosittelen" tai "En anna arviota". Kielteistä
 * ei ole, eikä puuttuva arvio näy todistuksessa mitenkään — muuten
 * kaksiarvoisuudesta tulisi kiertoteitse kolmiportainen asteikko, jossa
 * "ei suositusta" olisi tosiasiallinen moite (Jukan päätös 2026-09-10).
 *
 * Lomake sanoo sen ääneen. Jos sitä ei sanottaisi, moni valitsisi "en anna
 * arviota" luullen sen olevan kohtelias tapa antaa kielteinen arvio.
 * ===========================================================================
 */
export function CertificatePanel({
  tenancyId,
  certificate,
  shares,
}: {
  tenancyId: string;
  certificate: CertificateRow;
  /** Omat jakolinkit. Tyhjä, jos todistus ei ole omani. */
  shares: ShareRow[];
}) {
  const [ratingState, rate, ratePending] = useActionState(giveRatingAction, initialState);
  const [replyState, reply, replyPending] = useActionState(replyAction, initialState);
  const [sealState, seal, sealPending] = useActionState(sealAction, initialState);
  const [shareState, share, sharePending] = useActionState(createShareAction, initialState);
  const [revokeState, revoke, revokePending] = useActionState(revokeShareAction, initialState);
  const [rating, setRating] = useState<"recommend" | "none">(
    certificate.rating === "recommend" ? "recommend" : "none",
  );

  const otsikko = certificate.isMine
    ? "Sinun vuokratodistuksesi"
    : certificate.forRole === "tenant"
      ? "Vuokralaisen todistus"
      : "Vuokranantajan todistus";

  return (
    <section className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      <h2 className="font-medium">{otsikko}</h2>

      {certificate.stage === "not_ready" ? (
        <p className="mt-2 text-sm text-ink/70">
          Todistus syntyy, kun loppukatselmuksen pöytäkirja on allekirjoitettu.
        </p>
      ) : null}

      {certificate.sealedAt ? (
        <p className="mt-2 text-sm text-ink/70">
          Sinetöity {päivä(certificate.sealedAt)}. Sisältö ei voi enää muuttua.
        </p>
      ) : null}

      {/* --- Arvio: näkyy sille, joka arvioi toista ------------------------ */}

      {certificate.canRate ? (
        <form action={rate} className="mt-5">
          <input type="hidden" name="tenancyId" value={tenancyId} />

          <p className="text-sm text-ink/70">
            Annatko suosituksen? Kielteistä vaihtoehtoa ei ole: voit joko suositella tai olla
            antamatta arviota. Jos et anna arviota, siitä ei jää todistukseen mitään merkintää.
          </p>

          <div className="mt-4 flex gap-2">
            {(
              [
                ["recommend", "Suosittelen"],
                ["none", "En anna arviota"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={
                  "flex min-h-[var(--size-touch)] flex-1 cursor-pointer items-center justify-center rounded-full border px-3 text-sm " +
                  (rating === value ? "border-ink bg-ink text-paper" : "border-line bg-paper")
                }
              >
                <input
                  type="radio"
                  name="rating"
                  value={value}
                  defaultChecked={rating === value}
                  onChange={() => setRating(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>

          <label htmlFor={`arvio-${certificate.id}`} className="mt-4 block text-sm font-medium">
            Omat sanasi (vapaaehtoinen)
          </label>
          <textarea
            id={`arvio-${certificate.id}`}
            name="comment"
            rows={3}
            maxLength={300}
            defaultValue={certificate.comment ?? ""}
            placeholder="Esimerkiksi: asioista sovittiin aina hyvässä hengessä"
            className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
          />
          <p className="mt-1.5 text-sm text-ink/60">
            Enintään 300 merkkiä. Toinen osapuoli näkee tämän ja voi liittää oman vastineensa
            seitsemän päivän kuluessa.
          </p>

          {ratingState.message ? (
            <p role="alert" className="mt-2 text-sm text-coral">
              {ratingState.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={ratePending}
            className="mt-4 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
          >
            {ratePending ? "Tallennetaan…" : certificate.commentAt ? "Muuta arviota" : "Tallenna arvio"}
          </button>
        </form>
      ) : null}

      {/* --- Annettu arvio ja vastine -------------------------------------- */}

      {certificate.commentAt && !certificate.canRate ? (
        <div className="mt-5 rounded-[10px] border border-line bg-canvas p-4">
          <p className="text-sm text-ink/60">
            {certificate.isMine ? "Sinusta annettu arvio" : "Antamasi arvio"}
          </p>
          <p className="mt-1 font-medium">
            {certificate.rating === "recommend" ? "Suositus annettu" : "Ei arviota"}
          </p>
          {certificate.comment ? <p className="mt-2 text-sm">{certificate.comment}</p> : null}
        </div>
      ) : null}

      {certificate.reply ? (
        <div className="mt-3 rounded-[10px] border border-line bg-canvas p-4">
          <p className="text-sm text-ink/60">Vastine</p>
          <p className="mt-1 text-sm">{certificate.reply}</p>
        </div>
      ) : null}

      {certificate.canReply ? (
        <form action={reply} className="mt-5">
          <input type="hidden" name="tenancyId" value={tenancyId} />

          <label htmlFor={`vastine-${certificate.id}`} className="text-sm font-medium">
            Haluatko liittää vastineen?
          </label>
          <textarea
            id={`vastine-${certificate.id}`}
            name="reply"
            rows={3}
            maxLength={300}
            className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
          />
          <p className="mt-1.5 text-sm text-ink/60">
            Enintään 300 merkkiä, ja se tulee todistukseen arvion viereen.
            {certificate.replyBy ? ` Aikaa ${päivä(certificate.replyBy)} asti.` : ""}
          </p>

          {replyState.message ? (
            <p role="alert" className="mt-2 text-sm text-coral">
              {replyState.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={replyPending}
            className="mt-3 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm disabled:opacity-60"
          >
            {replyPending ? "Lähetetään…" : "Lähetä vastine"}
          </button>
        </form>
      ) : null}

      {/* --- Sinetöinti ---------------------------------------------------- */}

      {certificate.stage === "sealable" ? (
        <form action={seal} className="mt-5">
          <input type="hidden" name="tenancyId" value={tenancyId} />
          <input type="hidden" name="forRole" value={certificate.forRole} />

          <p className="text-sm text-ink/70">
            Todistus on valmis sinetöitäväksi. Sinetöinti kiinnittää sisällön: sinetti rikkoutuu,
            jos tiedostoa muutetaan yhdelläkään tavulla.
          </p>

          {sealState.message ? (
            <p role="alert" className="mt-2 text-sm text-coral">
              {sealState.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={sealPending}
            className="mt-3 inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
          >
            {sealPending ? "Sinetöidään…" : "Sinetöi todistus"}
          </button>
        </form>
      ) : null}

      {certificate.stage === "awaiting_reply" && !certificate.canReply ? (
        <p className="mt-4 text-sm text-ink/60">
          Odotetaan vastinetta{certificate.replyBy ? ` ${päivä(certificate.replyBy)} asti` : ""}.
          Sen jälkeen todistus voidaan sinetöidä.
        </p>
      ) : null}

      {/* --- Oma todistus: lataus ja jakolinkit ---------------------------- */}

      {certificate.isMine && certificate.sealedAt ? (
        <div className="mt-5">
          <a
            href={`/vuokrasuhteet/${tenancyId}/todistukset/pdf`}
            download="vuokratodistus.pdf"
            className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
          >
            Tallenna todistus
          </a>

          <form action={share} className="mt-5">
            <input type="hidden" name="tenancyId" value={tenancyId} />
            <p className="text-sm text-ink/70">
              Jakolinkki näyttää vain tämän todistuksen — ei asuntoa, kuvia eikä muita tietoja.
              Se on voimassa 30 päivää, ja voit mitätöidä sen milloin tahansa.
            </p>

            {shareState.shareLink ? (
              <div className="mt-3 rounded-[10px] border border-line bg-canvas p-3">
                <p className="text-sm text-ink/60">
                  Kopioi linkki nyt. Sitä ei voi katsoa myöhemmin uudelleen — tunniste
                  tallennetaan vain tiivisteenä.
                </p>
                <p className="mt-2 break-all font-mono text-xs">{shareState.shareLink}</p>
              </div>
            ) : null}

            {shareState.message ? (
              <p role="alert" className="mt-2 text-sm text-coral">
                {shareState.message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={sharePending}
              className="mt-3 inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm disabled:opacity-60"
            >
              {sharePending ? "Luodaan…" : "Luo jakolinkki"}
            </button>
          </form>

          {shares.length > 0 ? (
            <ul className="mt-5 flex flex-col gap-2">
              {shares.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line p-3 text-sm"
                >
                  <span className={row.revokedAt ? "text-ink/50 line-through" : ""}>
                    Voimassa {päivä(row.expiresAt)} asti · avattu {row.viewedCount}{" "}
                    {row.viewedCount === 1 ? "kerta" : "kertaa"}
                  </span>
                  {row.revokedAt ? (
                    <span className="text-ink/50">Mitätöity</span>
                  ) : (
                    <form action={revoke}>
                      <input type="hidden" name="tenancyId" value={tenancyId} />
                      <input type="hidden" name="shareId" value={row.id} />
                      <button
                        type="submit"
                        disabled={revokePending}
                        className="underline underline-offset-4 disabled:opacity-60"
                      >
                        {revokePending ? "Mitätöidään…" : "Mitätöi"}
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          {revokeState.message ? (
            <p role="alert" className="mt-2 text-sm text-coral">
              {revokeState.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
