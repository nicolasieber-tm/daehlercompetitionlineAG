// Jede Regel aus lib/rules/checks.ts einzeln, mit minimalem Kontext: feuert
// / feuert nicht (siehe Aufgabenstellung). Reine Unit-Tests, keine DB.
import { describe, expect, it } from "vitest";
import { de } from "@/lib/i18n/de";
import { en } from "@/lib/i18n/en";
import { CHECK_RULES, runChecks } from "@/lib/rules/checks";
import type { CheckContext, CheckProduct } from "@/lib/rules/checks";

function ctx(overrides: Partial<CheckContext> = {}): CheckContext {
  return {
    inquiry: {
      categories: [],
      consulting: false,
      character: null,
      timing: null,
      year: null,
      ...overrides.inquiry,
    },
    family: overrides.family !== undefined ? overrides.family : { hasPricelist: true },
    model: overrides.model !== undefined ? overrides.model : null,
    products: overrides.products ?? [],
  };
}

function product(overrides: Partial<CheckProduct> = {}): CheckProduct {
  return {
    category: "motor",
    name: "Sportluftfilter Satz",
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
    expect(rule.when(ctx({ family: { hasPricelist: false } }))).toBe(true);
  });
  it("feuert nicht mit Preisliste", () => {
    expect(rule.when(ctx({ family: { hasPricelist: true } }))).toBe(false);
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
