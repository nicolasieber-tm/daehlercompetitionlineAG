// Slug-Funktion für Baureihen- und Modellnamen aus der Excel-Preisliste.
// Regeln (docs/excel-import.md): NFKD-normalisieren, diakritische Zeichen
// entfernen, lowercase, alles ausser [a-z0-9] zu '-', Mehrfach-'-'
// zusammenfassen, Ränder trimmen.
//
// Beispiele:
//   slug('M3 / M4 G80, G81, G82, G83') === 'm3-m4-g80-g81-g82-g83'
//   slug('2er F44 Gran Coupé')          === '2er-f44-gran-coupe'
//   slug('M5 G90, M5 G99 Touring')      === 'm5-g90-m5-g99-touring'
export function slug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // diakritische Zeichen (Kombinationszeichen) entfernen
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // alles ausser a-z0-9 zu '-'
    .replace(/-+/g, "-") // Mehrfach-'-' zusammenfassen
    .replace(/^-|-$/g, ""); // Ränder trimmen
}
