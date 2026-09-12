import { PhotoCapture } from "@/components/PhotoCapture";
import { FlagPhoto } from "@/components/FlagPhoto";
import { PHOTO_GUIDANCE } from "@/lib/inspection/rooms";

export interface ViewPhoto {
  id: string;
  note: string | null;
  sha256: string;
  takenAtServer: string;
  uploaderName: string | null;
  uploaderRole: "landlord" | "tenant";
  flagged: boolean;
  flaggedReason: string | null;
  url: string | null;
}

function hetki(iso: string): string {
  return new Date(iso).toLocaleString("fi-FI", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function kuvaaja(photo: ViewPhoto): string {
  return (
    photo.uploaderName ?? (photo.uploaderRole === "landlord" ? "Vuokranantaja" : "Vuokralainen")
  );
}

/**
 * Yhden tilan kuvat ja kameranäkymä.
 *
 * ===========================================================================
 * SAMA NÄKYMÄ ALKU- JA LOPPUKATSELMUKSESSA
 *
 * Loppukatselmus eroaa alusta vain siinä, että alkukuvat näkyvät rinnalla.
 * Jos näkymiä olisi kaksi, ne erkanisivat toisistaan — ja juuri niiden
 * vertailukelpoisuus on koko loppukatselmuksen tarkoitus.
 *
 * ALKUKUVAT OVAT ALLA, EIVÄT VIERESSÄ
 *
 * Puhelimessa kaksi saraketta tarkoittaa kahta liian pientä kuvaa. Alkukuvat
 * ovat omassa osiossaan uusien alla, jolloin kumpikin näkyy täydessä
 * leveydessä ja vertailu tapahtuu vierittämällä.
 * ===========================================================================
 */
export function InspectionRoomView({
  roomName,
  hints,
  photos,
  previousPhotos,
  tenancyId,
  endpoint,
  locked,
  lockedMessage,
}: {
  roomName: string;
  hints: string[];
  photos: ViewPhoto[];
  /** Alkukatselmuksen kuvat samasta tilasta. Tyhjä alkukatselmuksessa. */
  previousPhotos?: ViewPhoto[];
  tenancyId: string;
  endpoint: string;
  locked: boolean;
  lockedMessage: string;
}) {
  return (
    <>
      <p className="mt-2 text-ink/70">{PHOTO_GUIDANCE}</p>

      {hints.length > 0 ? (
        <p className="mt-3 text-sm text-ink/60">
          Tässä tilassa katsotaan usein: {hints.join(", ").toLowerCase()}. Nämä ovat vihjeitä,
          eivät vaatimuksia — kuvaa se, minkä itse katsot tärkeäksi.
        </p>
      ) : null}

      {locked ? (
        <p className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5 text-sm text-ink/70">
          {lockedMessage}
        </p>
      ) : (
        <PhotoCapture endpoint={endpoint} room={roomName} />
      )}

      <div className="mt-8 flex flex-col gap-6">
        {photos.length === 0 ? (
          <p className="text-sm text-ink/60">Tästä tilasta ei ole vielä kuvia.</p>
        ) : null}

        {photos.map((photo) => (
          <figure
            key={photo.id}
            className="rounded-[var(--radius-panel)] border border-line bg-paper p-3"
          >
            {photo.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- Signed URL vanhenee tunnissa, joten Next-optimointi ei sovi.
              <img
                src={photo.url}
                alt={photo.note ?? `Kuva: ${roomName}`}
                className="w-full rounded-[10px]"
              />
            ) : (
              <p className="p-4 text-sm text-ink/60">Kuvaa ei juuri nyt saada näkyviin.</p>
            )}

            <figcaption className="mt-3 px-1 pb-1">
              {photo.note ? <p className="text-sm">{photo.note}</p> : null}
              <p className="mt-1 text-sm text-ink/60">
                {kuvaaja(photo)} · {hetki(photo.takenAtServer)}
              </p>
              {/*
                Tiiviste näkyy jo tässä, ei vasta pöytäkirjassa. Se on kuvan
                tunniste: sillä voi osoittaa, että tiedosto on sama kuin se,
                joka allekirjoitettiin.
              */}
              <p className="mt-0.5 font-mono text-xs text-ink/40">{photo.sha256.slice(0, 16)}…</p>

              {photo.flagged ? (
                <p className="mt-2 text-sm text-coral">
                  Merkitty kuulumattomaksi{photo.flaggedReason ? `: ${photo.flaggedReason}` : ""}
                </p>
              ) : (
                <FlagPhoto tenancyId={tenancyId} photoId={photo.id} disabled={locked} />
              )}
            </figcaption>
          </figure>
        ))}
      </div>

      {previousPhotos && previousPhotos.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-medium">Näin tämä tila oli vuokrasuhteen alkaessa</h2>
          <p className="mt-2 text-sm text-ink/60">
            Alkukatselmuksen kuvat. Niitä ei voi muuttaa — vertaa ja kuvaa uudet sen mukaan, mitä
            itse näet nyt.
          </p>

          <div className="mt-4 flex flex-col gap-6">
            {previousPhotos.map((photo) => (
              <figure
                key={photo.id}
                className="rounded-[var(--radius-panel)] border border-line bg-canvas p-3"
              >
                {photo.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Signed URL vanhenee tunnissa.
                  <img
                    src={photo.url}
                    alt={photo.note ?? `Alkukuva: ${roomName}`}
                    className="w-full rounded-[10px]"
                  />
                ) : (
                  <p className="p-4 text-sm text-ink/60">Kuvaa ei juuri nyt saada näkyviin.</p>
                )}
                <figcaption className="mt-3 px-1 pb-1">
                  {photo.note ? <p className="text-sm">{photo.note}</p> : null}
                  <p className="mt-1 text-sm text-ink/60">
                    {kuvaaja(photo)} · {hetki(photo.takenAtServer)}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
