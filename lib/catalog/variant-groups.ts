// Varianten-Gruppen je Flow-Kategorie. Quelle: docs/excel-import.md,
// Abschnitt "Varianten-Gruppen (lib/catalog/variant-groups.ts)".
// Regex auf den Produktnamen, je Flow-Kategorie, in der dokumentierten
// Reihenfolge (erster Treffer gewinnt). Kein Treffer -> null (kombinierbar).
import type { FlowCategory } from "@/lib/pricelist/types";

interface VariantRule {
  pattern: RegExp;
  group: string;
  /** Trifft `exclude` zu, gilt die Regel trotz `pattern`-Treffer als nicht
   * getroffen (siehe motor-Regel unten). */
  exclude?: RegExp;
}

const RULES: Partial<Record<FlowCategory, VariantRule[]>> = {
  motor: [
    {
      pattern: /\(Basis|Stufe\s*\d|Leistungssteigerung/i,
      group: "leistung",
      // Prüfbericht Modul Parser, Befund 2: die Regel matcht wörtlich auch
      // Namen, die keine eigene Leistungsstufe sind und deshalb nicht
      // exklusiv zu Stufe 1/Stufe 2 stehen dürfen:
      // - "Einbau Leistungssteigerung" (17 Familien): reine
      //   Montagepauschale (CHF 330) für eine an anderer Stelle bereits
      //   gewählte Stufe, kein eigenes Leistungsprodukt. Ohne Ausnahme
      //   würde die Auswahl dieser Pauschale die gewählte Stufe abwählen
      //   (und umgekehrt), der PS-Zähler zeigt dann fälschlich "Serie".
      // - "Anhebung der serienmässigen V/max. Begr. auf 327km/h i.V. mit
      //   Leistungssteigerung" (M5 F10/M6 F06): ein Zusatz, der
      //   ausdrücklich in Verbindung mit einer Stufe gekauft wird, selbst
      //   aber keine ist.
      // Bewusst NICHT ausgenommen: "Aufhebung der serienmässigen V/max
      // Begrenzung ohne Leistungssteigerung" (M2 F87, M3/M4 G80) - hier
      // ist Exklusivität zu einer Stufe vertretbar (die Aufhebung ersetzt
      // eine mit Stufe 1/2 mitgelieferte V/max-Aufhebung), deshalb bleibt
      // dieser Name über das allgemeine Muster weiterhin erfasst.
      exclude: /^Einbau\b|i\.V\.\s*mit\s+Leistungssteigerung/i,
    },
  ],
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
    if (rule.pattern.test(name) && !(rule.exclude && rule.exclude.test(name))) return rule.group;
  }
  return null;
}
