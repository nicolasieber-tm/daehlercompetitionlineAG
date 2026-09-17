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
import {
  vehicleAmbiguousAlternatives,
  vehicleDisplayLabel,
  vehicleFamilyLine,
  vehicleInternalLine,
  vehicleLineIsAmbiguous,
  vehicleLineOptions,
} from "@/lib/catalog/vehicle-label";
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

  it('BMW X3 M (F97): "X3M" (Linie) und "X3 M" (Motorisierung) sind ohne Leerzeichen identisch - Schreibweise der Motorisierung gewinnt; Codes je Alternative (Feinschliff 15.09.2026): nur F97 (X3M), nicht auch F98 (X4M)', () => {
    expect(vehicleDisplayLabel(f("BMW", "X3M F97, X4M F98", ["F97", "F98"]), m("X3 M"), null)).toBe(
      "BMW X3 M (F97)",
    );
  });

  // Codes je Alternative (Feinschliff-Prüfung 15.09.2026): jedes
  // Alternativ-Segment trägt seine eigenen Codes im Text ("8er G14, G15,
  // G16 / M8 F91, F92, F93") - in die Klammer kommen nur die Codes der
  // gewählten Alternative, nicht die der anderen.
  const ACHTER_M8 = f("BMW", "8er G14, G15, G16 / M8 F91, F92, F93", ["G14", "G15", "G16", "F91", "F92", "F93"]);

  it("BMW 8er 40i (G14, G15, G16): keine Alternative teilt ein Wort mit '40i' - die erste ('8er') gewinnt, nur ihre eigenen Codes", () => {
    expect(vehicleDisplayLabel(ACHTER_M8, m("40i"), null)).toBe("BMW 8er 40i (G14, G15, G16)");
  });

  it("BMW M8 (F91, F92, F93): Alternative 'M8' passt exakt zur Motorisierung 'M8', nur ihre eigenen Codes", () => {
    expect(vehicleDisplayLabel(ACHTER_M8, m("M8"), null)).toBe("BMW M8 (F91, F92, F93)");
  });

  // Codes je Alternative, Sonderfall Komma: das Komma vor "M6" trennt zwei
  // Alternativen, die beiden Kommas danach nur die Codes-Liste von M6 -
  // unterscheidbar einzig daran, ob auf das Komma ein Code- oder ein
  // Name-Wort folgt (siehe lib/catalog/vehicle-label.ts analyzeFamily()).
  const M5_M6 = f("BMW", "M5 F10, M6 F06, F12, F13", ["F10", "F06", "F12", "F13"]);

  it("BMW M5 (F10)", () => {
    expect(vehicleDisplayLabel(M5_M6, m("M5"), null)).toBe("BMW M5 (F10)");
  });

  it("BMW M6 (F06, F12, F13)", () => {
    expect(vehicleDisplayLabel(M5_M6, m("M6"), null)).toBe("BMW M6 (F06, F12, F13)");
  });

  // "5er G30, G31, G38": keine Alternativen (kein "/" oder Name-Wort nach
  // einem Komma), nur eine Codes-Liste - unverändert gegenüber vorher, alle
  // Codes gehören zur einzigen Alternative.
  it("BMW 5er (G30, G31, G38): kein Alternativ-Segment, alle Codes gehören zur einzigen Linie", () => {
    expect(vehicleFamilyLine(f("BMW", "5er G30, G31, G38", ["G30", "G31", "G38"]))).toBe(
      "BMW 5er (G30, G31, G38)",
    );
  });

  it('BMW X5M (F95): "LCI" direkt nach einem Code ("F95/LCI") dokumentiert nur, dass der Code die Facelift-Version mitabdeckt - kein Zusatz in der Klammer, kein Wort der Linie; Codes je Alternative: nur F95 (X5M), nicht auch F96 (X6M)', () => {
    expect(vehicleDisplayLabel(f("BMW", "X5M F95/LCI, X6M F96/LCI", ["F95", "F96"]), m("X5M"), null)).toBe(
      "BMW X5M (F95)",
    );
  });

  it('BMW X5M LCI (F95) vs. BMW X5M (F95): Vorfacelift- und Facelift-Modell derselben Familie bleiben unterscheidbar (Prüf-Befund 15.09.2026 - beide fielen vorher auf "BMW X5M (F95 LCI, F96 LCI)"); Feinschliff 15.09.2026: die Klammer trägt zusätzlich nur noch die eigenen Codes von X5M, nicht mehr auch F96 von X6M', () => {
    const X5M_X6M = f("BMW", "X5M F95/LCI, X6M F96/LCI", ["F95", "F96"]);
    expect(vehicleDisplayLabel(X5M_X6M, m("X5M"), null)).toBe("BMW X5M (F95)");
    expect(vehicleDisplayLabel(X5M_X6M, m("X5M LCI"), null)).toBe("BMW X5M LCI (F95)");
    expect(vehicleDisplayLabel(X5M_X6M, m("X6M"), null)).toBe("BMW X6M (F96)");
    expect(vehicleDisplayLabel(X5M_X6M, m("X6M LCI"), null)).toBe("BMW X6M LCI (F96)");
  });

  it("BMW X1 (U11) / BMW X2 (U10): Codes je Alternative über die einfachste Form (nur Name + eigener Code)", () => {
    const X1_X2 = f("BMW", "X1 U11 / X2 U10", ["U11", "U10"]);
    expect(vehicleDisplayLabel(X1_X2, m("X1"), null)).toBe("BMW X1 (U11)");
    expect(vehicleDisplayLabel(X1_X2, m("X2"), null)).toBe("BMW X2 (U10)");
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

  it("Marke steht mitten im (von Hand gepflegten) Familiennamen statt am Anfang: vehicleFamilyLine() entfernt sie trotzdem (Feinschliff-Prüfung 15.09.2026, vorher blieb \"MINI Älteres MINI-Modell\" stehen)", () => {
    expect(vehicleDisplayLabel(f("MINI", "Älteres MINI-Modell", []), null, null)).toBe("MINI Älteres Modell");
    expect(vehicleDisplayLabel(f("Toyota", "Anderes Toyota-Modell", []), null, null)).toBe("Toyota Anderes Modell");
  });

  it("Platzhalter-Familien nach der Umbenennung (db/seed.sql, Feinschliff-Prüfung 15.09.2026): kein Markenwort mehr im Namen, unverändert korrekt", () => {
    expect(vehicleDisplayLabel(f("BMW", "Älteres Modell", []), null, null)).toBe("BMW Älteres Modell");
    expect(vehicleDisplayLabel(f("MINI", "Älteres Modell", []), null, null)).toBe("MINI Älteres Modell");
    expect(vehicleDisplayLabel(f("Toyota", "Anderes Modell", []), null, null)).toBe("Toyota Anderes Modell");
    expect(vehicleDisplayLabel(f("Wiesmann", "Wiesmann", []), null, null)).toBe("Wiesmann");
  });
});

// --- Keine Doppelklammern (Feinschliff-Prüfung 15.09.2026) ------------------
// Enthält die Motorisierung selbst eine Klammer (Kraftstoffart aus dem
// Excel-Namen, z.B. "Countryman One (Benzin)", "Cooper SE (Electric)"),
// werden ihr Inhalt und die Codes zu EINER Klammer verschmolzen statt zwei
// Klammern hintereinander zu setzen.
describe("vehicleDisplayLabel: keine Doppelklammern, wenn die Motorisierung selbst schon eine Klammer trägt", () => {
  it("MINI Countryman One (Benzin, F60)", () => {
    expect(vehicleDisplayLabel(f("MINI", "MINI F60 Countryman", ["F60"]), m("One (Benzin)"), null)).toBe(
      "MINI Countryman One (Benzin, F60)",
    );
  });

  it("MINI Clubman Cooper SE (Electric, F54)", () => {
    expect(vehicleDisplayLabel(f("MINI", "MINI F54 Clubman", ["F54"]), m("Cooper SE (Electric)"), null)).toBe(
      "MINI Clubman Cooper SE (Electric, F54)",
    );
  });

  it("ohne Codes bleibt die einzelne Klammer der Motorisierung unverändert", () => {
    expect(vehicleDisplayLabel(f("MINI", "Countryman", []), m("One (Benzin)"), null)).toBe(
      "MINI Countryman One (Benzin)",
    );
  });
});

// --- Ambiguität X1/X2, X3/X4, X5/X6 (Feinschliff-Prüfung 15.09.2026) -------
// Die Formel kann die Alternative nicht auflösen, wenn die Motorisierung mit
// KEINER der Alternativen ein Wort teilt - vehicleLineIsAmbiguous() macht
// das für lib/rules/checks.ts (Prüfhinweis "modell_mehrdeutig") feststellbar.
describe("vehicleLineIsAmbiguous", () => {
  it("true: reine Antriebsbezeichnung passt gleich schlecht zu X1 wie zu X2", () => {
    expect(vehicleLineIsAmbiguous(f("BMW", "X1 U11 / X2 U10", ["U11", "U10"]), m("20d"))).toBe(true);
  });

  it("false: die Motorisierung nennt eine der Alternativen explizit", () => {
    expect(vehicleLineIsAmbiguous(f("BMW", "X1 U11 / X2 U10", ["U11", "U10"]), m("X1 xDrive20d"))).toBe(false);
  });

  it("false: X3/X4 (dasselbe Muster wie X1/X2) mit eindeutiger Motorisierung", () => {
    expect(vehicleLineIsAmbiguous(f("BMW", "X3M F97, X4M F98", ["F97", "F98"]), m("X3 M"))).toBe(false);
  });

  it("true: X5/X6 ohne unterscheidendes Wort in der Motorisierung", () => {
    expect(vehicleLineIsAmbiguous(f("BMW", "X5M F95/LCI, X6M F96/LCI", ["F95", "F96"]), m("30d"))).toBe(true);
  });

  it("false: keine Alternativen in der Linie (nichts, was mehrdeutig sein könnte)", () => {
    expect(vehicleLineIsAmbiguous(f("BMW", "M2 G87", ["G87"]), m("M2"))).toBe(false);
  });

  it("true: X3/X4 (Komma statt Slash) ohne unterscheidendes Wort in der Motorisierung", () => {
    expect(vehicleLineIsAmbiguous(f("BMW", "X3 G01, X4 G02", ["G01", "G02"]), m("20i"))).toBe(true);
  });

  it("true: 4er Coupé/Cabrio/Grand Coupé ohne unterscheidendes Wort in der Motorisierung", () => {
    const VIERER = f("BMW", "4er Coupé G22, Cabrio G23, Grand Coupé G26", ["G22", "G23", "G26"]);
    expect(vehicleLineIsAmbiguous(VIERER, m("20i"))).toBe(true);
    expect(vehicleLineIsAmbiguous(VIERER, m("M40d"))).toBe(true);
  });

  // Ausnahme 8er/M8 (Ergänzung 15.09.2026, Feinschliff-Prüfung): eine
  // Alternative, die selbst ein M-Modell bezeichnet ("M8"), zählt nicht mit,
  // wenn die Motorisierung selbst kein M-Modell ist ("40i") - "8er" bleibt
  // dann als einzige, eindeutige Alternative übrig, siehe
  // docs/architektur.md Abschnitt "Fahrzeugbezeichnung".
  describe("Ausnahme 8er/M8", () => {
    const ACHTER_M8 = f("BMW", "8er G14, G15, G16 / M8 F91, F92, F93", ["G14", "G15", "G16", "F91", "F92", "F93"]);

    it("false: '8er' + '40i' - 'M8' scheidet aus, '8er' bleibt als einzige Alternative", () => {
      expect(vehicleLineIsAmbiguous(ACHTER_M8, m("40i"))).toBe(false);
    });

    it("false: '8er' + '50i'/'40d' (dieselbe Ausnahme, andere Nicht-M-Motorisierungen)", () => {
      expect(vehicleLineIsAmbiguous(ACHTER_M8, m("50i"))).toBe(false);
      expect(vehicleLineIsAmbiguous(ACHTER_M8, m("40d"))).toBe(false);
    });

    it("false: 'M8' selbst - sharedWordScore trifft 'M8' ohnehin eindeutig, Ausnahme ändert nichts", () => {
      expect(vehicleLineIsAmbiguous(ACHTER_M8, m("M8"))).toBe(false);
    });

    it("false: M5/M6, Motorisierung 'M5' - Motorisierung ist selbst ein M-Modell, Ausnahme gilt nicht, aber 'M5' trifft eindeutig", () => {
      const M5_M6 = f("BMW", "M5 F10, M6 F06, F12, F13", ["F10", "F06", "F12", "F13"]);
      expect(vehicleLineIsAmbiguous(M5_M6, m("M5"))).toBe(false);
      expect(vehicleLineIsAmbiguous(M5_M6, m("M6"))).toBe(false);
    });
  });
});

describe("vehicleAmbiguousAlternatives", () => {
  it("leer, wenn nicht mehrdeutig", () => {
    expect(vehicleAmbiguousAlternatives(f("BMW", "M2 G87", ["G87"]), m("M2"))).toEqual([]);
    expect(
      vehicleAmbiguousAlternatives(f("BMW", "8er G14, G15, G16 / M8 F91, F92, F93", ["G14", "G15", "G16", "F91", "F92", "F93"]), m("40i")),
    ).toEqual([]);
  });

  it("die Alternativ-Namen der Familie, wenn mehrdeutig", () => {
    expect(vehicleAmbiguousAlternatives(f("BMW", "X1 U11 / X2 U10", ["U11", "U10"]), m("20d"))).toEqual([
      "X1",
      "X2",
    ]);
    expect(
      vehicleAmbiguousAlternatives(
        f("BMW", "4er Coupé G22, Cabrio G23, Grand Coupé G26", ["G22", "G23", "G26"]),
        m("20i"),
      ),
    ).toEqual(["4er Coupé", "Cabrio", "Grand Coupé"]);
  });
});

// --- Mehrdeutige Baureihen: ALLE Alternativen + ALLE Codes (Ergänzung -----
// 15.09.2026, Feinschliff-Prüfung, siehe docs/architektur.md Abschnitt
// "Fahrzeugbezeichnung"). Befund D.5: "BMW X1 20i (U11)" erschien
// fälschlich auch für X2-Fahrer - die Formel zeigt jetzt beide Alternativen
// statt stillschweigend die erste zu wählen.
describe("vehicleDisplayLabel: mehrdeutige Baureihen zeigen alle Alternativen + alle Codes", () => {
  it("BMW X1 / X2 20i (U11, U10)", () => {
    expect(vehicleDisplayLabel(f("BMW", "X1 U11 / X2 U10", ["U11", "U10"]), m("20i"), null)).toBe(
      "BMW X1 / X2 20i (U11, U10)",
    );
  });

  it("BMW X3 / X4 20i (G01, G02)", () => {
    expect(vehicleDisplayLabel(f("BMW", "X3 G01, X4 G02", ["G01", "G02"]), m("20i"), null)).toBe(
      "BMW X3 / X4 20i (G01, G02)",
    );
  });

  it("BMW X5 / X6 40i (G05, G06)", () => {
    expect(vehicleDisplayLabel(f("BMW", "X5 G05, X6 G06", ["G05", "G06"]), m("40i"), null)).toBe(
      "BMW X5 / X6 40i (G05, G06)",
    );
  });

  it('BMW 4er Coupé / Cabrio / Grand Coupé 20i (G22, G23, G26): Schreibweise der Alternativen aus dem Familiennamen übernommen ("Grand Coupé" wie in der Excel, nicht "Gran Coupé")', () => {
    expect(
      vehicleDisplayLabel(
        f("BMW", "4er Coupé G22, Cabrio G23, Grand Coupé G26", ["G22", "G23", "G26"]),
        m("20i"),
        null,
      ),
    ).toBe("BMW 4er Coupé / Cabrio / Grand Coupé 20i (G22, G23, G26)");
  });

  // Ausnahme 8er/M8: bleibt nach dem Ausschluss der M-Modell-Alternative
  // nur eine Alternative übrig, ist die Formel eindeutig - keine
  // "alle Alternativen"-Anzeige, nur die eigenen Codes von "8er".
  it("nicht mehrdeutig bleibt: BMW 8er 40i (G14, G15, G16), kein Prüfhinweis nötig", () => {
    const ACHTER_M8 = f("BMW", "8er G14, G15, G16 / M8 F91, F92, F93", ["G14", "G15", "G16", "F91", "F92", "F93"]);
    expect(vehicleDisplayLabel(ACHTER_M8, m("40i"), null)).toBe("BMW 8er 40i (G14, G15, G16)");
    expect(vehicleLineIsAmbiguous(ACHTER_M8, m("40i"))).toBe(false);
  });

  it("nicht mehrdeutig bleibt: BMW M8 (F91, F92, F93)", () => {
    const ACHTER_M8 = f("BMW", "8er G14, G15, G16 / M8 F91, F92, F93", ["G14", "G15", "G16", "F91", "F92", "F93"]);
    expect(vehicleDisplayLabel(ACHTER_M8, m("M8"), null)).toBe("BMW M8 (F91, F92, F93)");
  });

  it("nicht mehrdeutig bleibt: BMW M2 (G87)", () => {
    expect(vehicleDisplayLabel(f("BMW", "M2 G87", ["G87"]), m("M2"), null)).toBe("BMW M2 (G87)");
  });

  it("nicht mehrdeutig bleibt: BMW X3 M (F97)", () => {
    expect(vehicleDisplayLabel(f("BMW", "X3M F97, X4M F98", ["F97", "F98"]), m("X3 M"), null)).toBe(
      "BMW X3 M (F97)",
    );
  });
});

// --- vehicleLineOptions (Kundenentscheid 17.09.2026: "bei X1 und X2 gibt --
// es dieselben Motorisierungen, das Modell ist X1 oder X2" - Frage im Flow
// statt Excel-Änderung, siehe docs/architektur.md Abschnitt
// "Fahrzeugbezeichnung").
describe("vehicleLineOptions", () => {
  it("X1/X2: id, label, eigene Codes je Alternative", () => {
    expect(vehicleLineOptions(f("BMW", "X1 U11 / X2 U10", ["U11", "U10"]), m("20i"))).toEqual([
      { id: "x1", label: "X1", codes: ["U11"] },
      { id: "x2", label: "X2", codes: ["U10"] },
    ]);
  });

  it("X3/X4", () => {
    expect(vehicleLineOptions(f("BMW", "X3 G01, X4 G02", ["G01", "G02"]), m("20i"))).toEqual([
      { id: "x3", label: "X3", codes: ["G01"] },
      { id: "x4", label: "X4", codes: ["G02"] },
    ]);
  });

  it("X5/X6", () => {
    expect(vehicleLineOptions(f("BMW", "X5 G05, X6 G06", ["G05", "G06"]), m("40i"))).toEqual([
      { id: "x5", label: "X5", codes: ["G05"] },
      { id: "x6", label: "X6", codes: ["G06"] },
    ]);
  });

  it('4er Coupé/Cabrio/Grand Coupé: id ist der Slug des vollen Segmentnamens ("4er Coupé" -> "4er-coupe"), Diakritika entfernt ("Grand Coupé" -> "grand-coupe")', () => {
    expect(
      vehicleLineOptions(
        f("BMW", "4er Coupé G22, Cabrio G23, Grand Coupé G26", ["G22", "G23", "G26"]),
        m("20i"),
      ),
    ).toEqual([
      { id: "4er-coupe", label: "4er Coupé", codes: ["G22"] },
      { id: "cabrio", label: "Cabrio", codes: ["G23"] },
      { id: "grand-coupe", label: "Grand Coupé", codes: ["G26"] },
    ]);
  });

  it("leer für M2 G87 (nicht mehrdeutig)", () => {
    expect(vehicleLineOptions(f("BMW", "M2 G87", ["G87"]), m("M2"))).toEqual([]);
  });

  it("leer für 8er/M8 mit '40i' (Ausnahme 8er/M8: 'M8' scheidet aus, nur 'Achter' bleibt - eindeutig)", () => {
    const ACHTER_M8 = f("BMW", "8er G14, G15, G16 / M8 F91, F92, F93", ["G14", "G15", "G16", "F91", "F92", "F93"]);
    expect(vehicleLineOptions(ACHTER_M8, m("40i"))).toEqual([]);
  });

  it("leer für M8 selbst (eindeutig aufgelöst)", () => {
    const ACHTER_M8 = f("BMW", "8er G14, G15, G16 / M8 F91, F92, F93", ["G14", "G15", "G16", "F91", "F92", "F93"]);
    expect(vehicleLineOptions(ACHTER_M8, m("M8"))).toEqual([]);
  });

  it("leer ohne Modell (Kurzablauf/Platzhalter) - Mehrdeutigkeit lässt sich ohne Motorisierung nicht beurteilen", () => {
    expect(vehicleLineOptions(f("BMW", "X1 U11 / X2 U10", ["U11", "U10"]), null)).toEqual([]);
  });
});

// --- vehicleDisplayLabel mit lineId (Kundenentscheid 17.09.2026) -----------
describe("vehicleDisplayLabel: lineId löst eine mehrdeutige Baureihe auf die gewählte Alternative auf", () => {
  it('BMW X2 20i (U10): lineId "x2" statt "BMW X1 / X2 20i (U11, U10)"', () => {
    const X1_X2 = f("BMW", "X1 U11 / X2 U10", ["U11", "U10"]);
    expect(vehicleDisplayLabel(X1_X2, m("20i"), null, "x2")).toBe("BMW X2 20i (U10)");
    expect(vehicleDisplayLabel(X1_X2, m("20i"), null, "x1")).toBe("BMW X1 20i (U11)");
  });

  it('BMW 4er Cabrio 20i (G23): lineId "cabrio" wählt die mittlere Alternative; der Baureihen-Token "4er" des ersten Segments wird vererbt (Prüfbefund 17.09.2026, sonst "BMW Cabrio 20i" ohne Baureihe, siehe docs/architektur.md Regel 6)', () => {
    const VIERER = f("BMW", "4er Coupé G22, Cabrio G23, Grand Coupé G26", ["G22", "G23", "G26"]);
    expect(vehicleDisplayLabel(VIERER, m("20i"), null, "cabrio")).toBe("BMW 4er Cabrio 20i (G23)");
    expect(vehicleDisplayLabel(VIERER, m("20i"), null, "grand-coupe")).toBe("BMW 4er Grand Coupé 20i (G26)");
    expect(vehicleDisplayLabel(VIERER, m("20i"), null, "4er-coupe")).toBe("BMW 4er Coupé 20i (G22)");
  });

  it("ungültige/unbekannte lineId verhält sich wie ohne lineId (alle Alternativen)", () => {
    const X1_X2 = f("BMW", "X1 U11 / X2 U10", ["U11", "U10"]);
    expect(vehicleDisplayLabel(X1_X2, m("20i"), null, "x3")).toBe("BMW X1 / X2 20i (U11, U10)");
    expect(vehicleDisplayLabel(X1_X2, m("20i"), null, null)).toBe("BMW X1 / X2 20i (U11, U10)");
  });

  it("lineId ohne mehrdeutige Baureihe bleibt wirkungslos (M2 G87)", () => {
    expect(vehicleDisplayLabel(f("BMW", "M2 G87", ["G87"]), m("M2"), null, "x2")).toBe("BMW M2 (G87)");
  });
});

describe("vehicleInternalLine: lineId ergänzt '· Modell: X2'", () => {
  it("mit gültiger lineId", () => {
    const X1_X2 = f("BMW", "X1 U11 / X2 U10", ["U11", "U10"]);
    expect(vehicleInternalLine(X1_X2, m("20i"), "x2")).toBe(
      "Baureihe: X1 U11 / X2 U10 · Motorisierung: 20i · Modell: X2",
    );
  });

  it("ohne lineId bleibt es bei der bisherigen Zeile", () => {
    const X1_X2 = f("BMW", "X1 U11 / X2 U10", ["U11", "U10"]);
    expect(vehicleInternalLine(X1_X2, m("20i"))).toBe("Baureihe: X1 U11 / X2 U10 · Motorisierung: 20i");
  });

  it("ungültige lineId bleibt ohne Zusatz", () => {
    const X1_X2 = f("BMW", "X1 U11 / X2 U10", ["U11", "U10"]);
    expect(vehicleInternalLine(X1_X2, m("20i"), "x3")).toBe("Baureihe: X1 U11 / X2 U10 · Motorisierung: 20i");
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
