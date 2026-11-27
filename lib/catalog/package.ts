// Mehrere Positionen (Rückmeldung dÄHLer 26.11.2026, präzisiert 27.11.2026):
// Welche Kombinationen einen Paketpreis bekommen, steht nirgends (die Excel
// führt nur Einzelpositionen), das Tool erkennt deshalb keine Pakete. Ab zwei
// Positionen mit Preis zeigen Navigation, Abschluss-Screen, Teilen-Seite und
// Bestätigungsmail die Summe der Einzelpreise und darunter den Mailtext
// text_package_offer (lib/mail/texts.ts), der ein Paketangebot nur in
// Aussicht stellt. Christoph Dähler entscheidet im Antwortentwurf, ob es
// einen Paketpreis gibt.

/** Anzahl Positionen mit Preis, ab der der Paket-Hinweis erscheint. */
export const PACKAGE_MIN_PRICED_ITEMS = 2;

/** true, wenn mindestens PACKAGE_MIN_PRICED_ITEMS Positionen einen Preis haben. */
export function isPackage(pricedFlags: readonly boolean[]): boolean {
  return pricedFlags.filter(Boolean).length >= PACKAGE_MIN_PRICED_ITEMS;
}
