// Prüfung, Befund 2 (major): components/flow/state.ts SET_SERIES_PS muss
// bereits gewählte Leistungsprodukte, deren ps_base an die ALTE
// Serienleistung gebunden ist, aus state.selections entfernen (sonst bliebe
// z.B. eine "Stufe 1 (Basis 460 PS)"-Auswahl nach einem Wechsel auf "480 PS
// Serie" stehen, obwohl sie im Motor-Schritt gar nicht mehr angezeigt wird,
// siehe motorProductVisible()). SELECT_MODEL/SELECT_FAMILY leeren
// state.selections ohnehin bereits vollständig - hier zur Vollständigkeit
// als Regressionstest mitgeprüft.
import { describe, expect, it } from "vitest";
import { flowReducer, gearboxSelectionVisible, initialFlowState, isVmaxLocked, vmaxLiftStage } from "@/components/flow/state";
import type { FlowState } from "@/components/flow/state";
import type { CatalogProduct } from "@/lib/catalog/queries";

function product(overrides: Partial<CatalogProduct> & { id: string; category: CatalogProduct["category"] }): CatalogProduct {
  return {
    name: overrides.id,
    description: null,
    sourceCategory: "Motor",
    groupLabel: null,
    articleNo: null,
    priceParts: null,
    priceInstall: null,
    priceApproval: null,
    priceTotal: 4180,
    priceStatus: "priced",
    priceNote: null,
    psBase: [],
    psTo: null,
    nmTo: null,
    variantGroup: null,
    gearbox: null,
    sort: 0,
    ...overrides,
  };
}

function withSelections(selections: FlowState["selections"]): FlowState {
  return { ...initialFlowState(), categories: ["motor", "auspuff"], selections };
}

describe("flowReducer SET_SERIES_PS", () => {
  it("entfernt ein gewähltes Motor-Leistungsprodukt, dessen ps_base zur neuen Serienleistung nicht mehr passt", () => {
    const stage1Basis460 = product({ id: "stage1-460", category: "motor", psBase: [460], variantGroup: "leistung" });
    const state = withSelections({ motor: [stage1Basis460] });

    const next = flowReducer(state, { type: "SET_SERIES_PS", ps: 480 });

    expect(next.seriesPsChoice).toBe(480);
    expect(next.selections.motor).toEqual([]);
  });

  it("behält ein gewähltes Produkt, dessen ps_base die neue Serienleistung weiterhin enthält", () => {
    const stage1Basis480 = product({ id: "stage1-480", category: "motor", psBase: [460, 480], variantGroup: "leistung" });
    const state = withSelections({ motor: [stage1Basis480] });

    const next = flowReducer(state, { type: "SET_SERIES_PS", ps: 480 });

    expect(next.selections.motor).toEqual([stage1Basis480]);
  });

  it("behält Produkte ohne ps_base (für jede Serienleistung sichtbar) über alle Kategorien hinweg", () => {
    const auspuff = product({ id: "auspuff-1", category: "auspuff", psBase: [] });
    const state = withSelections({ auspuff: [auspuff] });

    const next = flowReducer(state, { type: "SET_SERIES_PS", ps: 480 });

    expect(next.selections.auspuff).toEqual([auspuff]);
  });

  it("filtert gemischte Auswahl: passende Produkte bleiben, nicht mehr passende fallen weg", () => {
    const stage1Basis460 = product({ id: "stage1-460", category: "motor", psBase: [460], variantGroup: "leistung" });
    const stageAny = product({ id: "stage-any", category: "motor", psBase: [] });
    const state = withSelections({ motor: [stage1Basis460, stageAny] });

    const next = flowReducer(state, { type: "SET_SERIES_PS", ps: 480 });

    expect(next.selections.motor).toEqual([stageAny]);
  });
});

describe("flowReducer SELECT_MODEL/SELECT_FAMILY: selections werden beim Wechsel vollständig geleert", () => {
  it("SELECT_MODEL leert selections aller Kategorien", () => {
    const p = product({ id: "p1", category: "motor" });
    const state = withSelections({ motor: [p] });

    const next = flowReducer(state, { type: "SELECT_MODEL", modelId: "other-model" });

    expect(next.selections).toEqual({});
  });

  it("SELECT_FAMILY leert selections aller Kategorien", () => {
    const p = product({ id: "p1", category: "motor" });
    const state = withSelections({ motor: [p] });

    const next = flowReducer(state, { type: "SELECT_FAMILY", familyId: "other-family", hasPricelist: true });

    expect(next.selections).toEqual({});
  });
});

// Rückmeldung erster Klicktest (Kundenflow M2 G87), siehe CLAUDE.md
// Abschnitt "AUFGABE", Punkt 3.
describe("flowReducer SET_GEARBOX", () => {
  it("entfernt ein gewähltes getriebespezifisches Produkt, das zur neuen Wahl nicht passt", () => {
    const schaltweg = product({ id: "schaltweg", category: "motor", gearbox: "manual" });
    const state = withSelections({ motor: [schaltweg] });

    const next = flowReducer(state, { type: "SET_GEARBOX", gearbox: "automatic" });

    expect(next.gearboxChoice).toBe("automatic");
    expect(next.selections.motor).toEqual([]);
  });

  it("behält ein gewähltes Produkt, das zur neuen Wahl passt", () => {
    const getriebeoptimierung = product({ id: "getriebeoptimierung", category: "motor", gearbox: "automatic" });
    const state = withSelections({ motor: [getriebeoptimierung] });

    const next = flowReducer(state, { type: "SET_GEARBOX", gearbox: "automatic" });

    expect(next.selections.motor).toEqual([getriebeoptimierung]);
  });

  it("behält getriebeneutrale Produkte (gearbox null) über alle Kategorien hinweg", () => {
    const neutral = product({ id: "neutral", category: "fahrwerk", gearbox: null });
    const state = withSelections({ fahrwerk: [neutral] });

    const next = flowReducer(state, { type: "SET_GEARBOX", gearbox: "manual" });

    expect(next.selections.fahrwerk).toEqual([neutral]);
  });
});

describe("gearboxSelectionVisible", () => {
  it("getriebeneutrales Produkt ist immer sichtbar", () => {
    expect(gearboxSelectionVisible(product({ id: "p", category: "motor", gearbox: null }), "manual")).toBe(true);
    expect(gearboxSelectionVisible(product({ id: "p", category: "motor", gearbox: null }), null)).toBe(true);
  });

  it("ohne Antwort oder 'unknown' bleiben alle Produkte sichtbar", () => {
    const manualProduct = product({ id: "p", category: "motor", gearbox: "manual" });
    expect(gearboxSelectionVisible(manualProduct, null)).toBe(true);
    expect(gearboxSelectionVisible(manualProduct, "unknown")).toBe(true);
  });

  it("mit Antwort wird das jeweils andere Getriebe ausgeblendet", () => {
    const manualProduct = product({ id: "p", category: "motor", gearbox: "manual" });
    expect(gearboxSelectionVisible(manualProduct, "manual")).toBe(true);
    expect(gearboxSelectionVisible(manualProduct, "automatic")).toBe(false);
  });
});

// Rückmeldung zweiter Klicktest (Kundenflow M2 G87), siehe CLAUDE.md
// Abschnitt "AUFGABE", Punkt 1: echte M2 G87 Basis-460-Produkte (siehe
// docs/db.md) - eine Stufe 1 ohne V/max-Zusatz, eine mit ("inkl. Anhebung
// der V/max Begrenzung"), und das eigenständige V/max-Produkt ("Aufhebung
// der serienmässigen V/max Begrenzung", variant_group null, KEINE
// Leistungsstufe, anders als isStandaloneVmaxProduct()/"... ohne
// Leistungssteigerung").
const stage1NoVmax = product({
  id: "stage1-no-vmax",
  category: "motor",
  name: "Stufe 1: (Basis 460 PS)  590PS / 720Nm (M6 & A8-Getriebe)",
  variantGroup: "leistung",
  psTo: 590,
  nmTo: 720,
});
const stage1WithVmax = product({
  id: "stage1-with-vmax",
  category: "motor",
  name: "Stufe 1: (Basis 460 PS)  610PS / 750Nm (M6 & A8-Getriebe) inkl. Anhebung der V/max Begrenzung",
  variantGroup: "leistung",
  psTo: 610,
  nmTo: 750,
});
const standaloneVmax = product({
  id: "standalone-vmax",
  category: "motor",
  name: "Aufhebung der serienmässigen V/max Begrenzung",
  variantGroup: null,
});

describe("flowReducer PICK_PRODUCT: V/max-Doppelung (beide Reihenfolgen)", () => {
  it("Stufe mit V/max zuerst, dann Einzel-V/max: die Kachel ist gesperrt, PICK_PRODUCT bleibt wirkungslos", () => {
    const state = withSelections({});
    const afterStage = flowReducer(state, { type: "PICK_PRODUCT", category: "motor", product: stage1WithVmax });
    expect(afterStage.selections.motor).toEqual([stage1WithVmax]);

    const afterStandalone = flowReducer(afterStage, {
      type: "PICK_PRODUCT",
      category: "motor",
      product: standaloneVmax,
    });
    // Gesperrt: die Kachel bleibt unwählbar, die Auswahl bleibt unverändert.
    expect(afterStandalone.selections.motor).toEqual([stage1WithVmax]);
  });

  it("Einzel-V/max zuerst, dann Stufe mit V/max: dasselbe Ergebnis, das Einzelprodukt wird automatisch entfernt", () => {
    const state = withSelections({});
    const afterStandalone = flowReducer(state, {
      type: "PICK_PRODUCT",
      category: "motor",
      product: standaloneVmax,
    });
    expect(afterStandalone.selections.motor).toEqual([standaloneVmax]);

    const afterStage = flowReducer(afterStandalone, {
      type: "PICK_PRODUCT",
      category: "motor",
      product: stage1WithVmax,
    });
    expect(afterStage.selections.motor).toEqual([stage1WithVmax]);
  });

  it("Stufe OHNE V/max-Zusatz sperrt das Einzel-V/max-Produkt nicht", () => {
    const state = withSelections({});
    const afterStandalone = flowReducer(state, {
      type: "PICK_PRODUCT",
      category: "motor",
      product: standaloneVmax,
    });
    const afterStage = flowReducer(afterStandalone, {
      type: "PICK_PRODUCT",
      category: "motor",
      product: stage1NoVmax,
    });
    // Beide bleiben gewählt: unterschiedliche variant_group (leistung vs.
    // null), keine V/max-Aufhebung in der gewählten Stufe.
    expect(afterStage.selections.motor).toEqual([standaloneVmax, stage1NoVmax]);
  });

  it("Abwählen der Stufe hebt die Sperre wieder auf", () => {
    const state = withSelections({ motor: [stage1WithVmax] });
    const afterUnpick = flowReducer(state, { type: "PICK_PRODUCT", category: "motor", product: stage1WithVmax });
    expect(afterUnpick.selections.motor).toEqual([]);
    expect(isVmaxLocked(standaloneVmax, afterUnpick.selections)).toBe(false);
  });
});

describe("isVmaxLocked / vmaxLiftStage", () => {
  it("ohne gewählte V/max-Stufe ist nichts gesperrt", () => {
    expect(vmaxLiftStage({})).toBeNull();
    expect(isVmaxLocked(standaloneVmax, { motor: [stage1NoVmax] })).toBe(false);
  });

  it("mit gewählter V/max-Stufe ist nur das eigenständige V/max-Produkt gesperrt, nicht die Stufe selbst", () => {
    const selections = { motor: [stage1WithVmax] };
    expect(vmaxLiftStage(selections)).toEqual(stage1WithVmax);
    expect(isVmaxLocked(standaloneVmax, selections)).toBe(true);
    expect(isVmaxLocked(stage1WithVmax, selections)).toBe(false);
  });
});
