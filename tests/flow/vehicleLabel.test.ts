// Prüfbefund 3: eine gemeinsame, reine Formel für die Fahrzeugbezeichnung
// (lib/catalog/vehicle-label.ts vehicleDisplayLabel()) statt drei separater,
// auseinanderlaufender Kopien (lib/mail/render.ts vehicleLabel(),
// lib/inquiry/share.ts, components/flow/vehicleLabel.ts). Deckt die fünf
// Beispiele aus der Aufgabenstellung ab; components/flow/vehicleLabel.ts
// (vehicleDisplayName) ist nur noch ein dünner Wrapper ohne vehicleText und
// wird hier mit denselben Modell-Fällen mitgeprüft.
import { describe, expect, it } from "vitest";
import { vehicleDisplayLabel } from "@/lib/catalog/vehicle-label";
import { vehicleDisplayName } from "@/components/flow/vehicleLabel";
import type { CatalogFamily, CatalogModel } from "@/lib/catalog/queries";

function family(overrides: Partial<CatalogFamily> & { brand: CatalogFamily["brand"]; name: string }): CatalogFamily {
  return {
    id: "family-1",
    slug: "slug",
    codes: [],
    hasPricelist: true,
    photoUrl: null,
    shortText: null,
    sort: 0,
    models: [],
    ...overrides,
  };
}

function model(overrides: Partial<CatalogModel> & { name: string }): CatalogModel {
  return {
    id: "model-1",
    slug: "slug",
    fuel: null,
    seriesPs: null,
    seriesNm: null,
    seriesPsSuggested: [],
    sort: 0,
    hasGearboxSpecificProducts: false,
    ...overrides,
  };
}

describe("vehicleDisplayLabel: <brand> <family.name>, plus <model.name>, kein Code-Anhängen, Marke nicht doppeln", () => {
  it('BMW 3er G20, G21, M40i', () => {
    const f = family({ brand: "BMW", name: "3er G20, G21", codes: ["G20", "G21"] });
    const m = model({ name: "M40i" });
    expect(vehicleDisplayLabel({ family: f, model: m, vehicleText: null })).toBe("BMW 3er G20, G21, M40i");
    expect(vehicleDisplayName(f, m)).toBe("BMW 3er G20, G21, M40i");
  });

  it('BMW M2 G87, M2 (Familienname bleibt trotz Modell erhalten, kein Baureihen-Code)', () => {
    const f = family({ brand: "BMW", name: "M2 G87", codes: ["G87"] });
    const m = model({ name: "M2" });
    expect(vehicleDisplayLabel({ family: f, model: m, vehicleText: null })).toBe("BMW M2 G87, M2");
    expect(vehicleDisplayName(f, m)).toBe("BMW M2 G87, M2");
  });

  it("MINI F60 Countryman, Cooper S (Marke nicht doppeln)", () => {
    const f = family({ brand: "MINI", name: "MINI F60 Countryman", codes: ["F60"] });
    const m = model({ name: "Cooper S" });
    expect(vehicleDisplayLabel({ family: f, model: m, vehicleText: null })).toBe("MINI F60 Countryman, Cooper S");
    expect(vehicleDisplayName(f, m)).toBe("MINI F60 Countryman, Cooper S");
  });

  it("Wiesmann, MF4 (Platzhalter mit vehicleText: kein Modell im Katalog, vehicleText ersetzt das Modell)", () => {
    const f = family({ brand: "Wiesmann", name: "Wiesmann", hasPricelist: false });
    expect(vehicleDisplayLabel({ family: f, model: null, vehicleText: "MF4" })).toBe("Wiesmann, MF4");
  });

  it("BMW Älteres Modell, E46 M3 (Kurzablauf-Platzhalterfamilie mit vehicleText)", () => {
    const f = family({ brand: "BMW", name: "Älteres Modell", hasPricelist: false });
    expect(vehicleDisplayLabel({ family: f, model: null, vehicleText: "E46 M3" })).toBe("BMW Älteres Modell, E46 M3");
  });

  it("Familienname bleibt IMMER stehen (auch ohne vehicleText, auch bei Platzhalternamen)", () => {
    const f = family({ brand: "BMW", name: "Älteres Modell", hasPricelist: false });
    expect(vehicleDisplayLabel({ family: f, model: null, vehicleText: null })).toBe("BMW Älteres Modell");
  });

  it("Modell gewählt: vehicleText bleibt unberücksichtigt (Modell hat Vorrang)", () => {
    const f = family({ brand: "BMW", name: "M2 G87", codes: ["G87"] });
    const m = model({ name: "M2" });
    expect(vehicleDisplayLabel({ family: f, model: m, vehicleText: "Mein Auto" })).toBe("BMW M2 G87, M2");
  });

  it("ohne Familie: vehicleText als einziger Fallback, sonst leerer String", () => {
    expect(vehicleDisplayLabel({ family: null, model: null, vehicleText: "320i Touring" })).toBe("320i Touring");
    expect(vehicleDisplayLabel({ family: null, model: null, vehicleText: null })).toBe("");
    expect(vehicleDisplayLabel({ family: null, model: null, vehicleText: "  " })).toBe("");
  });
});
