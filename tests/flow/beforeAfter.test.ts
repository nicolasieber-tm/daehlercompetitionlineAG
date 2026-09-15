// Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 1):
// Vorher/Nachher normalisiert U+00A0 in Produktnamen, PS/Nm-Format bleibt
// wie bisher (task-Vorgabe: "Vorher/Nachher (bereits PS/Nm)").
import { describe, expect, it } from "vitest";
import { buildBeforeAfterRows } from "@/components/flow/beforeAfter";
import type { BeforeAfterInput } from "@/components/flow/beforeAfter";
import { de } from "@/lib/i18n/de";

function baseInput(overrides: Partial<BeforeAfterInput> = {}): BeforeAfterInput {
  return {
    categories: [],
    items: [],
    consulting: false,
    character: null,
    ...overrides,
  };
}

describe("buildBeforeAfterRows", () => {
  it("Motor mit Leistungsstufe: PS/Nm mit · getrennt, Extras angehaengt", () => {
    const rows = buildBeforeAfterRows(
      baseInput({
        categories: ["motor"],
        items: [
          { category: "motor", name: "Stufe 1: (Basis 460 PS) 590PS / 720Nm", psTo: 590, nmTo: 720, variantGroup: "leistung" },
          { category: "motor", name: "Sportluftfilter Satz", psTo: null, nmTo: null, variantGroup: "ansaugung" },
        ],
        seriesPs: 460,
        seriesNm: 550,
      }),
      de,
    );
    const leistung = rows.find((r) => r.key === "leistung")!;
    expect(leistung.before).toBe("460 PS · 550 Nm");
    expect(leistung.after).toBe("590 PS · 720 Nm · Sportluftfilter Satz");
  });

  it("Auspuff/Fahrwerk/Raeder/Exterieur/Interieur: Namen mit U+00A0 werden normalisiert", () => {
    // "Frontgrill Carbon" mit einem geschuetzten Leerzeichen (U+00A0)
    // zwischen den Woertern, wie es 54 Produkte im Bestand hatten (siehe
    // CLAUDE.md Abschnitt "AUFGABE", Punkt 1).
    const nameWithNbsp = `Frontgrill Carbon`;
    const rows = buildBeforeAfterRows(
      baseInput({
        categories: ["exterieur"],
        items: [{ category: "exterieur", name: nameWithNbsp }],
      }),
      de,
    );
    const exterieur = rows.find((r) => r.key === "exterieur")!;
    expect(exterieur.after).toBe("Frontgrill Carbon");
    expect(exterieur.after).not.toMatch(/\u00A0/);
  });

  it("Kategorie ohne Auswahl zeigt den Beratungswert", () => {
    const rows = buildBeforeAfterRows(baseInput({ categories: ["fahrwerk"], items: [] }), de);
    const fahrwerk = rows.find((r) => r.key === "fahrwerk")!;
    expect(fahrwerk.after).toBe(de.steps.done.beforeAfter.adviceValue);
  });

  it("Charakter-Zeile ist immer enthalten", () => {
    const rows = buildBeforeAfterRows(baseInput({ character: "sportlich" }), de);
    const charakter = rows.find((r) => r.key === "charakter")!;
    expect(charakter.after).toBe("Sportlich");
  });
});
