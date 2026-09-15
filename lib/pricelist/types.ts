// Typen für den Excel-Import. Struktur gemäss docs/excel-import.md,
// Abschnitt "Ausgabe des Parsers".

/** Kategorien im Kundenflow, in der festen Reihenfolge des Flows. */
export type FlowCategory =
  | "motor"
  | "auspuff"
  | "fahrwerk"
  | "raeder"
  | "exterieur"
  | "interieur";

export type FuelType = "benzin" | "diesel" | "elektro" | null;

export type PriceStatus = "priced" | "in_preparation" | "on_request";

export type Brand = "BMW" | "MINI" | "Toyota";

export interface ParsedModel {
  name: string;
  slug: string;
  fuel: FuelType;
  sort: number;
  /** sortierte, eindeutige psBase-Werte aller Leistungsprodukte (variantGroup === 'leistung'), die dieses Modell fitten. */
  seriesPsSuggested: number[];
}

export interface ParsedProduct {
  sourceRow: number;
  sort: number;
  sourceCategory: string;
  category: FlowCategory;
  groupLabel: string | null;
  name: string;
  description: string | null;
  articleNo: string | null;
  rc: string | null;
  pricePartsChf: number | null;
  priceInstallChf: number | null;
  priceApprovalChf: number | null;
  priceTotalChf: number | null;
  priceStatus: PriceStatus;
  priceNote: string | null;
  psBase: number[];
  psTo: number | null;
  nmTo: number | null;
  variantGroup: string | null;
  /** Aus dem Namen abgeleitet (lib/catalog/gearbox.ts gearboxFor()), siehe
   * CLAUDE.md Abschnitt "AUFGABE", Punkt 3. null = getriebeneutral. */
  gearbox: "manual" | "automatic" | null;
  fits: string[];
  fitsAll: boolean;
  contentHash: string;
}

export interface ParsedNote {
  sourceCategory: string;
  text: string;
  sort: number;
}

export interface ParsedFamily {
  name: string;
  slug: string;
  brand: Brand;
  codes: string[];
  pricelistNo: string | null;
  sourceFile: string;
  models: ParsedModel[];
  products: ParsedProduct[];
  notes: ParsedNote[];
  /** z. B. «Zeile 45: Produkt ohne Marker», «Zeile 23: Preis 'ab' nicht numerisch». */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Diff-Typen für lib/pricelist/diff.ts (siehe docs/excel-import.md, Abschnitt
// "Excel-Import im Admin"). apply.ts verwendet dieselbe Match-Reihenfolge
// (content_hash -> article_no+name -> name+category), diff.ts berechnet sie
// nur, statt sie anzuwenden.
// ---------------------------------------------------------------------------

/** Eine einzelne Feldänderung eines gematchten ("changed") Produkts. */
export interface DiffFieldChange {
  field: string;
  old: unknown;
  new: unknown;
}

/** Modellreferenz im Diff (nur nach slug verglichen, siehe Aufgabenstellung). */
export interface DiffModelRef {
  id: string | null; // DB-id, null bei "added" (Modell existiert dort noch nicht)
  slug: string;
  name: string;
}

export interface DiffProductAdded {
  sourceRow: number;
  name: string;
  category: FlowCategory;
  sourceCategory: string;
  priceTotalChf: number | null;
  priceStatus: PriceStatus;
}

export interface DiffProductChanged {
  productId: string; // bestehende DB-Zeile
  sourceRow: number;
  name: string;
  category: FlowCategory;
  matchedBy: "article_no_name" | "name_category";
  changes: DiffFieldChange[];
}

export interface DiffProductRemoved {
  productId: string;
  name: string;
  category: FlowCategory;
  sourceCategory: string;
}

export interface FamilyDiffSummary {
  modelsAdded: number;
  modelsRemoved: number;
  modelsUnchanged: number;
  productsAdded: number;
  productsChanged: number;
  /**
   * Nur Zähler, keine Liste: unveränderte Produkte (content_hash gleich)
   * brauchen im Admin keine Einzelprüfung, und die Liste wäre bei ~2'500
   * Produkten über 42 Familien unnötig gross für das in pricelist_imports.diff
   * gespeicherte jsonb. added/changed/removed bleiben als Listen, weil der
   * Admin genau die prüfen muss.
   */
  productsUnchanged: number;
  productsRemoved: number;
  notes: number;
  warnings: number;
}

export interface FamilyDiff {
  /** Familie laut Excel (nicht laut DB, auch wenn matchedByFallback source_file war). */
  slug: string;
  name: string;
  sourceFile: string;
  status: "new" | "existing";
  /** DB-id der bestehenden Familie, null wenn status "new". */
  familyId: string | null;
  /** true, wenn das Matching nicht über slug, sondern über source_file lief (Fallback). */
  matchedByFallback: boolean;
  models: {
    added: DiffModelRef[];
    removed: DiffModelRef[];
    unchanged: DiffModelRef[];
  };
  products: {
    added: DiffProductAdded[];
    changed: DiffProductChanged[];
    removed: DiffProductRemoved[];
  };
  notes: number;
  warnings: string[];
  summary: FamilyDiffSummary;
}

export interface ImportDiffSummary {
  familiesNew: number;
  familiesExisting: number;
  modelsAdded: number;
  modelsRemoved: number;
  productsAdded: number;
  productsChanged: number;
  productsUnchanged: number;
  productsRemoved: number;
  notes: number;
  warnings: number;
}

export interface ImportDiff {
  families: FamilyDiff[];
  summary: ImportDiffSummary;
}
