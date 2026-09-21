// Vorher/Nachher-Zeilen wie beforeAfter() in docs/vorschau.html. Reine
// Datenfunktion (keine Hooks, kein "use client"): wird sowohl vom
// Abschluss-Screen des Kundenflows (components/flow/steps/DoneStep.tsx, mit
// vollem Live-State inkl. Serien-PS/Nm und ps_to/nm_to der gewählten
// Leistungsstufe) als auch von der Teilen-Ansicht (app/p/[token]/page.tsx,
// Server Component, nur mit den schlankeren Feldern aus
// lib/inquiry/share.ts SharedInquiryView) verwendet - daher sind die
// "reichen" Felder (seriesPs/seriesNm, psTo/nmTo je Position) optional.
//
// Kundenwunsch (CLAUDE.md Abschnitt "AUFGABE"): dieselbe Vorher/Nachher-
// Übersicht soll auch in den Kundenmails erscheinen. Die eigentliche
// Zeilen-Herleitung liegt seither in lib/catalog/before-after.ts (dieselbe
// Semantik, DB-nahe/snake_case Feldnamen, direkt aus MailInquiryItem[]
// aufrufbar) - diese Datei bleibt als schlanker Adapter auf das bisherige,
// camelCase FlowCategory-Format bestehen (Signatur/Ausgabe unverändert,
// bestehende Aufrufer/Tests bleiben unberührt), damit
// components/flow/steps/DoneStep.tsx nicht angepasst werden muss.
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { buildBeforeAfterRows as buildSharedBeforeAfterRows } from "@/lib/catalog/before-after";
import type { BeforeAfterItemInput as SharedBeforeAfterItemInput } from "@/lib/catalog/before-after";
import type { PowerBeforeAfter } from "@/lib/catalog/power-before-after";
import type { FlowCategory } from "@/lib/db/rows";
import type { TranslationMap } from "@/lib/translations/resolve";

export interface BeforeAfterItemInput {
  category: FlowCategory;
  name: string;
  description?: string | null;
  psTo?: number | null;
  nmTo?: number | null;
  variantGroup?: string | null;
}

export interface BeforeAfterInput {
  categories: FlowCategory[];
  items: BeforeAfterItemInput[];
  consulting: boolean;
  character: string | null;
  seriesPs?: number | null;
  seriesNm?: number | null;
  /** Übersetzungen der Positionstexte für `locale` (Posten 4), siehe lib/catalog/before-after.ts. */
  translations?: TranslationMap | null;
}

export interface BeforeAfterRowData {
  key: string;
  category: string;
  before: string;
  after: string;
  /**
   * Nur bei key "leistung" UND gewählter Leistungsstufe mit bekannter
   * Serienleistung gefüllt (Rückmeldung zweiter Klicktest, CLAUDE.md
   * Abschnitt "AUFGABE", Punkt 3): strukturierte Vorher/Nachher-Zahlen für
   * die grosse Zahlen-Darstellung (components/ui/BeforeAfter.tsx), wie
   * .stat b / .delta .n in docs/vorschau.html. `before`/`after` oben bleiben
   * daneben unverändert die Text-Fallbacks (ohne gewählte Stufe: Serie/
   * Beratung/Produktnamen, siehe unten).
   */
  power?: PowerBeforeAfter;
  /**
   * Nur bei key "leistung" gefüllt: die Namen weiterer gewählter Motor-
   * Optionen neben der Hauptstufe (z. B. "Sportluftfilter Satz"), mit ", "
   * verbunden - wie in `after` oben und wie docs/vorschau.html beforeAfter()
   * sie anhängt ("… · Sportluftfilter Satz"). Getrennt von `after` geliefert,
   * damit die Anzeige sie auch dann noch zeigen kann, wenn `power` gesetzt
   * ist und `after` (Text-Fallback) durch die grosse Zahlen-Darstellung
   * ersetzt wird - Befund Prüfer: bei gewählter Stufe verschwanden weitere
   * gewählte Motor-Optionen sonst aus der Zeile (Beleg Anfrage 2026-0293).
   */
  extras?: string;
}

/**
 * Mappt auf lib/catalog/before-after.ts buildBeforeAfterRows() (dieselbe
 * Zeilen-Herleitung, siehe dortiger Dateikommentar) und zurück auf das
 * bisherige key/category-Format. `t` bleibt Teil der Signatur für
 * bestehende Aufrufer (DoneStep.tsx) - die eigentliche Übersetzung
 * übernimmt die gemeinsame Funktion selbst über `locale`
 * (lib/i18n/dictionaries.ts getDictionary(), dasselbe Dictionary-Objekt).
 */
export function buildBeforeAfterRows(input: BeforeAfterInput, t: Dictionary, locale: Locale): BeforeAfterRowData[] {
  void t;
  const items: SharedBeforeAfterItemInput[] = input.items.map((item) => ({
    category: item.category,
    name: item.name,
    description: item.description,
    variant_group: item.variantGroup,
    ps_to: item.psTo,
    nm_to: item.nmTo,
  }));
  const rows = buildSharedBeforeAfterRows({
    categories: input.categories,
    consulting: input.consulting,
    items,
    character: input.character,
    seriesPs: input.seriesPs,
    seriesNm: input.seriesNm,
    locale,
    translations: input.translations,
  });
  return rows.map((r) => ({ key: r.id, category: r.label, before: r.before, after: r.after, power: r.power, extras: r.extras }));
}
