// Fahrzeugbezeichnung: docs/architektur.md, Abschnitt "Fahrzeugbezeichnung"
// (Stand 15.09.2026). Kundenrückmeldung: "BMW M2 G87, M2 liest sich
// doppelt" - die Formel entfernt die Codes aus der Familienzeile, verschmilzt
// Linie und Modellname zu einem Satz statt sie komma-getrennt aneinander-
// zuhängen, und setzt die Codes in Klammern ans Ende ("BMW M2 (G87)" statt
// "BMW M2 G87, M2"). Deckt alle Pflicht-Beispiele der Aufgabenstellung ab;
// components/flow/vehicleLabel.ts (vehicleDisplayName) ist nur noch ein
// dünner Wrapper ohne vehicleText und wird hier mit denselben Fällen
// mitgeprüft, wo ein Modell/keine vehicleText im Spiel ist (der Kundenflow
// kennt kein vehicleText).
import { describe, expect, it } from "vitest";
import { vehicleDisplayLabel, vehicleFamilyLine, vehicleInternalLine } from "@/lib/catalog/vehicle-label";
import type { VehicleLabelFamily, VehicleLabelModel } from "@/lib/catalog/vehicle-label";
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

function f(brand: string, name: string, codes: string[] = []): VehicleLabelFamily {
  return { brand, name, codes };
}
function m(name: string): VehicleLabelModel {
  return { name };
}

// --- Pflicht-Beispiele (Aufgabenstellung) -----------------------------------

describe("vehicleDisplayLabel: Pflicht-Beispiele aus der Aufgabenstellung", () => {
  it('BMW M2 (G87): Familie "M2 G87", Modell "M2" - kein "M2 G87, M2" mehr', () => {
    expect(vehicleDisplayLabel(f("BMW", "M2 G87", ["G87"]), m("M2"), null)).toBe("BMW M2 (G87)");
  });

  it("BMW M2 CS (G87): dieselbe Familie, anderes Modell", () => {
    expect(vehicleDisplayLabel(f("BMW", "M2 G87", ["G87"]), m("M2 CS"), null)).toBe("BMW M2 CS (G87)");
  });

  it("BMW 3er M40i (G20, G21)", () => {
    expect(vehicleDisplayLabel(f("BMW", "3er G20, G21", ["G20", "G21"]), m("M40i"), null)).toBe(
      "BMW 3er M40i (G20, G21)",
    );
  });

  it("BMW M3 Touring (G80, G81, G82, G83): Alternative 'M3' teilt mehr Wörter mit der Motorisierung als 'M4'", () => {
    expect(
      vehicleDisplayLabel(f("BMW", "M3 / M4", ["G80", "G81", "G82", "G83"]), m("M3 Touring"), null),
    ).toBe("BMW M3 Touring (G80, G81, G82, G83)");
  });

  // Familie ohne codes[] (Fallback: Code-Tokens per Muster erkennen, hier
  // je Alternative eingebettet: "M2 F87 / M2 Competition F87 / M2 CS F87").
  const M2_F87 = f("BMW", "M2 F87 / M2 Competition F87 / M2 CS F87", []);

  it("BMW M2 Comp. (F87): alle drei Alternativen teilen nur 'M2' - Gleichstand, also die erste", () => {
    expect(vehicleDisplayLabel(M2_F87, m("M2 Comp."), null)).toBe("BMW M2 Comp. (F87)");
  });

  it("BMW M2 CS (F87): Alternative 'M2 CS' teilt beide Wörter mit der Motorisierung", () => {
    expect(vehicleDisplayLabel(M2_F87, m("M2 CS"), null)).toBe("BMW M2 CS (F87)");
  });

  it("MINI Countryman Cooper S (F60): Marke nicht doppeln (family.name beginnt schon mit MINI)", () => {
    expect(vehicleDisplayLabel(f("MINI", "MINI F60 Countryman", ["F60"]), m("Cooper S"), null)).toBe(
      "MINI Countryman Cooper S (F60)",
    );
  });

  it("MINI Cooper S JCW (F55, F56, F57): vehicleFamilyLine() allein (keine Motorisierung im Spiel)", () => {
    expect(vehicleFamilyLine(f("MINI", "MINI Cooper S JCW", ["F55", "F56", "F57"]))).toBe(
      "MINI Cooper S JCW (F55, F56, F57)",
    );
  });

  it("Toyota GR Supra 3.0i: Markenschreibweise aus brand (TOYOTA -> Toyota), keine Codes -> keine Klammer", () => {
    expect(vehicleDisplayLabel(f("Toyota", "TOYOTA GR Supra", []), m("3.0i"), null)).toBe("Toyota GR Supra 3.0i");
  });

  it("BMW 1er M (E82): Linie und Motorisierung identisch, nichts wird verdoppelt", () => {
    expect(vehicleDisplayLabel(f("BMW", "1er M", ["E82"]), m("1er M"), null)).toBe("BMW 1er M (E82)");
  });

  it("BMW XM Label (G09)", () => {
    expect(vehicleDisplayLabel(f("BMW", "XM", ["G09"]), m("Label"), null)).toBe("BMW XM Label (G09)");
  });

  it('BMW X3 M (F97, F98): "X3M" (Linie) und "X3 M" (Motorisierung) sind ohne Leerzeichen identisch - Schreibweise der Motorisierung gewinnt', () => {
    expect(vehicleDisplayLabel(f("BMW", "X3M F97, X4M F98", ["F97", "F98"]), m("X3 M"), null)).toBe(
      "BMW X3 M (F97, F98)",
    );
  });

  const ACHTER_M8 = f("BMW", "8er / M8", ["G14", "G15", "G16", "F91", "F92", "F93"]);

  it("BMW 8er 40i (...): keine Alternative teilt ein Wort mit '40i' - die erste ('8er') gewinnt", () => {
    expect(vehicleDisplayLabel(ACHTER_M8, m("40i"), null)).toBe(
      "BMW 8er 40i (G14, G15, G16, F91, F92, F93)",
    );
  });

  it("BMW M8 (...): Alternative 'M8' passt exakt zur Motorisierung 'M8'", () => {
    expect(vehicleDisplayLabel(ACHTER_M8, m("M8"), null)).toBe("BMW M8 (G14, G15, G16, F91, F92, F93)");
  });

  it('BMW X5M (F95, F96): "LCI" direkt nach einem Code ("F95/LCI") dokumentiert nur, dass der Code die Facelift-Version mitabdeckt - kein Zusatz in der Klammer, kein Wort der Linie', () => {
    expect(vehicleDisplayLabel(f("BMW", "X5M F95/LCI, X6M F96/LCI", ["F95", "F96"]), m("X5M"), null)).toBe(
      "BMW X5M (F95, F96)",
    );
  });

  it('BMW X5M LCI (F95, F96) vs. BMW X5M (F95, F96): Vorfacelift- und Facelift-Modell derselben Familie bleiben unterscheidbar (Prüf-Befund 15.09.2026 - beide fielen vorher auf "BMW X5M (F95 LCI, F96 LCI)")', () => {
    const X5M_X6M = f("BMW", "X5M F95/LCI, X6M F96/LCI", ["F95", "F96"]);
    expect(vehicleDisplayLabel(X5M_X6M, m("X5M"), null)).toBe("BMW X5M (F95, F96)");
    expect(vehicleDisplayLabel(X5M_X6M, m("X5M LCI"), null)).toBe("BMW X5M LCI (F95, F96)");
    expect(vehicleDisplayLabel(X5M_X6M, m("X6M"), null)).toBe("BMW X6M (F95, F96)");
    expect(vehicleDisplayLabel(X5M_X6M, m("X6M LCI"), null)).toBe("BMW X6M LCI (F95, F96)");
  });

  it("BMW iX3 40 xDrive (NA5): Code-Muster NA + eine Ziffer", () => {
    expect(vehicleDisplayLabel(f("BMW", "iX3", ["NA5"]), m("40 xDrive"), null)).toBe("BMW iX3 40 xDrive (NA5)");
  });

  it("BMW 5er i5 M60 (G60, G61)", () => {
    expect(vehicleDisplayLabel(f("BMW", "5er", ["G60", "G61"]), m("i5 M60"), null)).toBe(
      "BMW 5er i5 M60 (G60, G61)",
    );
  });

  it("Wiesmann MF4: ohne Modell, mit vehicleText - Marke + vehicleText, die Linie bleibt weg", () => {
    expect(vehicleDisplayLabel(f("Wiesmann", "Wiesmann"), null, "MF4")).toBe("Wiesmann MF4");
  });

  it("BMW E46 M3: Platzhalterfamilie (Älteres Modell) mit vehicleText - der Platzhaltername bleibt weg", () => {
    expect(vehicleDisplayLabel(f("BMW", "Älteres Modell", []), null, "E46 M3")).toBe("BMW E46 M3");
  });

  it("BMW Älteres Modell: ohne Modell UND ohne vehicleText - die Familienzeile bleibt der einzige Anhaltspunkt", () => {
    expect(vehicleDisplayLabel(f("BMW", "Älteres Modell", []), null, null)).toBe("BMW Älteres Modell");
  });
});

describe("vehicleInternalLine: Baureihe/Motorisierung roh, für den Preislisten-Abgleich", () => {
  it("mit Modell", () => {
    expect(vehicleInternalLine({ name: "M2 G87" }, { name: "M2" })).toBe("Baureihe: M2 G87 · Motorisierung: M2");
  });

  it("ohne Modell (Kurzablauf): nur die Baureihe", () => {
    expect(vehicleInternalLine({ name: "Älteres Modell" }, null)).toBe("Baureihe: Älteres Modell");
  });
});

// --- Weitere Fälle (Marke nicht doppeln, Alternativen, Rand-/Fehlerfälle) ---

describe("vehicleDisplayLabel: weitere Fälle", () => {
  it("Modell gewählt: vehicleText bleibt unberücksichtigt (Modell hat Vorrang)", () => {
    expect(vehicleDisplayLabel(f("BMW", "M2 G87", ["G87"]), m("M2"), "Mein Auto")).toBe("BMW M2 (G87)");
  });

  it("ohne Familie: vehicleText als einziger Fallback, sonst leerer String", () => {
    expect(vehicleDisplayLabel(null, null, "320i Touring")).toBe("320i Touring");
    expect(vehicleDisplayLabel(null, null, null)).toBe("");
    expect(vehicleDisplayLabel(null, null, "  ")).toBe("");
  });

  it("Familie ohne Codes: keine Klammer", () => {
    expect(vehicleDisplayLabel(f("BMW", "Z4", []), m("sDrive20i"), null)).toBe("BMW Z4 sDrive20i");
  });

  it("Marke steht nicht am Anfang der Linie: MINI/Toyota-Platzhalter werden NICHT dedupliziert (nur echter Präfix zählt)", () => {
    expect(vehicleDisplayLabel(f("MINI", "Älteres MINI-Modell", []), null, null)).toBe("MINI Älteres MINI-Modell");
    expect(vehicleDisplayLabel(f("Toyota", "Anderes Toyota-Modell", []), null, null)).toBe(
      "Toyota Anderes Toyota-Modell",
    );
  });
});

// --- components/flow/vehicleLabel.ts: dünner Wrapper, kein vehicleText -----

describe("vehicleDisplayName (Kundenflow-Wrapper): dieselbe Formel gegen CatalogFamily/CatalogModel", () => {
  it("BMW M2 (G87)", () => {
    const fam = family({ brand: "BMW", name: "M2 G87", codes: ["G87"] });
    const mod = model({ name: "M2" });
    expect(vehicleDisplayName(fam, mod)).toBe("BMW M2 (G87)");
  });

  it("MINI Countryman Cooper S (F60)", () => {
    const fam = family({ brand: "MINI", name: "MINI F60 Countryman", codes: ["F60"] });
    const mod = model({ name: "Cooper S" });
    expect(vehicleDisplayName(fam, mod)).toBe("MINI Countryman Cooper S (F60)");
  });

  it("ohne Modell: die Familienzeile allein", () => {
    const fam = family({ brand: "Wiesmann", name: "Wiesmann", hasPricelist: false });
    expect(vehicleDisplayName(fam, null)).toBe("Wiesmann");
  });
});
