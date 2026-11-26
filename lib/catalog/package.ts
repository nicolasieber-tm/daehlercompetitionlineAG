// Paket oder Einzelposition (Rückmeldung dÄHLer 26.11.2026): ab zwei
// Positionen mit Preis gilt die Auswahl als Paket. Der Paketpreis liegt
// unter der Summe der Einzelpreise, deshalb zeigen Bestätigungsmail,
// Abschluss-Screen und Teilen-Seite dann keine Summe, sondern den Mailtext
// text_package_offer (lib/mail/texts.ts). Der Antwortentwurf nennt die
// Summe weiterhin, Christoph Dähler setzt dort den Paketpreis ein.

/** Anzahl Positionen mit Preis, ab der die Auswahl als Paket gilt. */
export const PACKAGE_MIN_PRICED_ITEMS = 2;

/** true, wenn mindestens PACKAGE_MIN_PRICED_ITEMS Positionen einen Preis haben. */
export function isPackage(pricedFlags: readonly boolean[]): boolean {
  return pricedFlags.filter(Boolean).length >= PACKAGE_MIN_PRICED_ITEMS;
}
