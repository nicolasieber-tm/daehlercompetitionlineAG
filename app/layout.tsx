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
    // Die next/font-Variablenklassen müssen auf <html> (== :root) sitzen,
    // nicht auf <body>: app/globals.css setzt --font-display/--font-body/
    // --font-mono im @theme-Block auf :root und referenziert dort
    // --font-barlow-condensed usw. per var(...) OHNE Fallback-Argument. Ein
    // var()-Verweis auf eine an diesem Element (hier :root) nicht
    // deklarierte Eigenschaft macht die GANZE Deklaration am Punkt ihrer
    // eigenen Zuweisung ungültig ("guaranteed-invalid value") - dieser
    // ungültige Wert vererbt sich dann unverändert an alle Nachfahren
    // (body, h1, ...), unabhängig davon, dass --font-barlow-condensed dort
    // (vormals nur auf <body>) durchaus definiert war: Custom Properties
    // werden pro deklarierendem Element aufgelöst, nicht pro Verwendung.
    // Ergebnis: --font-display/--font-body/--font-mono griffen im gesamten
    // Kundenflow nie, der Browser fiel auf die Fallback-Schriften
    // ("Arial Narrow"/"Helvetica Neue"/Menlo) zurück (Prüfung, Befund 1).
    <html lang={lang} data-theme="dark" className={`${barlowCondensed.variable} ${barlow.variable} ${ibmPlexMono.variable}`}>
      <body className="antialiased">
        <LocaleProvider initialLocale={lang}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
