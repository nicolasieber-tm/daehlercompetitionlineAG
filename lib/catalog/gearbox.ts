// Getriebe aus dem Produktnamen ableiten. Die Excel-Preisliste enthält
// keine Getriebe-Spalte je Modell, aber viele Produktnamen (vor allem
// Kraftübertragung: "Schaltwegverkürzung für Handschalter",
// "Getriebeoptimierung St.1 / 8 HP") sind getriebespezifisch. Siehe
// CLAUDE.md Abschnitt "AUFGABE", Punkt 3, und docs/excel-import.md,
// Abschnitt "Getriebe (Kraftübertragung)".
import type { Gearbox } from "@/lib/supabase/rows";

// "Handschalt" deckt "Handschalter"/"Handschaltung"/"Handschaltgetriebe"
// ab, "Schaltgetr" die seltenere Schreibweise ohne "Hand-" davor
// ("Schaltgetriebe") UND ihren Excel-Tippfehler ("Schaltgetribe", siehe
// Korrektur unten), "manuell" die Fälle, die das Wort direkt ausschreiben.
//
// Korrektur 15.09.2026 (Prüfung Modul Getriebe, Befund 1): "dÄHLer
// Alupedale Schaltgetribe" (Z4 G29, Kategorie Interieur - ein Tippfehler
// in der Excel-Quelle, fehlendes "e" in "Getriebe") traf das vorherige
// engere Muster /Schaltgetriebe/ nicht und blieb fälschlich
// getriebeneutral (gearboxFor -> null), während das automatgetriebespe-
// zifische Gegenstück "dÄHLer Alupedale Automatik" korrekt "automatic"
// erhielt (AUTOMATIC_PATTERN unten toleriert Tippfehler wie "Betriebe-
// programmierung"/"Getriebeprogrammierunh" bereits, weil "Automat" allein
// genügt) - ein Kunde, der im Fahrzeug-Schritt "Automat" wählt, hätte im
// Interieur-Schritt trotzdem die Handschalter-Pedale sehen können, ohne
// dass die Prüfung checks.ts hasGearboxConflict() (getriebe_unbekannt)
// anschlägt. "Schaltgetr" statt "Schaltgetriebe" deckt den Tippfehler mit
// ab, ohne unspezifisch zu werden ("Schaltgetriebe"/"Schaltgetribe" sind
// die einzigen zwei im Bestand vorkommenden Schreibweisen mit diesem
// Präfix, siehe docs/excel-import.md Abschnitt "Getriebe").
const MANUAL_PATTERN = /Handschalt|Schaltgetr|manuell/i;
// "8\s*HP" deckt sowohl "8 HP" als auch "8HP" ab (ZF-Automatgetriebe-
// Bezeichnung, in der Excel uneinheitlich mit/ohne Leerzeichen), "DKG"/"DCT"
// Doppelkupplungsgetriebe, "Steptronic" BMW-eigene Automat-Bezeichnung,
// "Wandler" Drehmomentwandler-Automatgetriebe.
const AUTOMATIC_PATTERN = /Automat|8\s*HP|8HP|DKG|DCT|Steptronic|Wandler/i;
// "M6 & A8" (z.B. "M6 & A8-Getriebe" bei den M2 G87 Leistungsstufen): das
// Produkt gilt ausdrücklich für BEIDE Getriebevarianten, nicht getriebe-
// spezifisch - würde ohne diese Ausnahme ohnehin schon null ergeben (weder
// MANUAL_PATTERN noch AUTOMATIC_PATTERN matcht "M6 & A8"), hier trotzdem
// explizit geprüft, wie in der Aufgabenstellung vorgegeben, für den Fall
// künftiger Schreibweisen, die zufällig eines der beiden Muster träfen.
const M6_A8_PATTERN = /M6\s*&\s*A8/i;

/**
 * Getriebe aus dem Produktnamen ableiten. `null`, wenn das Produkt
 * getriebeneutral ist, für beide Getriebevarianten gilt (z.B. "M6 & A8"),
 * oder beide Muster gleichzeitig treffen (widersprüchlich, defensiv als
 * neutral behandelt statt zu raten).
 */
export function gearboxFor(name: string): Gearbox | null {
  if (M6_A8_PATTERN.test(name)) return null;
  const manual = MANUAL_PATTERN.test(name);
  const automatic = AUTOMATIC_PATTERN.test(name);
  if (manual && automatic) return null;
  if (manual) return "manual";
  if (automatic) return "automatic";
  return null;
}

/**
 * true, wenn ein Produkt für die gewählte Getriebeantwort sichtbar bleiben
 * soll (Kategorie-Schritte, siehe components/flow/state.ts): ein
 * getriebeneutrales Produkt (gearbox null) ist immer sichtbar; bei "unknown"
 * oder fehlender Antwort werden alle Produkte gezeigt (die Frage wurde nicht
 * eindeutig beantwortet, nichts ausblenden); sonst nur Produkte ohne
 * Gegensatz zur Wahl.
 */
export function gearboxProductVisible(productGearbox: Gearbox | null, chosen: Gearbox | "unknown" | null): boolean {
  if (productGearbox === null) return true;
  if (chosen === null || chosen === "unknown") return true;
  return productGearbox === chosen;
}
