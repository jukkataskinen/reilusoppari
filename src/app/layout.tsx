import type { Metadata, Viewport } from "next";
import { sans } from "@/lib/fonts";
import { fi } from "@/i18n/fi";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: fi.app.name, template: `%s | ${fi.app.name}` },
  description: fi.app.tagline,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    // iOS ei lue manifestin kuvakkeita kotivalikkoon, vaan tämän.
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: fi.app.name, statusBarStyle: "default" },
  // Sovellus ei ole julkinen sisältö eikä sitä indeksoida.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1b2a41",
  width: "device-width",
  initialScale: 1,
  // Zoomausta ei estetä: se on saavutettavuusongelma, ja kaksoisnapautus-
  // zoom on jo estetty CSS:n touch-actionilla.
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fi" className={`${sans.variable} h-full`}>
      <body className="min-h-full bg-cloud text-ink antialiased">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
