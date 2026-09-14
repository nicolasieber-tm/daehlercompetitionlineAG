// Varianten-Gruppen je Flow-Kategorie. Quelle: docs/excel-import.md,
// Abschnitt "Varianten-Gruppen (lib/catalog/variant-groups.ts)".
// Regex auf den Produktnamen, je Flow-Kategorie, in der dokumentierten
// Reihenfolge (erster Treffer gewinnt). Kein Treffer -> null (kombinierbar).
import type { FlowCategory } from "@/lib/pricelist/types";

interface VariantRule {
  pattern: RegExp;
  group: string;
}

const RULES: Partial<Record<FlowCategory, VariantRule[]>> = {
  motor: [{ pattern: /\(Basis|Stufe\s*\d|Leistungssteigerung/i, group: "leistung" }],
  auspuff: [
    // Reihenfolge wichtig: "anlage" zuerst, sonst matcht z. B. "Edelstahl
    // Komplettanlage HP ... ohne Endrohre" fälschlich auf "endrohre" (der
    // Name enthält das Wort "Endrohre", ist aber eine Anlage ohne Endrohre).
    { pattern: /Komplettanlage|Endschalld|Nachschalld|Auspuffanlage/i, group: "anlage" },
    { pattern: /Endrohre/i, group: "endrohre" },
  ],
  fahrwerk: [
    {
      pattern: /Sportfeder|Sportfahrwerk|Gewindefahrwerk|Performance Fahrwerk|Race Fahrwerk/i,
      group: "fahrwerk",
    },
  ],
  raeder: [{ pattern: /Radsatz/i, group: "radsatz" }],
};

/** Ermittelt die variant_group für ein Produkt (Optionen derselben Gruppe schliessen sich im Flow aus). */
export function variantGroupFor(category: FlowCategory, name: string): string | null {
  const rules = RULES[category];
  if (!rules) return null;
  for (const rule of rules) {
    if (rule.pattern.test(name)) return rule.group;
  }
  return null;
}
