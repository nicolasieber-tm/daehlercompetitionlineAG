// Welche Excel-Texte übersetzt werden (Posten 4), lib/translations/texts.ts.
import { describe, expect, it } from "vitest";
import { collectSourceTexts, productSourceTexts } from "@/lib/translations/texts";

describe("productSourceTexts", () => {
  it("Leistungsstufe: nur die Restinformation (detail), nicht der ganze Name", () => {
    const texts = productSourceTexts({
      name: "Stufe 1: (Basis 480 PS) 620PS / 740Nm (M6 & A8-Getriebe)",
      variant_group: "leistung",
      ps_to: 620,
      nm_to: 740,
    });
    expect(texts).toEqual([{ text: "M6 & A8-Getriebe", kind: "detail" }]);
  });

  it("Leistungsstufe ohne Restinformation liefert nichts", () => {
    expect(
      productSourceTexts({ name: "Stufe 1: (Basis 510 PS) 630PS / 780Nm", variant_group: "leistung", ps_to: 630, nm_to: 780 }),
    ).toEqual([]);
  });

  it("eigenständiges V/max-Produkt (ohne Leistungssteigerung) zählt als normaler Name", () => {
    const name = "Aufhebung der serienmässigen V/max Begrenzung ohne Leistungssteigerung";
    expect(productSourceTexts({ name, variant_group: "leistung", ps_to: null, nm_to: null })).toEqual([{ text: name, kind: "name" }]);
  });

  it("normales Produkt: Name und Beschreibung als Ganzes", () => {
    const texts = productSourceTexts({
      name: "CDC1 FORGED Radsatz geschmiedet bestehend aus:",
      description: '10 x 20" mit 275/30 20\n10 x 20" mit 285/30 20',
    });
    expect(texts).toEqual([
      { text: "CDC1 FORGED Radsatz geschmiedet bestehend aus:", kind: "name" },
      { text: '10 x 20" mit 275/30 20\n10 x 20" mit 285/30 20', kind: "description" },
    ]);
  });
});

describe("collectSourceTexts", () => {
  it("dedupliziert über Produkte, nimmt Gruppentitel, Excel-Kategorie und Hinweise mit", () => {
    const texts = collectSourceTexts({
      products: [
        { name: "Heckflügel Carbon", group_label: null, source_category: "Karosserie" },
        { name: "Heckflügel Carbon", group_label: null, source_category: "Karosserie" },
        { name: "Distanzscheibe 3mm schwarz eloxiert (2 Stk.)", group_label: "Distanzscheiben (schwarz) Satz", source_category: "Räder" },
      ],
      notes: ["Ein DTC- / CH- Gutachten ist vorhanden.", "  "],
    });
    expect(texts.map((t) => [t.kind, t.text])).toEqual([
      ["name", "Heckflügel Carbon"],
      ["category", "Karosserie"],
      ["name", "Distanzscheibe 3mm schwarz eloxiert (2 Stk.)"],
      ["group", "Distanzscheiben (schwarz) Satz"],
      ["category", "Räder"],
      ["note", "Ein DTC- / CH- Gutachten ist vorhanden."],
    ]);
  });
});
