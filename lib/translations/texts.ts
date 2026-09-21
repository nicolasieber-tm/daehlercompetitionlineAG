// Welche Excel-Texte überhaupt übersetzt werden (reine Funktionen, kein
// DB-Zugriff): dieselbe Herleitung liefert die Quelltexte beim Sammeln für
// den Übersetzungslauf (lib/translations/sync.ts), beim Zusammenstellen der
// Map für einen Kategorie-Schritt (lib/catalog/queries.ts) und beim
// Einfrieren der Positionen einer Anfrage (lib/inquiry/create.ts). Damit
// passen Schlüssel und Nachschlagen (lib/catalog/product-display.ts) immer
// zusammen.
//
// Leistungsstufen (variant_group "leistung", ohne das eigenständige
// V/max-Produkt): nicht der ganze Name («Stufe 1: (Basis 480 PS) 620PS /
// 740Nm (M6 & A8-Getriebe)»), sondern nur die abgeleitete Restinformation
// productDisplay().detail («M6 & A8-Getriebe») - Titel und PS/Nm-Zeile sind
// bereits lokalisiert bzw. sprachneutral. Alle anderen Produkte: Name und
// (als Ganzes, mehrzeilig) die Beschreibung.
import { isStageItem, productDisplay } from "@/lib/catalog/product-display";
import { normalizeSourceText } from "./resolve";

export type SourceTextKind = "name" | "description" | "detail" | "group" | "category" | "note";

export interface SourceText {
  /** Normalisierter Quelltext (Schlüssel in product_translations.source_text). */
  text: string;
  kind: SourceTextKind;
}

export interface TranslatableProduct {
  name: string;
  description?: string | null;
  variant_group?: string | null;
  ps_to?: number | null;
  nm_to?: number | null;
}

/** Quelltexte eines einzelnen Produkts (siehe Dateikommentar). */
export function productSourceTexts(product: TranslatableProduct): SourceText[] {
  const out: SourceText[] = [];
  const stage = isStageItem({ name: product.name, variant_group: product.variant_group ?? null, ps_to: product.ps_to ?? null });
  if (stage) {
    const detail = productDisplay(
      {
        name: product.name,
        description: product.description,
        variant_group: "leistung",
        ps_to: product.ps_to,
        nm_to: product.nm_to,
      },
      "de",
    ).detail;
    const key = normalizeSourceText(detail);
    if (key) out.push({ text: key, kind: "detail" });
    return out;
  }
  const name = normalizeSourceText(product.name);
  if (name) out.push({ text: name, kind: "name" });
  const description = normalizeSourceText(product.description ?? "");
  if (description) out.push({ text: description, kind: "description" });
  return out;
}

/** Ein Gruppentitel (products.group_label), eine Excel-Kategorie (source_category) oder ein Hinweistext (pricelist_notes.text). */
export function labelSourceText(text: string | null | undefined, kind: "group" | "category" | "note"): SourceText | null {
  const key = normalizeSourceText(text ?? "");
  return key ? { text: key, kind } : null;
}

/** Dedupliziert nach Text; bei mehreren Arten gewinnt die zuerst gesehene. */
export function uniqueSourceTexts(texts: Iterable<SourceText>): SourceText[] {
  const seen = new Map<string, SourceText>();
  for (const t of texts) if (!seen.has(t.text)) seen.set(t.text, t);
  return [...seen.values()];
}

/** Alle Quelltexte einer Produktliste samt Gruppentiteln/Kategorien und Hinweisen - für die Map eines Kategorie-Schritts bzw. einer Anfrage. */
export function collectSourceTexts(params: {
  products: readonly (TranslatableProduct & { group_label?: string | null; source_category?: string | null })[];
  notes?: readonly string[];
}): SourceText[] {
  const texts: SourceText[] = [];
  for (const p of params.products) {
    texts.push(...productSourceTexts(p));
    const group = labelSourceText(p.group_label, "group");
    if (group) texts.push(group);
    const category = labelSourceText(p.source_category, "category");
    if (category) texts.push(category);
  }
  for (const note of params.notes ?? []) {
    const n = labelSourceText(note, "note");
    if (n) texts.push(n);
  }
  return uniqueSourceTexts(texts);
}
