/**
 * Tuotannon päivittäisen savutestin askelten ajo (Jukan päätös 14.10.2026).
 *
 * Miksi: WeasyPrint-virhe oli tuotannossa kuusi päivää ennen kuin kukaan
 * huomasi. GitHub Actions kutsuu `/api/savutesti`-reittiä joka aamu, ja
 * epäonnistunut askel avaa `tuotantovika`-issuen.
 *
 * Vastaukseen menee vain askeleen nimi, onnistuminen, kesto ja lyhyt
 * virhekoodi. Ei virheviestejä, ei henkilötietoja, ei asiakirjojen sisältöä:
 * vastaus näkyy GitHubin lokissa.
 */

export interface SavutestiAskel {
  nimi: string;
  aja: () => Promise<void>;
}

export interface AskeleenTulos {
  nimi: string;
  ok: boolean;
  ms: number;
  /** Lyhyt koodi (esim. `render_failed`), ei koskaan vapaata tekstiä. */
  koodi?: string;
}

export interface SavutestinTulos {
  ok: boolean;
  vaiheet: AskeleenTulos[];
}

/** Virhe, jonka koodi näytetään vastauksessa sellaisenaan. */
export class SavutestiVirhe extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "SavutestiVirhe";
    this.code = code;
  }
}

const KOODI = /^[a-z0-9_]{1,40}$/;

/**
 * Virheestä vain koodi: omien virheluokkien `code`, jos se on lyhyt
 * tunniste, muuten `virhe`. Viesti voisi sisältää sisäistä rakennetta.
 */
export function virhekoodi(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && KOODI.test(code) ? code : "virhe";
}

/** Varmistus askeleen sisällä: epätosi ehto kaataa askeleen annetulla koodilla. */
export function varmista(ehto: unknown, koodi: string): asserts ehto {
  if (!ehto) throw new SavutestiVirhe(koodi);
}

/**
 * Ajaa askeleet peräkkäin. Yksi kaatuva askel ei pysäytä muita, jotta
 * aamun raportti kertoo kerralla kaiken rikkinäisen. Aikaraja per askel
 * estää jumittuvaa palvelua viemästä koko funktion aikaa.
 */
export async function ajaAskeleet(
  askeleet: SavutestiAskel[],
  { aikaraja = 25_000, kello = () => Date.now() }: { aikaraja?: number; kello?: () => number } = {},
): Promise<SavutestinTulos> {
  const vaiheet: AskeleenTulos[] = [];
  for (const askel of askeleet) {
    const alku = kello();
    let ajastin: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        askel.aja(),
        new Promise<never>((_, hylkaa) => {
          ajastin = setTimeout(() => hylkaa(new SavutestiVirhe("aikaraja")), aikaraja);
        }),
      ]);
      vaiheet.push({ nimi: askel.nimi, ok: true, ms: kello() - alku });
    } catch (error) {
      const koodi = virhekoodi(error);
      // Lokiin sama kuin vastaukseen: askel ja koodi, ei viestiä.
      console.error(`[savutesti] ${askel.nimi} epäonnistui: ${koodi}`);
      vaiheet.push({ nimi: askel.nimi, ok: false, ms: kello() - alku, koodi });
    } finally {
      if (ajastin) clearTimeout(ajastin);
    }
  }
  return { ok: vaiheet.every((v) => v.ok), vaiheet };
}
