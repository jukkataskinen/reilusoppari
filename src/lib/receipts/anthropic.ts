/**
 * Kuitin luku Anthropicin Messages API:lla.
 *
 * ===========================================================================
 * SAMA RATKAISU KUIN KASAMASTERISSA — JA SAMAT OPITUT ASIAT
 *
 * Jukan toinen järjestelmä lukee vaakalappuja samalla rajapinnalla
 * (`kasamaster/app/api/scan.js`). Sieltä on siirretty tänne kolme asiaa,
 * jotka on siellä opittu kantapään kautta:
 *
 * 1. **Avain vain palvelimella.** KasaMasterissa kutsu tehtiin aluksi
 *    selaimesta avaimella, jonka nimi alkoi Viten etuliitteellä — ja Vite
 *    kirjoittaa sellaiset muuttujat käännösaikana selaimeen ladattavaan
 *    koodiin. Avain oli kenen tahansa luettavissa. Tässä moduuli on
 *    palvelinpuolella eikä `NEXT_PUBLIC_`-etuliitettä ole.
 *
 * 2. **`max_tokens` kattaa ajattelun JA vastauksen.** Uusissa malleissa
 *    ajattelu on oletuksena päällä. Pelkälle JSON-vastaukselle riittäisi
 *    parisataa tokenia, mutta se katkaisisi vastauksen kesken — usein niin,
 *    ettei tekstiä tulisi lainkaan.
 *
 * 3. **Tilakoodi virheeseen mukaan.** Ilman sitä vianetsintä on arvailua:
 *    401 tarkoittaa avainta, 404 mallia, 429 ruuhkaa. KasaMasterissa sen
 *    puuttuminen maksoi yhden kokonaisen selvityskierroksen.
 *
 * MIKSI SDK EIKÄ SUORA REST-KUTSU
 *
 * Tässä repossa Stripe puhutaan REST:llä ilman kirjastoa, joten tämä on
 * poikkeus. Kaksi syytä: SDK:n `maxRetries` uusii 429-, 529- ja
 * 5xx-tilanteet kasvavalla odotuksella, mikä on juuri se logiikka, jota ei
 * kannata kirjoittaa itse maksavalle reitille — ja Jukan toinen järjestelmä
 * käyttää samaa kirjastoa, joten korjaus toiseen on ymmärrettävissä
 * toisessa.
 * ===========================================================================
 */

import Anthropic from "@anthropic-ai/sdk";
import { extractJson, parseReceipt, RECEIPT_PROMPT } from "./parse";
import type { ReadReceiptInput, ReadReceiptResult, ReceiptReader } from "./types";

/**
 * Malli.
 *
 * Sonnet 5, koska rypistynyt lämpöpaperikuitti on vaikeampi luettava kuin
 * vaakalappu. Jos osuvuus riittää oikeilla kuiteilla, Haiku 4.5 on halvempi
 * ja nopeampi — vaihto on tämän vakion muuttaminen, ja vertailu kannattaa
 * tehdä vasta kun kuitteja on kertynyt.
 */
const MODEL = "claude-sonnet-5";

/**
 * Vastauksen katto.
 *
 * Kattaa ajattelun ja vastauksen yhdessä (ks. yllä). 1024 on sama arvo,
 * jolla KasaMasterin vaakalappujen luku toimii.
 */
const MAX_TOKENS = 1024;

/** Yhteensä kolme yritystä. SDK odottaa kasvavan ajan yritysten välissä. */
const MAX_RETRIES = 2;

export class AnthropicReceiptReader implements ReceiptReader {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: MAX_RETRIES });
  }

  async read(input: ReadReceiptInput): Promise<ReadReceiptResult> {
    try {
      const message = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: input.mediaType as "image/jpeg" | "image/png",
                  data: input.imageBase64,
                },
              },
              { type: "text", text: RECEIPT_PROMPT },
            ],
          },
        ],
      });

      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      if (!text) {
        return { ok: false, status: 502, message: "Kuitista ei saatu luettua mitään." };
      }

      /*
        Jäsennys ei heitä koskaan: rikkinäinen vastaus tuottaa tyhjän
        luennan, ja käyttäjä täyttää kentät itse. Kuitti on silti tallessa —
        lukeminen on apu, ei ehto.
      */
      return { ok: true, reading: parseReceipt(extractJson(text)), raw: text };
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        const status = err.status || 502;

        // Koko virhe palvelimen lokiin, pelkkä tilakoodi selaimeen. Kuitin
        // sisältö ei päädy lokiin.
        console.error("[kuitti] Anthropic-virhe", status, err.message);

        return {
          ok: false,
          status,
          message:
            status === 429 || status === 529
              ? "Palvelu on ruuhkautunut. Yritä hetken päästä."
              : `Kuitin luku epäonnistui (HTTP ${status}).`,
        };
      }

      console.error("[kuitti] yhteysvirhe:", err instanceof Error ? err.message : err);
      return { ok: false, status: 502, message: "Yhteys lukupalveluun epäonnistui." };
    }
  }
}
