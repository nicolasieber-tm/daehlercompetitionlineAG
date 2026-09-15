// Zustand des Kundenflows: Typen, Reducer, Ableitungen (Schrittfolge,
// Richtsumme). Siehe docs/architektur.md, Abschnitt "Kundenflow", und
// docs/vorschau.html (Referenz für Ablauf/Verhalten, dort als einfaches
// S-Objekt + Funktionen statt useReducer, siehe Skript dort).
//
// Der aktuelle Schritt wird bewusst als StepId (nicht als Zahlenindex)
// gehalten: die Schrittfolge selbst hängt vom State ab (Kurzablauf,
// gewählte Kategorien, siehe buildSteps()), ein Index würde bei jeder
// Änderung der Kategorien neu geclamped werden müssen. Als StepId bleibt
// der aktuelle Schritt automatisch gültig, ausser der Nutzer entfernt genau
// den Schritt, auf dem er gerade steht - das passiert im Flow nie (siehe
// ADD_UPSELL_CATEGORY/REMOVE_UPSELL_CATEGORY unten: "Doch nicht" steht immer
// auf einem ANDEREN Kategorie-Schritt als dem vorgeschlagenen).
import type { CatalogProduct, CategoryNote, ProductGroup } from "@/lib/catalog/queries";
import { gearboxProductVisible } from "@/lib/catalog/gearbox";
import type { Brand, Channel, Character, FlowCategory, InquiryGearbox, Timing } from "@/lib/supabase/rows";

export type StepId = "car" | "wish" | `cat:${FlowCategory}` | "character" | "contact" | "done";

export function categoryOfStep(step: StepId): FlowCategory | null {
  return step.startsWith("cat:") ? (step.slice(4) as FlowCategory) : null;
}

export interface ContactFields {
  firstName: string;
  lastName: string;
  city: string;
  phone: string;
  email: string;
}

export interface SubmitResult {
  id: string;
  number: string;
  shareToken: string;
  estimatedTotal: number | null;
}

export interface FlowState {
  // Schritt 1: Fahrzeug
  selectedBrand: Brand | null;
  familyId: string | null;
  familyHasPricelist: boolean;
  modelId: string | null;
  seriesPsChoice: number | null;
  /** Antwort auf die Getriebefrage (nur gefragt, wenn das Modell mindestens
   * ein getriebespezifisches Produkt hat, siehe CatalogModel.
   * hasGearboxSpecificProducts); null solange unbeantwortet bzw. wenn die
   * Frage für dieses Modell gar nicht gestellt wird. Rückmeldung erster
   * Klicktest, CLAUDE.md Abschnitt "AUFGABE", Punkt 3. */
  gearboxChoice: InquiryGearbox | null;
  year: string;
  beenHere: boolean;

  // Produkte des gewählten Modells (einmal geladen, siehe app/api/catalog/products)
  productsStatus: "idle" | "loading" | "loaded" | "error";
  productsError: string | null;
  productGroups: ProductGroup[];
  productNotes: CategoryNote[];

  // Schritt 2: Wunsch
  categories: FlowCategory[];
  consulting: boolean;
  upsoldCategories: FlowCategory[];

  // Schritt 3: je Kategorie
  selections: Partial<Record<FlowCategory, CatalogProduct[]>>;
  followUpAnswers: Partial<Record<FlowCategory, string>>;

  // Schritt 4: Charakter
  character: Character | null;
  message: string;

  // Schritt 5: Termin und Kontakt
  timing: Timing;
  channel: Channel;
  contact: ContactFields;
  privacyAccepted: boolean;
  contactTouched: Partial<Record<keyof ContactFields | "privacy", boolean>>;
  submitAttempted: boolean;

  currentStep: StepId;

  submitStatus: "idle" | "submitting" | "error";
  submitError: string | null;
  result: SubmitResult | null;
}

export const YEAR_OPTIONS_BASE = ["2026", "2025", "2024", "2023", "2022", "2021", "2020"] as const;

export function initialFlowState(): FlowState {
  return {
    selectedBrand: null,
    familyId: null,
    familyHasPricelist: true,
    modelId: null,
    seriesPsChoice: null,
    gearboxChoice: null,
    year: YEAR_OPTIONS_BASE[0],
    beenHere: false,

    productsStatus: "idle",
    productsError: null,
    productGroups: [],
    productNotes: [],

    categories: [],
    consulting: false,
    upsoldCategories: [],

    selections: {},
    followUpAnswers: {},

    character: null,
    message: "",

    timing: "asap",
    channel: "phone",
    contact: { firstName: "", lastName: "", city: "", phone: "", email: "" },
    privacyAccepted: false,
    contactTouched: {},
    submitAttempted: false,

    currentStep: "car",

    submitStatus: "idle",
    submitError: null,
    result: null,
  };
}

/** Kurzablauf: Familie ohne Preisliste, Baujahr "älter", oder kein Modell (siehe CLAUDE.md "Modelle ohne Preisliste"). */
export function isShortFlow(state: FlowState, yearOlderLabel: string): boolean {
  return !state.familyHasPricelist || state.year === yearOlderLabel || state.modelId === null;
}

/** Schrittfolge car -> wish -> cat:<id>... -> character -> contact -> done (Kurzablauf ohne cat:-Schritte). */
export function buildSteps(state: FlowState, yearOlderLabel: string): StepId[] {
  if (isShortFlow(state, yearOlderLabel)) {
    return ["car", "wish", "character", "contact", "done"];
  }
  return ["car", "wish", ...state.categories.map((c): StepId => `cat:${c}`), "character", "contact", "done"];
}

/** Alle aktuell gewählten Produkte über alle Kategorien, in Kategorie-Reihenfolge. */
export function allSelectedProducts(state: FlowState): CatalogProduct[] {
  const out: CatalogProduct[] = [];
  for (const c of state.categories) {
    for (const p of state.selections[c] ?? []) out.push(p);
  }
  return out;
}

/** Richtsumme: Summe price_total der priced-Produkte, null ohne jede geprisste Position. */
export function selectionTotal(state: FlowState): number | null {
  const priced = allSelectedProducts(state).filter((p) => p.priceStatus === "priced" && p.priceTotal != null);
  if (priced.length === 0) return null;
  return priced.reduce((sum, p) => sum + (p.priceTotal ?? 0), 0);
}

/** true, wenn mindestens eine gewählte Position ohne Preis ist (in_preparation/on_request). */
export function hasUnpricedSelection(state: FlowState): boolean {
  return allSelectedProducts(state).some((p) => p.priceStatus !== "priced");
}

/**
 * Effektive Serienleistung: model.seriesPs, sonst der einzige Vorschlagswert,
 * sonst die Auswahl des Nutzers (state.seriesPsChoice), sonst null.
 */
export function effectiveSeriesPs(
  modelSeriesPs: number | null,
  seriesPsSuggested: number[],
  seriesPsChoice: number | null,
): number | null {
  if (modelSeriesPs != null) return modelSeriesPs;
  if (seriesPsSuggested.length === 1) return seriesPsSuggested[0];
  return seriesPsChoice;
}

/** Motor-Filter: ps_base leer ODER seriesPs in ps_base enthalten (siehe Aufgabenstellung). */
export function motorProductVisible(product: CatalogProduct, seriesPs: number | null): boolean {
  if (product.psBase.length === 0) return true;
  return seriesPs !== null && product.psBase.includes(seriesPs);
}

/**
 * Getriebe-Filter: getriebeneutrale Produkte (gearbox null) sind immer
 * sichtbar; ohne Antwort oder bei "unknown" ("Weiss ich nicht") bleiben
 * ALLE Produkte sichtbar; sonst nur die zur Wahl passenden. Rückmeldung
 * erster Klicktest, CLAUDE.md Abschnitt "AUFGABE", Punkt 3.
 */
export function gearboxSelectionVisible(product: CatalogProduct, gearboxChoice: InquiryGearbox | null): boolean {
  return gearboxProductVisible(product.gearbox, gearboxChoice);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type FlowAction =
  | { type: "SET_BRAND"; brand: Brand }
  | { type: "SELECT_FAMILY"; familyId: string; hasPricelist: boolean }
  | { type: "SELECT_MODEL"; modelId: string }
  | { type: "SET_SERIES_PS"; ps: number }
  | { type: "SET_GEARBOX"; gearbox: InquiryGearbox }
  | { type: "SET_YEAR"; year: string }
  | { type: "SET_BEEN_HERE"; beenHere: boolean }
  | { type: "PRODUCTS_LOADING" }
  | { type: "PRODUCTS_LOADED"; groups: ProductGroup[]; notes: CategoryNote[] }
  | { type: "PRODUCTS_ERROR"; error: string }
  | { type: "TOGGLE_CATEGORY"; category: FlowCategory }
  | { type: "SET_CONSULTING"; value: boolean }
  | { type: "PICK_PRODUCT"; category: FlowCategory; product: CatalogProduct }
  | { type: "SET_FOLLOW_UP"; category: FlowCategory; optionId: string }
  | { type: "ADD_UPSELL_CATEGORY"; category: FlowCategory; afterCategory: FlowCategory; firstProduct: CatalogProduct | null }
  | { type: "REMOVE_UPSELL_CATEGORY"; category: FlowCategory }
  | { type: "SET_CHARACTER"; character: Character }
  | { type: "SET_MESSAGE"; message: string }
  | { type: "SET_TIMING"; timing: Timing }
  | { type: "SET_CHANNEL"; channel: Channel }
  | { type: "SET_CONTACT_FIELD"; field: keyof ContactFields; value: string }
  | { type: "TOUCH_CONTACT_FIELD"; field: keyof ContactFields | "privacy" }
  | { type: "SET_PRIVACY"; value: boolean }
  | { type: "GO_NEXT"; steps: StepId[] }
  | { type: "GO_BACK"; steps: StepId[] }
  | { type: "MARK_SUBMIT_ATTEMPTED" }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_SUCCESS"; result: SubmitResult }
  | { type: "SUBMIT_ERROR"; error: string }
  | { type: "RESTART" };

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "SET_BRAND":
      return { ...state, selectedBrand: action.brand };

    case "SELECT_FAMILY": {
      if (state.familyId === action.familyId) return state;
      return {
        ...state,
        familyId: action.familyId,
        familyHasPricelist: action.hasPricelist,
        modelId: null,
        seriesPsChoice: null,
        gearboxChoice: null,
        productsStatus: "idle",
        productsError: null,
        productGroups: [],
        productNotes: [],
        selections: {},
      };
    }

    case "SELECT_MODEL": {
      if (state.modelId === action.modelId) return state;
      return {
        ...state,
        modelId: action.modelId,
        seriesPsChoice: null,
        gearboxChoice: null,
        productsStatus: "idle",
        productsError: null,
        productGroups: [],
        productNotes: [],
        selections: {},
      };
    }

    case "SET_SERIES_PS": {
      // Prüfung: bereits gewählte Produkte, deren ps_base an die ALTE
      // Serienleistung gebunden ist, passen zur neu gewählten Basis nicht
      // mehr (motorProductVisible() wäre jetzt false) - sie müssen aus
      // state.selections verschwinden, sonst bliebe z.B. eine "Stufe 1
      // (Basis 460 PS)"-Auswahl nach einem Wechsel auf "480 PS Serie"
      // stehen, obwohl sie im Motor-Schritt gar nicht mehr angezeigt wird.
      // Modell-/Familienwechsel (SELECT_MODEL/SELECT_FAMILY) leeren
      // state.selections ohnehin bereits vollständig, hier reicht ein
      // gezielter Filter je Kategorie über alle bisher gewählten Produkte
      // (motorProductVisible prüft generisch über psBase, nicht nur für
      // category "motor").
      const selections = Object.fromEntries(
        Object.entries(state.selections).map(([category, products]) => [
          category,
          (products ?? []).filter((p) => motorProductVisible(p, action.ps)),
        ]),
      ) as FlowState["selections"];
      return { ...state, seriesPsChoice: action.ps, selections };
    }

    case "SET_GEARBOX": {
      // Analog SET_SERIES_PS oben: bereits gewählte getriebespezifische
      // Produkte, die zum neu gewählten Getriebe nicht mehr passen, müssen
      // aus state.selections verschwinden (Kraftübertragung-Schritt würde
      // sie sonst weiterhin anzeigen, obwohl der Kategorie-Schritt sie nach
      // der neuen Wahl ausblendet). Rückmeldung erster Klicktest, CLAUDE.md
      // Abschnitt "AUFGABE", Punkt 3.
      const selections = Object.fromEntries(
        Object.entries(state.selections).map(([category, products]) => [
          category,
          (products ?? []).filter((p) => gearboxSelectionVisible(p, action.gearbox)),
        ]),
      ) as FlowState["selections"];
      return { ...state, gearboxChoice: action.gearbox, selections };
    }

    case "SET_YEAR":
      return { ...state, year: action.year };

    case "SET_BEEN_HERE":
      return { ...state, beenHere: action.beenHere };

    case "PRODUCTS_LOADING":
      return { ...state, productsStatus: "loading", productsError: null };

    case "PRODUCTS_LOADED":
      return {
        ...state,
        productsStatus: "loaded",
        productsError: null,
        productGroups: action.groups,
        productNotes: action.notes,
      };

    case "PRODUCTS_ERROR":
      return { ...state, productsStatus: "error", productsError: action.error };

    case "TOGGLE_CATEGORY": {
      const has = state.categories.includes(action.category);
      const categories = has
        ? state.categories.filter((c) => c !== action.category)
        : [...state.categories, action.category];
      const upsoldCategories = state.upsoldCategories.filter((c) => categories.includes(c));
      const selections = { ...state.selections };
      if (has) delete selections[action.category];
      return { ...state, categories, upsoldCategories, selections };
    }

    case "SET_CONSULTING":
      return { ...state, consulting: action.value };

    case "PICK_PRODUCT": {
      const { category, product } = action;
      const current = state.selections[category] ?? [];
      const isSelected = current.some((p) => p.id === product.id);
      let next: CatalogProduct[];
      if (isSelected) {
        next = current.filter((p) => p.id !== product.id);
      } else if (product.variantGroup) {
        next = [...current.filter((p) => p.variantGroup !== product.variantGroup), product];
      } else {
        next = [...current, product];
      }
      return { ...state, selections: { ...state.selections, [category]: next } };
    }

    case "SET_FOLLOW_UP":
      return { ...state, followUpAnswers: { ...state.followUpAnswers, [action.category]: action.optionId } };

    case "ADD_UPSELL_CATEGORY": {
      if (state.categories.includes(action.category)) return state;
      const idx = state.categories.indexOf(action.afterCategory);
      const categories = [...state.categories];
      categories.splice(idx + 1, 0, action.category);
      const selections = { ...state.selections };
      if (action.firstProduct) selections[action.category] = [action.firstProduct];
      return { ...state, categories, upsoldCategories: [...state.upsoldCategories, action.category], selections };
    }

    case "REMOVE_UPSELL_CATEGORY": {
      const categories = state.categories.filter((c) => c !== action.category);
      const upsoldCategories = state.upsoldCategories.filter((c) => c !== action.category);
      const selections = { ...state.selections };
      delete selections[action.category];
      const followUpAnswers = { ...state.followUpAnswers };
      delete followUpAnswers[action.category];
      return { ...state, categories, upsoldCategories, selections, followUpAnswers };
    }

    case "SET_CHARACTER":
      return { ...state, character: action.character };

    case "SET_MESSAGE":
      return { ...state, message: action.message };

    case "SET_TIMING":
      return { ...state, timing: action.timing };

    case "SET_CHANNEL":
      return { ...state, channel: action.channel };

    case "SET_CONTACT_FIELD":
      return { ...state, contact: { ...state.contact, [action.field]: action.value } };

    case "TOUCH_CONTACT_FIELD":
      return { ...state, contactTouched: { ...state.contactTouched, [action.field]: true } };

    case "SET_PRIVACY":
      return { ...state, privacyAccepted: action.value };

    case "GO_NEXT": {
      const idx = action.steps.indexOf(state.currentStep);
      const nextIdx = Math.min(idx + 1, action.steps.length - 1);
      return { ...state, currentStep: action.steps[nextIdx] };
    }

    case "GO_BACK": {
      const idx = action.steps.indexOf(state.currentStep);
      const prevIdx = Math.max(idx - 1, 0);
      return { ...state, currentStep: action.steps[prevIdx] };
    }

    case "MARK_SUBMIT_ATTEMPTED":
      return { ...state, submitAttempted: true };

    case "SUBMIT_START":
      return { ...state, submitStatus: "submitting", submitError: null };

    case "SUBMIT_SUCCESS":
      return { ...state, submitStatus: "idle", submitError: null, result: action.result, currentStep: "done" };

    case "SUBMIT_ERROR":
      return { ...state, submitStatus: "error", submitError: action.error };

    case "RESTART":
      return initialFlowState();

    default:
      return state;
  }
}
