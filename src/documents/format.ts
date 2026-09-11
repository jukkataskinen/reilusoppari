/**
 * Suomalaiset muotoilut asiakirjoihin.
 *
 * Nämä on kirjoitettu käsin eikä `Intl`:llä tarkoituksella: `Intl` käyttää
 * kapeaa sitomatonta välilyöntiä (U+202F) euromerkin edessä, ja se on
 * PDF-fontissa eri glyyfi kuin tavallinen välilyönti. Asiakirjan on
 * näytettävä samalta riippumatta siitä, millä koneella se renderöidään.
 */

/** `1.9.2026`. Ei nollia edessä — niin päiväys kirjoitetaan suomeksi. */
export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getUTCDate()}.${date.getUTCMonth() + 1}.${date.getUTCFullYear()}`;
}

/** `850 €` tai `1 250,50 €`. Tuhaterotin on tavallinen välilyönti. */
export function formatEuro(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const hasCents = rounded % 1 !== 0;
  const [whole, cents] = rounded.toFixed(hasCents ? 2 : 0).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return cents ? `${grouped},${cents} €` : `${grouped} €`;
}

/** `Testikatu 1 A 4, 00100 Helsinki` */
export function formatAddress(property: {
  street: string;
  postalCode: string;
  city: string;
}): string {
  return `${property.street}, ${property.postalCode} ${property.city}`;
}

/** `Maija ja Matti` — luettelo ihmisen tapaan, ei pilkuilla loppuun asti. */
export function formatNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} ja ${names[names.length - 1]}`;
}

/**
 * Lukumäärä ja sen pääsana suomeksi taivutettuna.
 *
 * `1 kuukausi`, `2 kuukautta`. Ilman tätä asiakirjassa lukisi "1 kuukautta",
 * ja juuri sellainen virhe saa lukijan epäilemään koko asiakirjan
 * huolellisuutta.
 */
export function formatCount(count: number, singular: string, partitive: string): string {
  return `${count} ${count === 1 ? singular : partitive}`;
}
