// Kategorie-Mapping Excel -> Flow. Quelle: docs/excel-import.md, Abschnitt
// "Kategorie-Mapping (Excel -> Flow)".
import type { FlowCategory } from "@/lib/pricelist/types";

/** Reihenfolge der Kategorien im Kundenflow (Schritt 2 "Wunsch" und Fortschritt). */
export const FLOW_CATEGORIES: FlowCategory[] = [
  "motor",
  "auspuff",
  "fahrwerk",
  "raeder",
  "exterieur",
  "interieur",
];

/** Kategorienamen wie sie wörtlich (case-insensitiv, getrimmt) in Spalte B der Excel stehen. */
export const SOURCE_CATEGORIES = [
  "Motor",
  "Kraftübertragung",
  "Auspuff",
  "Active-Sound System",
  "Fahrwerk",
  "Bremse",
  "Räder",
  "Karosserie",
  "Cockpit/Interieur",
] as const;

export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

/** Excel-Kategorie -> Flow-Kategorie. */
export const SOURCE_TO_FLOW: Record<SourceCategory, FlowCategory> = {
  Motor: "motor",
  Kraftübertragung: "motor",
  Auspuff: "auspuff",
  "Active-Sound System": "auspuff",
  Fahrwerk: "fahrwerk",
  Bremse: "fahrwerk",
  Räder: "raeder",
  Karosserie: "exterieur",
  "Cockpit/Interieur": "interieur",
};

const SOURCE_CATEGORIES_LOWER = SOURCE_CATEGORIES.map((c) => c.toLowerCase());

/**
 * Prüft, ob ein Zellentext (Spalte B, ohne weiteren Zeileninhalt) einer der
 * neun Excel-Kategorienamen ist (case-insensitiv, getrimmt). Gibt die
 * kanonische Schreibweise zurück, oder null.
 */
export function isCategoryRow(text: string | null | undefined): SourceCategory | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  const idx = SOURCE_CATEGORIES_LOWER.indexOf(t);
  return idx >= 0 ? SOURCE_CATEGORIES[idx] : null;
}

/** Excel-Kategorie (kanonisch oder roh) -> Flow-Kategorie, oder null wenn unbekannt. */
export function mapSourceCategory(sourceCategory: string): FlowCategory | null {
  const canonical = isCategoryRow(sourceCategory);
  return canonical ? SOURCE_TO_FLOW[canonical] : null;
}
