// Prüfbefund: components/flow/steps/CategoryStep.tsx indexierte
// t.steps.category.upsell mit der ZIEL-Kategorie statt der QUELL-Kategorie
// (siehe docs/vorschau.html UPSELL: upsell.motor = "Passt gut dazu:
// Auspuff", also nach der Kategorie geschlüsselt, in der die Box angezeigt
// wird, nicht nach der vorgeschlagenen). Dieser Test sichert die Zuordnung
// datenseitig ab, unabhängig vom Rendering (keine React-Testing-Umgebung im
// Projekt, siehe vitest.config.ts: environment "node").
import { describe, expect, it } from "vitest";
import { de } from "@/lib/i18n/de";
import { en } from "@/lib/i18n/en";
import { UPSELL_TARGET } from "@/components/flow/upsell";
import type { FlowCategory } from "@/lib/db/rows";
import type { Dictionary } from "@/lib/i18n/de";

const CATEGORIES = Object.keys(UPSELL_TARGET) as FlowCategory[];

function checkDictionary(dict: Dictionary, label: string) {
  for (const category of CATEGORIES) {
    const target = UPSELL_TARGET[category];
    // Die Box wird im SCHRITT der Quell-Kategorie angezeigt (category) und
    // muss dort auf die Ziel-Kategorie (target) verweisen, exakt wie
    // "Dazunehmen" (ADD_UPSELL_CATEGORY) sie einfügt.
    const upsellTitle = dict.steps.category.upsell[category].title;
    const targetLabel = dict.steps.wish.categories[target].title;
    expect(
      upsellTitle.toLowerCase().includes(targetLabel.toLowerCase()),
      `${label}: upsell[${category}].title ("${upsellTitle}") sollte auf die Zielkategorie "${targetLabel}" verweisen`,
    ).toBe(true);
  }
}

describe("steps.category.upsell ist nach der Quellkategorie geschlüsselt", () => {
  it("de: jede Upsell-Box nennt im Titel die vorgeschlagene Zielkategorie", () => {
    checkDictionary(de, "de");
  });

  it("en: jede Upsell-Box nennt im Titel die vorgeschlagene Zielkategorie", () => {
    checkDictionary(en, "en");
  });

  it("UPSELL_TARGET ist symmetrisch (jede Kategorie schlägt genau eine andere vor, gegenseitig)", () => {
    for (const category of CATEGORIES) {
      const target = UPSELL_TARGET[category];
      expect(UPSELL_TARGET[target]).toBe(category);
    }
  });
});
