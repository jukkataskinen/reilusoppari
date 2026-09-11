/**
 * Pohjan avain → eSinetin `template_id`.
 *
 * ===========================================================================
 * MIKSI TÄMÄ EI OLE YMPÄRISTÖMUUTTUJA
 *
 * `POST /documents/render` ottaa vastaan UUID:n, mutta Reilusoppari tuntee
 * pohjansa avaimella (`vuokrasopimus_asuinhuoneisto`). Yhdistäminen tehtiin
 * ensin ympäristömuuttujalla, mutta se oli hauras: pohjan uudelleenluonti
 * eSinetissä vaihtaa UUID:n, ja muuttuja jäisi vanhaksi ilman että mikään
 * kertoisi siitä. eSinettiin lisättiin siksi `GET /v1/templates`
 * (esinetti-repo, 2026-09-11), ja tunnisteet haetaan ajossa.
 *
 * JULKAISEMATON POHJA EI KELPAA
 *
 * eSinetti kieltäytyy renderöimästä julkaisematonta pohjaa: sen juridista
 * sisältöä ei ole tarkistettu. `templates:push` vie pohjan, mutta Jukka
 * julkaisee sen. Siihen asti `resolveTemplateId` heittää virheen, joka
 * sanoo sen suoraan — hiljainen 400 eSinetiltä olisi paljon vaikeampi
 * tulkita.
 * ===========================================================================
 */

import { EsinettiError } from "./errors";
import type { EsinettiClient, TemplateInfo, TemplateKey } from "./types";

/**
 * Välimuisti prosessin elinajaksi.
 *
 * Pohjat muuttuvat harvoin — käytännössä vain `templates:push`in jälkeen —
 * eikä jokaisen esikatselun tarvitse hakea listaa uudelleen. Tuoreus
 * varmistetaan aikarajalla eikä mitätöinnillä, koska julkaisu tapahtuu
 * eSinetissä eikä täällä: mitätöintiviestiä ei ole mistä tulla.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { at: number; byKey: Map<string, TemplateInfo> } | null = null;

async function loadTemplates(client: EsinettiClient): Promise<Map<string, TemplateInfo>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.byKey;

  const all = await client.listTemplates();
  const byKey = new Map<string, TemplateInfo>();

  // Uusin versio voittaa. Vanhoja versioita ei poisteta eSinetistä, jotta jo
  // tuotettu asiakirja voidaan tuottaa uudelleen identtisenä — mutta uusi
  // asiakirja tehdään aina tuoreimmasta käytettävissä olevasta.
  for (const template of all) {
    const current = byKey.get(template.key);
    if (!current || template.version > current.version) byKey.set(template.key, template);
  }

  cache = { at: Date.now(), byKey };
  return byKey;
}

/**
 * Pohjan tunniste. Heittää, jos pohjaa ei ole viety tai sitä ei ole julkaistu.
 *
 * Kaksi eri virheviestiä, koska korjaus on eri: viemättömän pohjan korjaa
 * kehittäjä, julkaisemattoman Jukka.
 */
export async function resolveTemplateId(
  client: EsinettiClient,
  key: TemplateKey,
): Promise<string> {
  const template = (await loadTemplates(client)).get(key);

  if (!template) {
    throw new EsinettiError(
      "not_configured",
      "Asiakirjapohjaa ei ole viety eSinettiin. Aja: npm run templates:push",
    );
  }

  if (!template.usable) {
    throw new EsinettiError(
      "not_configured",
      "Asiakirjapohja odottaa hyväksyntää eikä siitä voi vielä tuottaa asiakirjaa.",
    );
  }

  return template.id;
}

/**
 * Pohjan tila ilman heittämistä.
 *
 * Käyttöliittymä voi näyttää "odottaa hyväksyntää" sen sijaan, että
 * toiminto epäonnistuisi vasta painalluksen jälkeen.
 */
export async function getTemplateStatus(
  client: EsinettiClient,
  key: TemplateKey,
): Promise<TemplateInfo | null> {
  return (await loadTemplates(client)).get(key) ?? null;
}

/** Tyhjentää välimuistin. `templates:push` kutsuu tätä, samoin testit. */
export function resetTemplateCache(): void {
  cache = null;
}
