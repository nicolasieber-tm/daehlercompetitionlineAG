// Vorher/Nachher-Zeilen wie beforeAfter() in docs/vorschau.html. Reine
// Datenfunktion (keine Hooks, kein "use client"): wird sowohl vom
// Abschluss-Screen des Kundenflows (components/flow/steps/DoneStep.tsx, mit
// vollem Live-State inkl. Serien-PS/Nm und ps_to/nm_to der gewählten
// Leistungsstufe) als auch von der Teilen-Ansicht (app/p/[token]/page.tsx,
// Server Component, nur mit den schlankeren Feldern aus
// lib/inquiry/share.ts SharedInquiryView) verwendet - daher sind die
// "reichen" Felder (seriesPs/seriesNm, psTo/nmTo je Position) optional.
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { normalizeNbsp } from "@/lib/catalog/product-display";
import type { FlowCategory } from "@/lib/supabase/rows";

export interface BeforeAfterItemInput {
  category: FlowCategory;
  name: string;
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
}

export interface BeforeAfterRowData {
  key: string;
  category: string;
  before: string;
  after: string;
}

function itemsOf(input: BeforeAfterInput, category: FlowCategory): BeforeAfterItemInput[] {
  return input.items.filter((i) => i.category === category);
}

// NBSP-normalisiert statt der vollen productDisplay()-Titel-Herleitung: hier
// gibt es keinen Locale-Parameter (app/p/[token]/page.tsx, ausserhalb der
// mir zugewiesenen Dateien, ruft buildBeforeAfterRows() ohne Locale-Bezug
// auf), und für Nicht-Leistungsprodukte liefert productDisplay() ohnehin nur
// den NBSP-normalisierten Namen zurück (siehe lib/catalog/product-display.ts
// plainDisplay()) - normalizeNbsp() allein deckt das hier ab, ohne einen
// Locale-Parameter einzuführen, der einen ausserhalb dieser Aufgabe
// liegenden Aufrufer bräche.
function joinNames(items: BeforeAfterItemInput[], adviceValue: string): string {
  return items.length > 0 ? items.map((i) => normalizeNbsp(i.name)).join(", ") : adviceValue;
}

/** Baut die Vorher/Nachher-Zeilen aus dem gewählten Paket, siehe docs/vorschau.html beforeAfter(). */
export function buildBeforeAfterRows(input: BeforeAfterInput, t: Dictionary): BeforeAfterRowData[] {
  const rows: BeforeAfterRowData[] = [];
  const b = t.steps.done.beforeAfter;
  const advice = b.adviceValue;

  if (input.categories.includes("motor")) {
    const motorItems = itemsOf(input, "motor");
    const stage = motorItems.find((i) => i.variantGroup === "leistung" && i.psTo != null);
    const extras = motorItems.filter((i) => i !== stage);
    const before =
      input.seriesPs != null && input.seriesNm != null
        ? `${input.seriesPs} PS · ${input.seriesNm} Nm`
        : b.seriesValue;
    let after: string;
    if (stage) {
      const extraNames = extras.map((i) => normalizeNbsp(i.name)).join(", ");
      after = `${stage.psTo} PS · ${stage.nmTo ?? "?"} Nm${extraNames ? " · " + extraNames : ""}`;
    } else if (motorItems.length > 0) {
      after = motorItems.map((i) => normalizeNbsp(i.name)).join(", ");
    } else {
      after = advice;
    }
    rows.push({ key: "leistung", category: b.rows.leistung, before, after });
  }

  if (input.categories.includes("auspuff")) {
    rows.push({
      key: "sound",
      category: b.rows.sound,
      before: b.seriesExhaustValue,
      after: joinNames(itemsOf(input, "auspuff"), advice),
    });
  }

  if (input.categories.includes("fahrwerk")) {
    rows.push({
      key: "fahrwerk",
      category: b.rows.fahrwerk,
      before: b.seriesHeightValue,
      after: joinNames(itemsOf(input, "fahrwerk"), advice),
    });
  }

  if (input.categories.includes("raeder")) {
    rows.push({
      key: "raeder",
      category: b.rows.raeder,
      before: b.seriesWheelsValue,
      after: joinNames(itemsOf(input, "raeder"), advice),
    });
  }

  if (input.categories.includes("exterieur")) {
    rows.push({
      key: "exterieur",
      category: b.rows.exterieur,
      before: b.seriesValue,
      after: joinNames(itemsOf(input, "exterieur"), advice),
    });
  }

  if (input.categories.includes("interieur")) {
    rows.push({
      key: "interieur",
      category: b.rows.interieur,
      before: b.seriesValue,
      after: joinNames(itemsOf(input, "interieur"), advice),
    });
  }

  const characterOption = t.steps.character.options.find((o) => o.id === input.character);
  rows.push({
    key: "charakter",
    category: b.rows.charakter,
    before: b.seriesFactoryValue,
    after: characterOption ? characterOption.title : advice,
  });

  return rows;
}
