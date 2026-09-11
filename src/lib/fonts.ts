import localFont from "next/font/local";

/**
 * Sama Plus Jakarta Sans kuin sivustolla (reilusoppari-web). Itse hostattuna,
 * ei Google Fonts -CDN-kutsuja: sovellus ja sivusto ovat sama tuote, joten
 * niiden on näytettävä samalta.
 */
export const sans = localFont({
  src: "../../public/fonts/sans-variable.woff2",
  weight: "400 800",
  style: "normal",
  display: "swap",
  variable: "--font-sans-local",
  adjustFontFallback: "Arial",
});
