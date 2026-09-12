/**
 * Sähköposti ilmoitusten varakanavana (CLAUDE.md kohta 2, "Ilmoitukset").
 *
 * ===========================================================================
 * VARAKANAVA, EI RINNAKKAINEN KANAVA
 *
 * Sähköposti lähtee vain silloin, kun push ei mennyt perille yhteenkään
 * laitteeseen. Molempien lähettäminen tarkoittaisi kahta ilmoitusta samasta
 * asiasta, ja Jukka sanoi tästä suoraan (2026-09-11):
 *
 *   "Se ei ole hyvä ratkaisu, että vuokranantaja saa sähköpostin jossa
 *    pyydetään tarkastamaan vuokranmaksu. Herätе puhelimeen on parempi."
 *
 * Sähköposti on siis sitä varten, ettei ilmoitus katoa kokonaan — ei sitä
 * varten, että se tulisi kahdesti.
 *
 * VIESTI ON LYHYT JA TOIMINTO ON LINKKI
 *
 * Sähköpostissa lukee sama kuin ilmoituksessa, ja alla on linkki
 * sovellukseen. Ei painikkeita, ei kuittausta sähköpostista: kuittaus
 * tehdään kirjautuneena, koska se on merkintä jonka toinen osapuoli näkee.
 *
 * ILMAN AVAINTA EI LÄHETETÄ
 *
 * `RESEND_API_KEY` puuttuu → ei lähetystä, ei virhettä. Ilmoitus on silti
 * kirjattu, ja sovelluksessa se näkyy joka tapauksessa.
 * ===========================================================================
 */

export interface EmailMessage {
  to: string;
  title: string;
  body: string;
  /** Polku sovelluksessa, esimerkiksi `/vuokrasuhteet/…/vuokrat`. */
  path: string;
}

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.reilusoppari.fi";
  return new URL(path, base).toString();
}

/**
 * Sähköpostin runko sekä tekstinä että HTML:nä.
 *
 * Molemmat, koska osa asiakasohjelmista näyttää vain tekstiversion — ja
 * pelkkä HTML päätyy roskapostiin useammin kuin kumpikin yhdessä.
 */
function render(message: EmailMessage): { text: string; html: string } {
  const link = appUrl(message.path);

  const text = [
    message.title,
    "",
    message.body,
    "",
    link,
    "",
    "— Reilusoppari",
    "Tämä viesti tuli, koska ilmoituksia ei ole otettu käyttöön puhelimessasi.",
  ].join("\n");

  /*
    Tyylit rivin sisällä eikä `<style>`-lohkossa: moni sähköpostiohjelma
    pudottaa lohkon pois, jolloin viesti näyttäisi rikkinäiseltä.
  */
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c2430;line-height:1.5">
  <p style="font-size:17px;font-weight:600;margin:0 0 12px">${escapeHtml(message.title)}</p>
  <p style="margin:0 0 20px">${escapeHtml(message.body)}</p>
  <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#1c2430;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none">Avaa Reilusoppari</a></p>
  <p style="font-size:13px;color:#6b7683;margin:0">Tämä viesti tuli, koska ilmoituksia ei ole otettu käyttöön puhelimessasi.</p>
</div>`;

  return { text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Onko sähköpostin lähetys konfiguroitu? */
export function hasEmailCredentials(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/**
 * Lähettää yhden viestin Resendin kautta.
 *
 * Palauttaa `false`, jos lähetystä ei tehty — puuttuva avain tai virhe.
 * Kutsuja ei kaadu kumpaankaan: ilmoitus on herätys, ei sisältö.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const from = process.env.EMAIL_FROM?.trim() || "Reilusoppari <ilmoitukset@reilusoppari.fi>";
  const { text, html } = render(message);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.title,
        text,
        html,
      }),
    });

    if (!response.ok) {
      // Vastaanottajaa ei lokiteta: sähköpostiosoite on henkilötietoa.
      console.error("[sähköposti] lähetys epäonnistui, status", response.status);
      return false;
    }

    return true;
  } catch (err) {
    console.error(
      "[sähköposti] lähetys epäonnistui:",
      err instanceof Error ? err.message : "tuntematon virhe",
    );
    return false;
  }
}
