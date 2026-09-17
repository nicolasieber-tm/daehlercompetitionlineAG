// Jede Regel aus lib/rules/checks.ts einzeln, mit minimalem Kontext: feuert
// / feuert nicht (siehe Aufgabenstellung). Reine Unit-Tests, keine DB.
import { describe, expect, it } from "vitest";
import { de } from "@/lib/i18n/de";
import { en } from "@/lib/i18n/en";
import { CHECK_RULES, runChecks } from "@/lib/rules/checks";
import type { CheckContext, CheckFamily, CheckProduct } from "@/lib/rules/checks";

/** Minimale, gültige Familie (Marke/Name irrelevant für die meisten Regeln - nur modell_mehrdeutig wertet sie aus). */
function family(overrides: Partial<CheckFamily> = {}): CheckFamily {
  return { hasPricelist: true, brand: "BMW", name: "M2 G87", codes: ["G87"], ...overrides };
}

function ctx(overrides: Partial<CheckContext> = {}): CheckContext {
  return {
    inquiry: {
      categories: [],
      consulting: false,
      character: null,
      timing: null,
      year: null,
      gearbox: null,
      line: null,
      ...overrides.inquiry,
    },
    family: overrides.family !== undefined ? overrides.family : family(),
    model: overrides.model !== undefined ? overrides.model : null,
    products: overrides.products ?? [],
  };
}

function product(overrides: Partial<CheckProduct> = {}): CheckProduct {
  return {
    category: "motor",
    name: "Sportluftfilter Satz",
    description: null,
    variantGroup: null,
    priceStatus: "priced",
    psTo: null,
    ...overrides,
  };
}

describe("CHECK_RULES: alle Regel-IDs haben einen i18n-Text (de und en)", () => {
  it.each(CHECK_RULES.map((r) => r.id))("checks.%s existiert in de.ts und en.ts", (id) => {
    expect((de.checks as Record<string, string>)[id]).toBeTruthy();
    expect((en.checks as Record<string, string>)[id]).toBeTruthy();
  });
});

describe("motor_auspuff_compat", () => {
  it("feuert bei Motor und Auspuff gewählt", () => {
    const c = ctx({ inquiry: { categories: ["motor", "auspuff"] } as CheckContext["inquiry"] });
    expect(CHECK_RULES.find((r) => r.id === "motor_auspuff_compat")!.when(c)).toBe(true);
  });
  it("feuert nicht bei nur Motor", () => {
    const c = ctx({ inquiry: { categories: ["motor"] } as CheckContext["inquiry"] });
    expect(CHECK_RULES.find((r) => r.id === "motor_auspuff_compat")!.when(c)).toBe(false);
  });
});

describe("stufe2_ohne_kats", () => {
  const rule = CHECK_RULES.find((r) => r.id === "stufe2_ohne_kats")!;
  it("feuert bei gewählter Stufe 2 ohne Hochleistungskats", () => {
    const c = ctx({
      products: [product({ name: "Stufe 2: (Basis 480 PS) 630PS / 740Nm", variantGroup: "leistung" })],
    });
    expect(rule.when(c)).toBe(true);
  });
  it("feuert nicht mit Hochleistungskats im Paket", () => {
    const c = ctx({
      products: [
        product({ name: "Stufe 2: (Basis 480 PS) 630PS / 740Nm", variantGroup: "leistung" }),
        product({ category: "auspuff", name: "Hochleistungskatalysatoren" }),
      ],
    });
    expect(rule.when(c)).toBe(false);
  });
  it("feuert nicht bei Stufe 1", () => {
    const c = ctx({
      products: [product({ name: "Stufe 1: (Basis 480 PS) 620PS / 740Nm", variantGroup: "leistung" })],
    });
    expect(rule.when(c)).toBe(false);
  });
});

describe("in_vorbereitung", () => {
  const rule = CHECK_RULES.find((r) => r.id === "in_vorbereitung")!;
  it("feuert bei einer Position 'in Vorbereitung'", () => {
    const c = ctx({ products: [product({ priceStatus: "in_preparation" })] });
    expect(rule.when(c)).toBe(true);
  });
  it("feuert nicht ohne solche Position", () => {
    const c = ctx({ products: [product({ priceStatus: "priced" })] });
    expect(rule.when(c)).toBe(false);
  });
});

describe("fahrwerk_einbausatz", () => {
  const rule = CHECK_RULES.find((r) => r.id === "fahrwerk_einbausatz")!;
  it("feuert bei gewählter Kategorie Fahrwerk", () => {
    expect(rule.when(ctx({ inquiry: { categories: ["fahrwerk"] } as CheckContext["inquiry"] }))).toBe(true);
  });
  it("feuert nicht ohne Fahrwerk", () => {
    expect(rule.when(ctx({ inquiry: { categories: ["motor"] } as CheckContext["inquiry"] }))).toBe(false);
  });
});

describe("raeder_details", () => {
  const rule = CHECK_RULES.find((r) => r.id === "raeder_details")!;
  it("feuert bei gewählter Kategorie Räder", () => {
    expect(rule.when(ctx({ inquiry: { categories: ["raeder"] } as CheckContext["inquiry"] }))).toBe(true);
  });
  it("feuert nicht ohne Räder", () => {
    expect(rule.when(ctx())).toBe(false);
  });
});

describe("exterieur_lack", () => {
  const rule = CHECK_RULES.find((r) => r.id === "exterieur_lack")!;
  it("feuert bei gewählter Kategorie Exterieur", () => {
    expect(rule.when(ctx({ inquiry: { categories: ["exterieur"] } as CheckContext["inquiry"] }))).toBe(true);
  });
  it("feuert nicht ohne Exterieur", () => {
    expect(rule.when(ctx())).toBe(false);
  });
});

describe("baujahr_homologation", () => {
  const rule = CHECK_RULES.find((r) => r.id === "baujahr_homologation")!;
  it("feuert bei Baujahr 'älter' (de)", () => {
    expect(rule.when(ctx({ inquiry: { year: "älter" } as CheckContext["inquiry"] }))).toBe(true);
  });
  it("feuert bei Baujahr 'older' (en)", () => {
    expect(rule.when(ctx({ inquiry: { year: "older" } as CheckContext["inquiry"] }))).toBe(true);
  });
  it("feuert nicht bei konkretem Baujahr", () => {
    expect(rule.when(ctx({ inquiry: { year: "2024" } as CheckContext["inquiry"] }))).toBe(false);
  });
});

describe("charakter_maximum_stufe1", () => {
  const rule = CHECK_RULES.find((r) => r.id === "charakter_maximum_stufe1")!;
  it("feuert bei Charakter Maximum und gewählter Stufe 1", () => {
    const c = ctx({
      inquiry: { character: "maximum" } as CheckContext["inquiry"],
      products: [product({ name: "Stufe 1: (Basis 480 PS) 620PS / 740Nm", variantGroup: "leistung" })],
    });
    expect(rule.when(c)).toBe(true);
  });
  it("feuert nicht bei Charakter Sportlich mit Stufe 1", () => {
    const c = ctx({
      inquiry: { character: "sportlich" } as CheckContext["inquiry"],
      products: [product({ name: "Stufe 1: (Basis 480 PS) 620PS / 740Nm", variantGroup: "leistung" })],
    });
    expect(rule.when(c)).toBe(false);
  });
  it("feuert nicht bei Charakter Maximum ohne Stufe 1", () => {
    const c = ctx({ inquiry: { character: "maximum" } as CheckContext["inquiry"], products: [] });
    expect(rule.when(c)).toBe(false);
  });
});

describe("zeitraum_kapazitaet", () => {
  const rule = CHECK_RULES.find((r) => r.id === "zeitraum_kapazitaet")!;
  it("feuert bei timing asap", () => {
    expect(rule.when(ctx({ inquiry: { timing: "asap" } as CheckContext["inquiry"] }))).toBe(true);
  });
  it("feuert nicht bei timing flexible", () => {
    expect(rule.when(ctx({ inquiry: { timing: "flexible" } as CheckContext["inquiry"] }))).toBe(false);
  });
});

describe("familie_ohne_preisliste", () => {
  const rule = CHECK_RULES.find((r) => r.id === "familie_ohne_preisliste")!;
  it("feuert ohne Preisliste", () => {
    expect(rule.when(ctx({ family: family({ hasPricelist: false }) }))).toBe(true);
  });
  it("feuert nicht mit Preisliste", () => {
    expect(rule.when(ctx({ family: family({ hasPricelist: true }) }))).toBe(false);
  });
});

describe("produkt_auf_anfrage", () => {
  const rule = CHECK_RULES.find((r) => r.id === "produkt_auf_anfrage")!;
  it("feuert bei Position 'auf Anfrage'", () => {
    expect(rule.when(ctx({ products: [product({ priceStatus: "on_request" })] }))).toBe(true);
  });
  it("feuert nicht ohne solche Position", () => {
    expect(rule.when(ctx({ products: [product({ priceStatus: "priced" })] }))).toBe(false);
  });
});

describe("komplettpaket_gewuenscht", () => {
  const rule = CHECK_RULES.find((r) => r.id === "komplettpaket_gewuenscht")!;
  it("feuert bei gewähltem Komplettpaket", () => {
    expect(rule.when(ctx({ inquiry: { consulting: true } as CheckContext["inquiry"] }))).toBe(true);
  });
  it("feuert nicht ohne Komplettpaket", () => {
    expect(rule.when(ctx({ inquiry: { consulting: false } as CheckContext["inquiry"] }))).toBe(false);
  });
});

// Rückmeldungen aus dem ersten Klicktest (Kundenflow M2 G87), siehe
// CLAUDE.md Abschnitt "AUFGABE", Punkt 3.
describe("getriebe_unbekannt", () => {
  const rule = CHECK_RULES.find((r) => r.id === "getriebe_unbekannt")!;

  it("feuert bei getriebespezifischer Auswahl ohne Getriebeangabe (gearbox null)", () => {
    const c = ctx({
      inquiry: { gearbox: null } as CheckContext["inquiry"],
      products: [product({ name: "Schaltwegverkürzung für Handschalter" })],
    });
    expect(rule.when(c)).toBe(true);
  });

  it("feuert bei 'unknown' (Weiss ich nicht) ebenfalls", () => {
    const c = ctx({
      inquiry: { gearbox: "unknown" } as CheckContext["inquiry"],
      products: [product({ name: "Getriebeoptimierung St.1 / 8 HP" })],
    });
    expect(rule.when(c)).toBe(true);
  });

  it("feuert nicht, wenn das Getriebe bekannt ist", () => {
    const c = ctx({
      inquiry: { gearbox: "manual" } as CheckContext["inquiry"],
      products: [product({ name: "Schaltwegverkürzung für Handschalter" })],
    });
    expect(rule.when(c)).toBe(false);
  });

  it("feuert nicht ohne getriebespezifische Auswahl, auch ohne Getriebeangabe", () => {
    const c = ctx({
      inquiry: { gearbox: null } as CheckContext["inquiry"],
      products: [product({ name: "Motorhaube Carbon" })],
    });
    expect(rule.when(c)).toBe(false);
  });
});

describe("vmax_doppelt", () => {
  const rule = CHECK_RULES.find((r) => r.id === "vmax_doppelt")!;

  it("feuert bei Stufe mit V/max-Zusatz PLUS separatem V/max-Produkt", () => {
    const c = ctx({
      products: [
        product({
          name: "Stufe 1: (Basis 460 PS)  610PS / 750Nm (M6 & A8-Getriebe) inkl. Anhebung der V/max Begrenzung",
          variantGroup: "leistung",
        }),
        product({ name: "Aufhebung der serienmässigen V/max Begrenzung", variantGroup: null }),
      ],
    });
    expect(rule.when(c)).toBe(true);
  });

  it("feuert nicht bei nur der Stufe mit V/max-Zusatz (ohne separates Produkt)", () => {
    const c = ctx({
      products: [
        product({
          name: "Stufe 1: (Basis 460 PS)  610PS / 750Nm (M6 & A8-Getriebe) inkl. Anhebung der V/max Begrenzung",
          variantGroup: "leistung",
        }),
      ],
    });
    expect(rule.when(c)).toBe(false);
  });

  it("feuert nicht bei einer Stufe ohne V/max-Zusatz plus dem separaten V/max-Produkt", () => {
    const c = ctx({
      products: [
        product({ name: "Stufe 1: (Basis 460 PS)  590PS / 720Nm (M6 & A8-Getriebe)", variantGroup: "leistung" }),
        product({ name: "Aufhebung der serienmässigen V/max Begrenzung", variantGroup: null }),
      ],
    });
    expect(rule.when(c)).toBe(false);
  });

  // Prüfung Modul Parser, Befund 2: die V/max-Nennung steht bei einigen
  // Stufen nur in der description (z.B. M2 F87 N55), nicht im Namen.
  it("feuert auch, wenn die Stufe den V/max-Zusatz nur in der description trägt", () => {
    const c = ctx({
      products: [
        product({
          name: "Stufe 2: (Basis 370 PS) 425 PS / 610 Nm, N55",
          description: "Inkl. Aufhebung der serienmässigen V/max Begrenzung",
          variantGroup: "leistung",
        }),
        product({ name: "Aufhebung der serienmässigen V/max Begrenzung", variantGroup: null }),
      ],
    });
    expect(rule.when(c)).toBe(true);
  });
});

// Feinschliff-Prüfung 15.09.2026 (Ambiguität X1/X2, X3/X4, X5/X6, siehe
// docs/architektur.md Abschnitt "Fahrzeugbezeichnung" und
// lib/catalog/vehicle-label.ts vehicleLineIsAmbiguous()).
describe("modell_mehrdeutig", () => {
  const rule = CHECK_RULES.find((r) => r.id === "modell_mehrdeutig")!;

  it("feuert, wenn die Motorisierung mit keiner Alternative der Baureihe ein Wort teilt (X1/X2)", () => {
    const c = ctx({
      family: family({ brand: "BMW", name: "X1 U11 / X2 U10", codes: ["U11", "U10"] }),
      model: { id: "m1", name: "20d" },
    });
    expect(rule.when(c)).toBe(true);
  });

  it("feuert nicht, wenn die Motorisierung eine Alternative eindeutig trifft", () => {
    const c = ctx({
      family: family({ brand: "BMW", name: "X1 U11 / X2 U10", codes: ["U11", "U10"] }),
      model: { id: "m1", name: "X1 xDrive20d" },
    });
    expect(rule.when(c)).toBe(false);
  });

  it("feuert nicht ohne Alternativen in der Baureihe", () => {
    const c = ctx({
      family: family({ brand: "BMW", name: "M2 G87", codes: ["G87"] }),
      model: { id: "m1", name: "M2" },
    });
    expect(rule.when(c)).toBe(false);
  });

  it("feuert nicht ohne gewähltes Modell", () => {
    const c = ctx({ family: family({ brand: "BMW", name: "X1 U11 / X2 U10", codes: ["U11", "U10"] }), model: null });
    expect(rule.when(c)).toBe(false);
  });

  // Kundenentscheid 17.09.2026 ("bei X1 und X2 gibt es dieselben
  // Motorisierungen, das Modell ist X1 oder X2"): der Hinweis feuert nur
  // noch ohne gültige gespeicherte line (der Flow selbst erzwingt die Wahl
  // bereits, siehe CarStep.tsx - der Hinweis bleibt nur für Fälle ohne
  // Angabe, z.B. Schnellweg).
  it("feuert nicht mit gültiger line ('x2')", () => {
    const c = ctx({
      family: family({ brand: "BMW", name: "X1 U11 / X2 U10", codes: ["U11", "U10"] }),
      model: { id: "m1", name: "20d" },
      inquiry: { line: "x2" } as CheckContext["inquiry"],
    });
    expect(rule.when(c)).toBe(false);
  });

  it("feuert weiterhin mit einer ungültigen/veralteten line", () => {
    const c = ctx({
      family: family({ brand: "BMW", name: "X1 U11 / X2 U10", codes: ["U11", "U10"] }),
      model: { id: "m1", name: "20d" },
      inquiry: { line: "x9" } as CheckContext["inquiry"],
    });
    expect(rule.when(c)).toBe(true);
  });

  it("feuert weiterhin ohne line (Frage nicht gestellt, z.B. Schnellweg)", () => {
    const c = ctx({
      family: family({ brand: "BMW", name: "X1 U11 / X2 U10", codes: ["U11", "U10"] }),
      model: { id: "m1", name: "20d" },
      inquiry: { line: null } as CheckContext["inquiry"],
    });
    expect(rule.when(c)).toBe(true);
  });

  // Ausnahme 8er/M8 (Ergänzung 15.09.2026, Feinschliff-Prüfung): "M8"
  // scheidet als Alternative aus, wenn die Motorisierung selbst kein
  // M-Modell ist - "8er" bleibt dann als einzige, eindeutige Alternative.
  it("feuert nicht bei der Ausnahme 8er/M8: '40i' ist kein M-Modell, 'M8' scheidet aus, '8er' bleibt eindeutig", () => {
    const c = ctx({
      family: family({
        brand: "BMW",
        name: "8er G14, G15, G16 / M8 F91, F92, F93",
        codes: ["G14", "G15", "G16", "F91", "F92", "F93"],
      }),
      model: { id: "m1", name: "40i" },
    });
    expect(rule.when(c)).toBe(false);
  });

  it("feuert nicht bei der Ausnahme 8er/M8, auch für 'M8' selbst (sharedWordScore trifft 'M8' ohnehin eindeutig)", () => {
    const c = ctx({
      family: family({
        brand: "BMW",
        name: "8er G14, G15, G16 / M8 F91, F92, F93",
        codes: ["G14", "G15", "G16", "F91", "F92", "F93"],
      }),
      model: { id: "m1", name: "M8" },
    });
    expect(rule.when(c)).toBe(false);
  });

  it("feuert bei 4er Coupé/Cabrio/Grand Coupé: keine der drei Alternativen teilt ein Wort mit '20i'", () => {
    const c = ctx({
      family: family({
        brand: "BMW",
        name: "4er Coupé G22, Cabrio G23, Grand Coupé G26",
        codes: ["G22", "G23", "G26"],
      }),
      model: { id: "m1", name: "20i" },
    });
    expect(rule.when(c)).toBe(true);
  });

  it("feuert bei X3/X4 und bei X5/X6 (dasselbe Muster wie X1/X2)", () => {
    const x3x4 = ctx({
      family: family({ brand: "BMW", name: "X3 G01, X4 G02", codes: ["G01", "G02"] }),
      model: { id: "m1", name: "20i" },
    });
    expect(rule.when(x3x4)).toBe(true);

    const x5x6 = ctx({
      family: family({ brand: "BMW", name: "X5 G05, X6 G06", codes: ["G05", "G06"] }),
      model: { id: "m1", name: "40i" },
    });
    expect(rule.when(x5x6)).toBe(true);
  });

  // Text nennt die konkreten Alternativen ({alternatives}, per tf() aus
  // vehicleAmbiguousAlternatives() gefüllt), nicht mehr generische Beispiele.
  it("runChecks (de): Text enthält 'X1 / X2', nicht die alte generische Aufzählung", () => {
    const c = ctx({
      family: family({ brand: "BMW", name: "X1 U11 / X2 U10", codes: ["U11", "U10"] }),
      model: { id: "m1", name: "20d" },
    });
    const hit = runChecks(c, "de").find((r) => r.id === "modell_mehrdeutig");
    expect(hit?.text).toBe("Baureihe umfasst X1 / X2, Modell beim Kunden klären.");
  });

  it("runChecks (en): Text enthält 'X1 / X2'", () => {
    const c = ctx({
      family: family({ brand: "BMW", name: "X1 U11 / X2 U10", codes: ["U11", "U10"] }),
      model: { id: "m1", name: "20d" },
    });
    const hit = runChecks(c, "en").find((r) => r.id === "modell_mehrdeutig");
    expect(hit?.text).toBe("Model series covers X1 / X2, clarify the model with the customer.");
  });

  it("runChecks: Text für 4er Coupé/Cabrio/Grand Coupé nennt alle drei Alternativen", () => {
    const c = ctx({
      family: family({
        brand: "BMW",
        name: "4er Coupé G22, Cabrio G23, Grand Coupé G26",
        codes: ["G22", "G23", "G26"],
      }),
      model: { id: "m1", name: "20i" },
    });
    const hit = runChecks(c, "de").find((r) => r.id === "modell_mehrdeutig");
    expect(hit?.text).toBe("Baureihe umfasst 4er Coupé / Cabrio / Grand Coupé, Modell beim Kunden klären.");
  });

  it("runChecks: kein Treffer bei der Ausnahme 8er/M8 (8er + 40i)", () => {
    const c = ctx({
      family: family({
        brand: "BMW",
        name: "8er G14, G15, G16 / M8 F91, F92, F93",
        codes: ["G14", "G15", "G16", "F91", "F92", "F93"],
      }),
      model: { id: "m1", name: "40i" },
    });
    expect(runChecks(c, "de").find((r) => r.id === "modell_mehrdeutig")).toBeUndefined();
  });
});

describe("runChecks", () => {
  it("liefert lokalisierte Texte (de)", () => {
    const c = ctx({ inquiry: { categories: ["motor", "auspuff"] } as CheckContext["inquiry"] });
    const result = runChecks(c, "de");
    expect(result).toEqual([{ id: "motor_auspuff_compat", text: de.checks.motor_auspuff_compat }]);
  });
  it("liefert lokalisierte Texte (en)", () => {
    const c = ctx({ inquiry: { categories: ["motor", "auspuff"] } as CheckContext["inquiry"] });
    const result = runChecks(c, "en");
    expect(result).toEqual([{ id: "motor_auspuff_compat", text: en.checks.motor_auspuff_compat }]);
  });
  it("liefert eine leere Liste ohne Treffer", () => {
    expect(runChecks(ctx(), "de")).toEqual([]);
  });
  it("liefert mehrere Treffer in Regel-Reihenfolge", () => {
    const c = ctx({
      inquiry: {
        categories: ["motor", "auspuff", "fahrwerk"],
        consulting: true,
      } as CheckContext["inquiry"],
    });
    const ids = runChecks(c, "de").map((r) => r.id);
    expect(ids).toEqual(["motor_auspuff_compat", "fahrwerk_einbausatz", "komplettpaket_gewuenscht"]);
  });
});
