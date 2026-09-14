// Formatierungs-Helfer für Preise, Datumswerte und Anfragenummern.
// Schweizer Schreibweise: Apostroph als Tausendertrennzeichen, keine Rappen.
import type { Locale } from "./index";

/**
 * Formatiert einen Frankenbetrag ohne Rappen, mit Apostroph als
 * Tausendertrennzeichen: chf(4180) -> "CHF 4'180"
 *
 * Negative Beträge werden mit vorangestelltem Minus formatiert
 * (chf(-500) -> "CHF -500"); im Flow und in den Preislisten kommen sie
 * nicht vor, chf() selbst schliesst sie aber nicht aus.
 *
 * NaN und Infinity sind kein gültiger Frankenbetrag (z.B. Rechenfehler bei
 * einer leeren Summe): chf() liefert dafür einen leeren String statt eines
 * irreführenden Preises im UI, und warnt über console.warn, damit der
 * Fehler nicht stillschweigend im Text verschwindet.
 */
export function chf(amount: number): string {
  if (!Number.isFinite(amount)) {
    console.warn(`chf(): ungültiger Betrag ${amount}, gebe leeren String zurück.`);
    return "";
  }
  const rounded = Math.round(amount);
  const digits = Math.abs(rounded).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  const sign = rounded < 0 ? "-" : "";
  return `CHF ${sign}${grouped}`;
}

/**
 * Formatiert einen Richtpreis mit "ab" (de) bzw. "from" (en) Präfix:
 * chfFrom(4180, "de") -> "ab CHF 4'180"
 * chfFrom(4180, "en") -> "from CHF 4'180"
 */
export function chfFrom(amount: number, locale: Locale): string {
  const prefix = locale === "en" ? "from" : "ab";
  return `${prefix} ${chf(amount)}`;
}

/**
 * Formatiert ein Datum lokalisiert: de-CH oder en-GB.
 *
 * Mit timeZone: "Europe/Zurich" (analog lib/followups/schedule.ts,
 * zurichDateString()), damit das angezeigte Datum unabhängig von der
 * Server-Zeitzone stimmt: in Produktion (Railway, Standard-TZ UTC, siehe
 * docs/architektur.md, Abschnitt "Umgebungsvariablen") würde eine Anfrage
 * von 22:30 UTC ohne timeZone als Vortag angezeigt, obwohl sie in
 * Schweizer Ortszeit (00:30) bereits am Folgetag liegt - und damit auch
 * nicht mehr zum Kalendertag passen, den lib/admin/inquiries.ts
 * (zurichDayBoundsUtc()) für den Von/Bis-Filter zugrunde legt.
 */
export function formatDate(date: Date, locale: Locale): string {
  const intlLocale = locale === "en" ? "en-GB" : "de-CH";
  return new Intl.DateTimeFormat(intlLocale, {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/**
 * Formatiert die Anfragenummer als Label: "Nr. 2026-0912" (de) / "No. 2026-0912" (en)
 */
export function inquiryNumberLabel(number: string, locale: Locale): string {
  const prefix = locale === "en" ? "No." : "Nr.";
  return `${prefix} ${number}`;
}
