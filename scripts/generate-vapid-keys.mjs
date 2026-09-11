/**
 * VAPID-avainparin generointi web pushia varten (CLAUDE.md kohta 2).
 * Aja `npm run keys:vapid` ja liitä tuloste `.env.local`:iin.
 *
 * Yksityinen avain on salaisuus: sitä ei koskaan committoida eikä lokiteta.
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY=" + publicKey);
console.log("VAPID_PRIVATE_KEY=" + privateKey);
console.log("");
console.log("Liitä nämä .env.local-tiedostoon ja Vercelin ympäristömuuttujiin.");
console.log("Yksityistä avainta ei saa committoida.");
