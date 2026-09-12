"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveReceiptExpense } from "@/app/kuitti/receipt-actions";
import { compressPhoto } from "@/lib/photos/compress";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/categories";
import type { ReceiptReading } from "@/lib/receipts/parse";

export interface PropertyChoice {
  id: string;
  label: string;
}

type Vaihe = "kamera" | "lomake" | "tallennettu";

/**
 * Kuitin kuvaus ja kirjaus (CLAUDE.md 5.7).
 *
 * ===========================================================================
 * KUITTI ENSIN, KULU SITTEN
 *
 * Vanha järjestys oli nurinkurinen: ensin kirjattiin kulu ja sitten kuvattiin
 * kuitti. Todellisuudessa kuitti on kädessä ja se halutaan pois taskusta —
 * joten se kuvataan ensin, ja kulu syntyy siitä.
 *
 * KUVA PYSYY SELAIMESSA, KUNNES KULU TALLENNETAAN
 *
 * Luku ja tallennus ovat eri asioita. Jos kuva tallennettaisiin heti, jokainen
 * keskeytetty kuvaus jättäisi orvon tiedoston Storageen. Nyt keskeytetystä
 * kuvauksesta ei jää mitään.
 *
 * Hinta on se, että selaimen sulkeminen kesken kadottaa kuvan. Se on
 * hyväksyttävää: kulku on yksi näkymä, ja kuitti on yhä olemassa.
 *
 * LUETTU SUMMA ON EHDOTUS
 *
 * Kentät ovat esitäytettyjä mutta muokattavia, ja tallennus vaatii
 * käyttäjän painalluksen. Väärä summa, joka valuisi huomaamatta
 * verolaskelmaan, on pahempi kuin käsin kirjoitettu.
 *
 * KULULUOKKAA EI LUETA KUITILTA
 *
 * Raja vuosikorjauksen ja perusparannuksen välillä on verotuksellinen arvio.
 * Väärin esitäytetty luokka siirtäisi summan hiljaa väärään osioon
 * laskelmassa (`receipts/parse.ts`).
 * ===========================================================================
 */
export function ReceiptCapture({ properties }: { properties: PropertyChoice[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [vaihe, setVaihe] = useState<Vaihe>("kamera");
  const [busy, setBusy] = useState<string | null>(null);
  const [virhe, setVirhe] = useState<string | null>(null);

  // Kuva odottaa muistissa, kunnes kulu tallennetaan.
  const [kuva, setKuva] = useState<Blob | null>(null);
  const [esikatselu, setEsikatselu] = useState<string | null>(null);
  const [luettu, setLuettu] = useState<ReceiptReading | null>(null);
  const [lukuEiKaytossa, setLukuEiKaytossa] = useState(false);

  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [summa, setSumma] = useState("");
  const [paiva, setPaiva] = useState(new Date().toISOString().slice(0, 10));
  const [luokka, setLuokka] = useState("vuosikorjaus");
  const [kuvaus, setKuvaus] = useState("");

  async function otaKuva(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setVirhe(null);
    setBusy("Käsitellään kuvaa…");

    try {
      const { blob } = await compressPhoto(file);
      setKuva(blob);
      setEsikatselu(URL.createObjectURL(blob));

      setBusy("Luetaan kuittia…");
      const reading = await lueKuitti(blob);

      if (reading === "ei-kaytossa") {
        setLukuEiKaytossa(true);
      } else if (reading) {
        setLuettu(reading);
        if (reading.total !== null) setSumma(String(reading.total).replace(".", ","));
        if (reading.date !== null) setPaiva(reading.date);
        if (reading.merchant !== null) setKuvaus(reading.merchant);
      }

      setVaihe("lomake");
    } catch (error) {
      setVirhe(error instanceof Error ? error.message : "Kuvan käsittely ei onnistunut.");
    } finally {
      setBusy(null);
      // Sama tiedosto on voitava valita uudelleen.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  /**
   * Lukee kuitin. Palauttaa `null`, jos luku epäonnistui.
   *
   * Epäonnistuminen EI keskeytä kulkua: lomake aukeaa tyhjänä ja käyttäjä
   * kirjoittaa summan itse. Kuitti on silti tallessa, ja se on se, mikä
   * merkitsee.
   */
  async function lueKuitti(blob: Blob): Promise<ReceiptReading | "ei-kaytossa" | null> {
    try {
      const base64 = await blobToBase64(blob);

      const response = await fetch("/api/kuitti/lue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType: "image/jpeg" }),
      });

      if (!response.ok) return null;

      const payload = (await response.json()) as {
        reading: ReceiptReading | null;
        unavailable?: boolean;
      };

      if (payload.unavailable) return "ei-kaytossa";
      return payload.reading;
    } catch {
      return null;
    }
  }

  async function tallenna(event: React.FormEvent) {
    event.preventDefault();
    setVirhe(null);

    const amount = Number(summa.replace(",", ".").trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      setVirhe("Anna kulun summa euroina.");
      return;
    }

    setBusy("Tallennetaan…");

    try {
      const result = await saveReceiptExpense({
        propertyId,
        date: paiva,
        amount,
        category: luokka,
        description: kuvaus,
      });

      if (!result.ok) {
        setVirhe(result.message);
        return;
      }

      /*
        Kuva lähetetään vasta kun kulu on olemassa.

        Jos lähetys epäonnistuu, kulu jää silti kirjatuksi — se on oikein
        päin: summa on se, jota verolaskelma tarvitsee, ja kuitin voi kuvata
        uudelleen kulun omalta sivulta.
      */
      if (kuva) {
        const body = new FormData();
        body.set("file", kuva, "kuitti.jpg");

        const upload = await fetch(
          `/asunnot/${propertyId}/kulut/${result.expenseId}/kuitti`,
          { method: "POST", body },
        );

        if (!upload.ok) {
          setVirhe(
            "Kulu kirjattiin, mutta kuitin kuva ei mennyt perille. Voit kuvata sen uudelleen kulun sivulta.",
          );
        }
      }

      setVaihe("tallennettu");
      router.refresh();
    } catch {
      setVirhe("Tallennus ei onnistunut. Yritä hetken kuluttua uudelleen.");
    } finally {
      setBusy(null);
    }
  }

  function alusta() {
    if (esikatselu) URL.revokeObjectURL(esikatselu);
    setVaihe("kamera");
    setKuva(null);
    setEsikatselu(null);
    setLuettu(null);
    setSumma("");
    setKuvaus("");
    setPaiva(new Date().toISOString().slice(0, 10));
    setVirhe(null);
  }

  /* --- Valmis ---------------------------------------------------------- */

  if (vaihe === "tallennettu") {
    return (
      <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <p className="font-medium">Kulu kirjattu</p>
        <p className="mt-2 text-sm text-ink/70">
          Se on mukana asunnon verolaskelmassa. Kulut ja kuitit näkyvät vain sinulle.
        </p>

        {virhe ? (
          <p role="alert" className="mt-3 text-sm text-coral">
            {virhe}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={alusta}
            className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper"
          >
            Kuvaa seuraava
          </button>
          <a
            href={`/asunnot/${propertyId}/kulut`}
            className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
          >
            Asunnon kulut
          </a>
        </div>
      </div>
    );
  }

  /* --- Kamera ---------------------------------------------------------- */

  if (vaihe === "kamera") {
    return (
      <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        {virhe ? (
          <p role="alert" className="mb-4 rounded-[10px] border border-coral bg-paper p-3 text-sm">
            {virhe}
          </p>
        ) : null}

        <label
          className={
            "flex min-h-[var(--size-touch)] cursor-pointer items-center justify-center rounded-full px-6 font-medium " +
            (busy ? "bg-ink/60 text-paper" : "bg-ink text-paper")
          }
        >
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={otaKuva}
            disabled={busy !== null}
            className="sr-only"
          />
          {busy ?? "Kuvaa kuitti"}
        </label>

        <p className="mt-3 text-sm text-ink/60">
          Kuva pienennetään ennen lähetystä. Sijaintitieto poistetaan aina.
        </p>
      </div>
    );
  }

  /* --- Lomake ---------------------------------------------------------- */

  return (
    <form onSubmit={tallenna} className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      {esikatselu ? (
        // eslint-disable-next-line @next/next/no-img-element -- Paikallinen blob-URL, ei Next-optimoitavaa.
        <img
          src={esikatselu}
          alt="Kuvattu kuitti"
          className="mb-4 max-h-64 w-full rounded-[10px] object-contain"
        />
      ) : null}

      {luettu && (luettu.total !== null || luettu.merchant !== null) ? (
        <p className="mb-4 rounded-[10px] border border-line bg-canvas p-3 text-sm text-ink/70">
          Luin kuitilta esitäytetyt tiedot. Tarkista ne — korjaa rohkeasti, jos jokin meni väärin.
        </p>
      ) : lukuEiKaytossa ? (
        <p className="mb-4 rounded-[10px] border border-line bg-canvas p-3 text-sm text-ink/70">
          Kuitin automaattinen luku ei ole käytössä tässä ympäristössä. Täytä kentät itse.
        </p>
      ) : (
        <p className="mb-4 rounded-[10px] border border-line bg-canvas p-3 text-sm text-ink/70">
          En saanut kuitista luettua tietoja. Täytä kentät itse — kuitti tallentuu silti.
        </p>
      )}

      {/*
        Asunnon valinta jää kokonaan pois, jos asuntoja on yksi. Valintalista,
        jossa on yksi vaihtoehto, on kysymys jolla ei ole vastausta.
      */}
      {properties.length > 1 ? (
        <label className="block">
          <span className="block text-sm font-medium">Mihin asuntoon kuitti kuuluu?</span>
          <select
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value)}
            className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
          >
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm text-ink/60">Asunto: {properties[0]?.label}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <label className="flex-1">
          <span className="block text-sm font-medium">Summa, €</span>
          <input
            value={summa}
            onChange={(event) => setSumma(event.target.value)}
            inputMode="decimal"
            required
            className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
          />
        </label>
        <label className="flex-1">
          <span className="block text-sm font-medium">Päivä</span>
          <input
            type="date"
            value={paiva}
            onChange={(event) => setPaiva(event.target.value)}
            required
            className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
          />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="block text-sm font-medium">Kululuokka</span>
        <select
          value={luokka}
          onChange={(event) => setLuokka(event.target.value)}
          className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
        >
          {EXPENSE_CATEGORIES.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
        {/*
          Luokkaa ei lueta kuitilta. Se on verotuksellinen arvio, ja väärin
          esitäytetty luokka siirtäisi summan hiljaa väärään osioon.
        */}
        <span className="mt-1.5 block text-sm text-ink/60">
          Luokan valitset sinä: se ratkaisee, vähennetäänkö kulu vuosikuluna vai poistoina.
        </span>
      </label>

      <label className="mt-4 block">
        <span className="block text-sm font-medium">Kuvaus</span>
        <input
          value={kuvaus}
          onChange={(event) => setKuvaus(event.target.value)}
          maxLength={300}
          placeholder="Esimerkiksi: hanan vaihto keittiöön"
          className="mt-1.5 w-full rounded-[10px] border border-line bg-paper p-3 text-base"
        />
      </label>

      {virhe ? (
        <p role="alert" className="mt-3 text-sm text-coral">
          {virhe}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy !== null}
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
        >
          {busy ?? "Tallenna kulu"}
        </button>
        <button
          type="button"
          onClick={alusta}
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-line px-5 text-sm"
        >
          Kuvaa uudelleen
        </button>
      </div>
    </form>
  );
}

/** Blob base64:ksi ilman data-URI-etuliitettä. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Kuvan luku epäonnistui."));
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}
