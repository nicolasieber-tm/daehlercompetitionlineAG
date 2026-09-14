import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";
import { getLocaleFromCookies, LocaleProvider } from "@/lib/i18n";
import "./globals.css";

// Fonts aus docs/architektur.md, Abschnitt "Design", als CSS-Variablen
// eingebunden. Die Variablen werden in app/globals.css im @theme-Block
// auf --font-display / --font-body / --font-mono gemappt.
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "dÄHLer Anfrage-Erlebnis",
  description: "Geführtes Anfragetool für dÄHLer Competition Line AG",
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getLocaleFromCookies();

  return (
    <html lang={lang} data-theme="dark">
      <body
        className={`${barlowCondensed.variable} ${barlow.variable} ${ibmPlexMono.variable} antialiased`}
      >
        <LocaleProvider initialLocale={lang}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
