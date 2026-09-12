"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { compressPhoto } from "@/lib/photos/compress";
import { NOTE_GUIDANCE } from "@/lib/inspection/rooms";

/**
 * Kuvan ottaminen katselmuksessa.
 *
 * ===========================================================================
 * SELITE KIRJOITETAAN ENNEN KUVAA
 *
 * Kenttä on lomakkeella ylhäällä ja kamera sen alla. Syy on käytännöllinen:
 * asunnossa seisten kuva otetaan ja seuraava kohta odottaa jo, eikä kukaan
 * palaa kirjoittamaan selitettä jälkikäteen. Jos selite on kirjoitettava
 * ensin, se joko kirjoitetaan tai jätetään tietoisesti väliin — kumpikin on
 * parempi kuin unohtuminen.
 *
 * Selite on vapaaehtoinen. Pakollinen kenttä tuottaisi tekstejä kuten "ok",
 * ja tyhjä selite on rehellisempi kuin merkityksetön.
 *
 * LÄHETYS ON YKSI KUVA KERRALLAAN
 *
 * Ei jonoa eikä taustalähetystä: katselmus tehdään asunnossa, jossa yhteys
 * voi olla huono, ja hiljaa epäonnistunut lähetys tarkoittaa puuttuvaa
 * todistetta. Käyttäjä näkee jokaisen kuvan kohdalla, menikö se perille.
 * ===========================================================================
 */
export function PhotoCapture({
  endpoint,
  room,
  disabled = false,
  label = "Ota kuva",
}: {
  /** Mihin kuva lähetetään. Katselmus ja huoltokirja ottavat sen eri reittiin. */
  endpoint: string;
  /** Katselmuksessa huoneen nimi; huoltokirjassa tyhjä. */
  room?: string;
  disabled?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus("sending");
    setMessage(null);

    try {
      const { blob, thumbnail } = await compressPhoto(file);

      const body = new FormData();
      body.set("file", blob, "kuva.jpg");
      // Pienoiskuva asiakirjoihin: täysikokoinen kuva kasvattaisi pöytäkirjan
      // kymmeniin megatavuihin ilman että mikään näkyisi paremmin.
      body.set("thumbnail", thumbnail, "pienoiskuva.jpg");
      if (room) body.set("room", room);
      body.set("note", note);

      const response = await fetch(endpoint, { method: "POST", body });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Kuvan lähetys ei onnistunut.");
      }

      setNote("");
      setStatus("idle");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Kuvan lähetys ei onnistunut.");
    } finally {
      // Sama tiedosto on voitava valita uudelleen, jos lähetys epäonnistui.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  if (disabled) return null;

  return (
    <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      <label htmlFor="kuvan-selite" className="text-sm font-medium">
        Selite (vapaaehtoinen)
      </label>
      <input
        id="kuvan-selite"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={300}
        placeholder="Esimerkiksi: naarmu uunin luukussa"
        className="mt-1.5 min-h-[var(--size-touch)] w-full rounded-[10px] border border-line bg-paper px-3 text-base"
      />
      <p className="mt-1.5 text-sm text-ink/60">{NOTE_GUIDANCE}</p>

      {message ? (
        <p role="alert" className="mt-4 rounded-[10px] border border-coral bg-paper p-3 text-sm">
          {message}
        </p>
      ) : null}

      <label
        className={
          "mt-4 flex min-h-[var(--size-touch)] cursor-pointer items-center justify-center rounded-full px-6 font-medium " +
          (status === "sending" ? "bg-ink/60 text-paper" : "bg-ink text-paper")
        }
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          disabled={status === "sending"}
          className="sr-only"
        />
        {status === "sending" ? "Lähetetään…" : label}
      </label>

      <p className="mt-3 text-sm text-ink/60">
        Kuva pienennetään ennen lähetystä. Sijaintitieto poistetaan aina.
      </p>
    </div>
  );
}
