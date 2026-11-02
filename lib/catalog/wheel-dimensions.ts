// Räder-Dimensionen im Antwortentwurf (Rückmeldung dÄHLer 28.10.2026,
// Beispielmail «Vorderachse: 9.5 × 21 Zoll mit Bereifung 275/25 R21»).
// products.description der Räder kommt aus der Excel, Zeilen wie
// `9 x 20" mit 255/30 20 VA`. Reine Funktion ohne Abhängigkeiten.
//
// Umgeschrieben wird eine Zeile NUR, wenn sie strikt dem Muster entspricht.
// Jede andere Zeile (Freiformen wie «11 x 23 mit VA 285/ 35 23, HA 325/30 23
// in Wunschfarbe lackiert») bleibt wörtlich wie in der Excel: nichts
// ergänzen, nichts erfinden (CLAUDE.md, Excel ist einzige Datenquelle).
import type { Locale } from "@/lib/i18n/dictionaries";

const WHEEL_LINE =
  /^\s*(\d+(?:\.\d+)?)\s*x\s*(\d+)"?\s+mit\s+(\d{3})\/\s?(\d{2})\s+(\d{2})(?:\s+(VA|HA))?\s*$/;

const AXLE: Record<Locale, { VA: string; HA: string }> = {
  de: { VA: "Vorderachse", HA: "Hinterachse" },
  en: { VA: "Front axle", HA: "Rear axle" },
};

/** Eine Excel-Zeile im Empfehlungsformat, oder null, wenn sie nicht strikt dem Muster entspricht. */
export function formatWheelDimensionLine(line: string, locale: Locale): string | null {
  const m = WHEEL_LINE.exec(line);
  if (!m) return null;
  const [, width, rim, tyreWidth, aspect, tyreRim, axle] = m;
  const tyre = `${tyreWidth}/${aspect} R${tyreRim}`;
  const text =
    locale === "en"
      ? `${width} × ${rim} inch with ${tyre} tyres`
      : `${width} × ${rim} Zoll mit Bereifung ${tyre}`;
  if (!axle) return text;
  const label = (AXLE[locale] ?? AXLE.de)[axle as "VA" | "HA"];
  return `${label}: ${text}`;
}

/** Alle Zeilen einer Räder-Beschreibung: passende umformatiert, alle anderen unverändert. */
export function formatWheelDescriptionLines(lines: readonly string[], locale: Locale): string[] {
  return lines.map((line) => formatWheelDimensionLine(line, locale) ?? line);
}
