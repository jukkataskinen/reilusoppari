"use server";

import { getEsinettiClient } from "@/lib/esinetti";

/**
 * Aitouden tarkistus (CLAUDE.md kohta 2, eSinetin `GET /verify`).
 *
 * ===========================================================================
 * VASTAUS EI PALJASTA SISÄLTÖÄ
 *
 * Kerrotaan vain, onko tiivisteellä sinetöity asiakirja ja milloin. Ei
 * nimiä, ei osoitetta, ei arviota — muuten tiiviste olisi avain toisen
 * asiakirjan lukemiseen, ja tiivisteitä liikkuu sähköposteissa.
 *
 * Tarkistus on julkinen eikä vaadi kirjautumista: se on tarkoitettu sille,
 * joka ei ole palvelun käyttäjä.
 * ===========================================================================
 */

export interface VerifyState {
  message?: string;
  result?: {
    found: boolean;
    name?: string;
    sealedAt?: string;
  };
}

export async function verifyAction(
  _previous: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const sha256 = String(formData.get("sha256") ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s/g, "");

  // Muoto tarkistetaan ennen kutsua: mielivaltainen syöte ei päädy eSinettiin.
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    return { message: "Tiiviste on 64 merkkiä pitkä ja koostuu numeroista ja kirjaimista a–f." };
  }

  try {
    const result = await getEsinettiClient().verifyDocument(sha256);

    if (!result.found) return { result: { found: false } };

    return {
      result: {
        found: true,
        name: result.document.name,
        sealedAt: result.round?.sealedAt?.slice(0, 10),
      },
    };
  } catch (err) {
    console.error(
      "[todistukset] aitouden tarkistus epäonnistui:",
      err instanceof Error ? err.message : err,
    );
    return { message: "Tarkistus ei juuri nyt onnistu. Yritä hetken kuluttua uudelleen." };
  }
}
