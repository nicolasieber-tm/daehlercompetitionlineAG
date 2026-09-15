// Vorher/Nachher-Zeilen wie beforeAfter() in docs/vorschau.html. Reine
// Datenfunktion (keine Hooks, kein "use client"): wird sowohl vom
// Abschluss-Screen des Kundenflows (components/flow/steps/DoneStep.tsx, mit
// vollem Live-State inkl. Serien-PS/Nm und ps_to/nm_to der gewählten
// Leistungsstufe) als auch von der Teilen-Ansicht (app/p/[token]/page.tsx,
// Server Component, nur mit den schlankeren Feldern aus
// lib/inquiry/share.ts SharedInquiryView) verwendet - daher sind die
// "reichen" Felder (seriesPs/seriesNm, psTo/nmTo je Position) optional.
import type { Dictionary, Locale } from "@/lib/i18n/dictionaries";
import { isStageItem, normalizeNbsp, productDisplay } from "@/lib/catalog/product-display";
import type { FlowCategory } from "@/lib/supabase/rows";

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

// Nachzug Prüfung Phase D, Punkt 1: derselbe kurze, unterscheidbare Titel
// wie in der Kachel (CategoryStep.tsx displayTitle()) und in den Mails
// (displayItemFields()), statt des rohen Excel-Namens - vorher blieb hier
// z.B. "Stufe 1: (Basis 460 PS) 590PS / 720Nm (M6 & A8-Getriebe)" stehen.
// Nur der TITEL (nicht die volle "Name (Subtitle, Detail)"-Form aus
// displayItemFields()): die Vorher/Nachher-Zeile ist knapp gehalten (mehrere
// Namen mit ", " verbunden), die PS/Nm-Werte der Hauptstufe stehen für die
// Motor-Zeile ohnehin schon separat als Zahlen (siehe unten).
function displayName(item: BeforeAfterItemInput, locale: Locale): string {
  if (!isStageItem({ name: item.name, variant_group: item.variantGroup, ps_to: item.psTo })) {
    return normalizeNbsp(item.name);
  }
  return productDisplay(
    { name: item.name, description: item.description, variant_group: item.variantGroup, ps_to: item.psTo, nm_to: item.nmTo },
    locale,
  ).title;
}

function joinNames(items: BeforeAfterItemInput[], adviceValue: string, locale: Locale): string {
  return items.length > 0 ? items.map((i) => displayName(i, locale)).join(", ") : adviceValue;
}

/** Baut die Vorher/Nachher-Zeilen aus dem gewählten Paket, siehe docs/vorschau.html beforeAfter(). */
export function buildBeforeAfterRows(input: BeforeAfterInput, t: Dictionary, locale: Locale): BeforeAfterRowData[] {
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
      const extraNames = extras.map((i) => displayName(i, locale)).join(", ");
      after = `${stage.psTo} PS · ${stage.nmTo ?? "?"} Nm${extraNames ? " · " + extraNames : ""}`;
    } else if (motorItems.length > 0) {
      after = motorItems.map((i) => displayName(i, locale)).join(", ");
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
      after: joinNames(itemsOf(input, "auspuff"), advice, locale),
    });
  }

  if (input.categories.includes("fahrwerk")) {
    rows.push({
      key: "fahrwerk",
      category: b.rows.fahrwerk,
      before: b.seriesHeightValue,
      after: joinNames(itemsOf(input, "fahrwerk"), advice, locale),
    });
  }

  if (input.categories.includes("raeder")) {
    rows.push({
      key: "raeder",
      category: b.rows.raeder,
      before: b.seriesWheelsValue,
      after: joinNames(itemsOf(input, "raeder"), advice, locale),
    });
  }

  if (input.categories.includes("exterieur")) {
    rows.push({
      key: "exterieur",
      category: b.rows.exterieur,
      before: b.seriesValue,
      after: joinNames(itemsOf(input, "exterieur"), advice, locale),
    });
  }

  if (input.categories.includes("interieur")) {
    rows.push({
      key: "interieur",
      category: b.rows.interieur,
      before: b.seriesValue,
      after: joinNames(itemsOf(input, "interieur"), advice, locale),
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
