// Reine Hilfen für die Platzhalter {{anrede}} und {{modell}} der Mailtexte
// (lib/mail/texts.ts). Rückmeldung dÄHLer 28.10.2026 (Beispielmail «Guten
// Tag Herr Dähler», «Ihren neuen BMW M2»). Absichtlich ohne DB-/Node-Importe,
// damit auch die Live-Vorschau im Admin (Client) sie verwenden kann.
import type { Locale } from "@/lib/i18n/dictionaries";

export const SALUTATION_VALUES = ["herr", "frau"] as const;
export type Salutation = (typeof SALUTATION_VALUES)[number];

const SALUTATION_WORD: Record<Locale, Record<Salutation, string>> = {
  de: { herr: "Herr", frau: "Frau" },
  en: { herr: "Mr", frau: "Ms" },
};

/** Gültige Anrede oder null (unbekannte Werte aus der DB zählen als keine Angabe). */
export function normalizeSalutation(value: string | null | undefined): Salutation | null {
  return (SALUTATION_VALUES as readonly string[]).includes(value ?? "") ? (value as Salutation) : null;
}

/**
 * {{anrede}}: mit Anrede «Herr Dähler» / «Frau Muster» (en: «Mr Dähler»),
 * ohne Anrede oder ohne Nachnamen «Vorname Name» wie bisher. Nie aus dem
 * Vornamen abgeleitet.
 */
export function anredeText(
  salutation: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  locale: Locale,
): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  const sal = normalizeSalutation(salutation);
  if (sal && last) return `${SALUTATION_WORD[locale]?.[sal] ?? SALUTATION_WORD.de[sal]} ${last}`;
  return [first, last].filter(Boolean).join(" ");
}

/** Anrede mit Vor- und Nachnamen für die Admin-Anzeige, «Herr Christoph Dähler». */
export function fullNameWithSalutation(
  salutation: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  locale: Locale = "de",
): string {
  const name = [firstName, lastName].filter(Boolean).join(" ");
  const sal = normalizeSalutation(salutation);
  return sal && name ? `${SALUTATION_WORD[locale][sal]} ${name}` : name;
}

/**
 * {{modell}}: die Fahrzeugbezeichnung ohne Baureihencode in Klammern am
 * Ende, «BMW M2» statt «BMW M2 (G87)» (lib/catalog/vehicle-label.ts setzt
 * die Codes immer ans Ende, siehe dortige Regel 3).
 */
export function modellLabel(vehicleLabel: string): string {
  const stripped = vehicleLabel.replace(/\s*\([^()]*\)\s*$/, "").trim();
  return stripped || vehicleLabel.trim();
}
