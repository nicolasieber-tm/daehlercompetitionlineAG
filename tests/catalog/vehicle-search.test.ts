import { describe, expect, it } from "vitest";
import type { CatalogFamily, CatalogModel } from "@/lib/catalog/queries";
import { searchVehicles } from "@/lib/catalog/vehicle-search";

function family(brand: CatalogFamily["brand"], name: string, codes: string[], models: string[]): CatalogFamily {
  return {
    id: name,
    brand,
    name,
    slug: name,
    codes,
    hasPricelist: true,
    photoUrl: null,
    shortText: null,
    sort: 0,
    models: models.map((m) => ({ id: `${name}/${m}`, name: m }) as CatalogModel),
  };
}

// Auszug aus dem Katalog (Stand Import 11/2026).
const FAMILIES = [
  family("BMW", "1er F40", ["F40"], ["18i", "M35i", "20d"]),
  family("BMW", "3er G20, G21", ["G20", "G21"], ["20i", "M40i", "20d"]),
  family("BMW", "1er F20, F21", ["F20", "F21"], ["116i", "M140i"]),
  family("BMW", "M5 G90, M5 G99 Touring", ["G90", "G99"], ["M5", "M5 Touring"]),
  family("BMW", "M5 F10, M6 F06, F12, F13", ["F10", "F06", "F12", "F13"], ["M5", "M6"]),
  family("BMW", "1er M E82", ["E82"], ["1er M"]),
  family("BMW", "2er F22, F23", ["F22", "F23"], ["218i", "M240i"]),
  family("BMW", "1er F70", ["F70"], ["120", "M135"]),
  family("BMW", "Älteres Modell", [], []),
];

const labels = (q: string) => searchVehicles(FAMILIES, q).map((h) => (h.model ? `${h.model.name} · ${h.family.name}` : h.family.name));

describe("searchVehicles", () => {
  it("zeigt bei «1er» alle 1er-Baureihen", () => {
    expect(labels("1er")).toEqual(["1er F40", "1er F20, F21", "1er M E82", "1er F70"]);
  });

  it("findet Codes schon ab dem Wortanfang", () => {
    expect(labels("f2")).toEqual(["1er F20, F21", "2er F22, F23"]);
  });

  it("schlägt bei «M5 Touring» direkt die Version vor", () => {
    expect(labels("m5 touring")).toEqual(["M5 Touring · M5 G90, M5 G99 Touring"]);
  });

  it("kombiniert Baureihe und Version", () => {
    expect(labels("3er 20d")).toEqual(["20d · 3er G20, G21"]);
  });

  it("ignoriert Umlaute und Gross-/Kleinschreibung", () => {
    expect(labels("ALTERES")).toEqual(["Älteres Modell"]);
  });

  it("liefert bei leerer Eingabe nichts", () => {
    expect(labels("  ")).toEqual([]);
  });
});
