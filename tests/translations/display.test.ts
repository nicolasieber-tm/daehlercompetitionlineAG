// Übersetzte Produkttexte in Kachel-/Positions-/Vorher-Nachher-Darstellung
// und im Antwortentwurf (Posten 4).
import { describe, expect, it } from "vitest";
import { displayItemFields, productDisplay } from "@/lib/catalog/product-display";
import { buildBeforeAfterRows } from "@/lib/catalog/before-after";
import { buildDraft } from "@/lib/draft/template";
import type { DraftContext } from "@/lib/draft/template";

const map = {
  "Heckflügel Carbon": "Rear wing carbon",
  "M6 & A8-Getriebe": "M6 & A8 gearbox",
  "CDC1 FORGED Radsatz geschmiedet bestehend aus:": "CDC1 FORGED wheel set forged consisting of:",
  '10 x 20" mit 275/30 20\n10 x 20" mit 285/30 20': '10 x 20" with 275/30 20\n10 x 20" with 285/30 20',
};

describe("productDisplay mit Übersetzungen", () => {
  it("übersetzt bei einer Leistungsstufe nur die Restinformation, Titel/Nebenzeile bleiben lokalisiert", () => {
    const d = productDisplay(
      { name: "Stufe 1: (Basis 480 PS) 620PS / 740Nm (M6 & A8-Getriebe)", variant_group: "leistung", ps_to: 620, nm_to: 740 },
      "en",
      map,
    );
    expect(d).toEqual({ title: "Stage 1", subtitle: "620 PS / 740 Nm", detail: "M6 & A8 gearbox" });
  });

  it("übersetzt Name und mehrzeilige Beschreibung eines normalen Produkts", () => {
    const d = productDisplay(
      { name: "CDC1 FORGED Radsatz geschmiedet bestehend aus:", description: '10 x 20" mit 275/30 20\n10 x 20" mit 285/30 20' },
      "en",
      map,
    );
    expect(d).toEqual({
      title: "CDC1 FORGED wheel set forged consisting of:",
      subtitle: '10 x 20" with 275/30 20',
      detail: '10 x 20" with 285/30 20',
    });
  });

  it("ohne Map und ohne Treffer bleibt alles deutsch", () => {
    expect(productDisplay({ name: "Heckflügel Carbon" }, "en").title).toBe("Heckflügel Carbon");
    expect(productDisplay({ name: "Frontgrill Carbon" }, "en", map).title).toBe("Frontgrill Carbon");
  });
});

describe("displayItemFields mit Übersetzungen", () => {
  it("Positionszeile: Stufe mit übersetztem Detail, normales Produkt mit übersetztem Namen", () => {
    expect(
      displayItemFields(
        { name: "Stufe 1: (Basis 480 PS) 620PS / 740Nm (M6 & A8-Getriebe)", description: null, isStage: true, psTo: 620, nmTo: 740 },
        "en",
        map,
      ).name,
    ).toBe("Stage 1 (620 PS / 740 Nm, M6 & A8 gearbox)");
    expect(displayItemFields({ name: "Heckflügel Carbon", description: null, isStage: false, psTo: null, nmTo: null }, "en", map)).toEqual({
      name: "Rear wing carbon",
      description: null,
      originalName: null,
    });
  });
});

describe("buildBeforeAfterRows mit Übersetzungen", () => {
  it("zeigt die übersetzten Namen in der Nachher-Spalte", () => {
    const rows = buildBeforeAfterRows({
      categories: ["exterieur"],
      consulting: false,
      items: [{ category: "exterieur", name: "Heckflügel Carbon" }],
      character: "sportlich",
      locale: "en",
      translations: map,
    });
    expect(rows.find((r) => r.id === "exterieur")?.after).toBe("Rear wing carbon");
  });
});

describe("buildDraft (en) mit Übersetzungen", () => {
  const ctx: DraftContext = {
    number: "2026-0001",
    firstName: "Jane",
    lastName: "Doe",
    vehicleLabel: "BMW M2 (G87)",
    year: "2024",
    character: "sportlich",
    categories: ["motor", "exterieur"],
    consulting: false,
    timing: "flexible",
    hasPricelist: true,
    items: [
      {
        category: "motor",
        name: "Stufe 1: (Basis 480 PS) 620PS / 740Nm (M6 & A8-Getriebe)",
        description: null,
        priceTotal: 4180,
        priceStatus: "priced",
        psTo: 620,
        nmTo: 740,
        variantGroup: "leistung",
      },
      { category: "exterieur", name: "Heckflügel Carbon", description: null, priceTotal: 2810, priceStatus: "priced", psTo: null, nmTo: null, variantGroup: null },
    ],
    estimatedTotal: 6990,
    settings: { signatureName: "Christoph Dähler", companyName: "dÄHLer Competition Line AG", companyAddress: "", signaturePhone: "+41 31 819 88 77" },
    translations: map,
  };

  it("Positionszeilen englisch, Leistungssatz mit «Stage 1»", () => {
    const { body } = buildDraft(ctx, "en");
    expect(body).toContain("• Engine: Stage 1 (620 PS / 740 Nm, M6 & A8 gearbox), from CHF 4'180");
    expect(body).toContain("• Exterior: Rear wing carbon, from CHF 2'810");
    expect(body).toContain("With Stage 1 your BMW M2 (G87) reaches 620 PS / 740 Nm");
    expect(body).not.toContain("Stufe");
  });

  it("deutsch bleibt unverändert, auch mit Map (Map wird nur für die Entwurfssprache übergeben)", () => {
    const { body } = buildDraft({ ...ctx, translations: null }, "de");
    expect(body).toContain("• Motor: Stufe 1 (620 PS / 740 Nm, M6 & A8-Getriebe), ab CHF 4'180");
    expect(body).toContain("• Exterieur: Heckflügel Carbon, ab CHF 2'810");
  });
});
