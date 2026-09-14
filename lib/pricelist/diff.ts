// Diff eines Excel-Imports gegen den DB-Bestand. Quelle: docs/architektur.md,
// Abschnitt "Excel-Import im Admin", und docs/excel-import.md.
//
// Match-Reihenfolge für Produkte (siehe apply.ts, das dieselbe Reihenfolge
// beim Anwenden verwendet, über matchFamilyProducts()):
//   1. content_hash (unverändert)
//   2. article_no + name, wenn article_no gesetzt ist (geändert)
//   3. name + category (geändert)
//   4. kein Match (neu)
// Bestehende DB-Zeilen, die von keiner Excel-Zeile getroffen werden, gelten
// als entfernt.
//
// Befund #2 (Bericht): das Matching läuft in drei vollständigen Durchgängen
// über ALLE Excel-Zeilen einer Familie (erst content_hash für jede Zeile,
// dann article_no+name für die verbleibenden, dann name+category für die
// verbleibenden) statt zeilenweise sequenziell alle drei Stufen zu prüfen.
// Grund: bei "Schwester"-Produkten mit gleichem Namen/gleicher Artikelnummer,
// aber unterschiedlichem Fitment (z. B. "Sportfahrwerk höhenverstellbar" für
// 20i/30i/18d/20d und separat für M40i/30d/M40d, siehe docs/excel-import.md
// "Sonderfälle", 65 solche Gruppen im Bestand) hätte eine geänderte Zeile per
// article_no+name sonst die erstbeste unverbrauchte DB-Zeile greifen können,
// die eigentlich zur unveränderten Schwesterzeile gehört (deren eigener
// content_hash-Treffer noch nicht geprüft wurde, weil sie in der Excel-Liste
// später kommt) - die Reihenfolge der DB-Zeilen ist ohne ORDER BY nicht
// garantiert. Der volle content_hash-Durchgang zuerst reserviert alle
// unveränderten Zeilen, bevor irgendeine Fallback-Zuordnung startet. Bleiben
// für einen article_no+name- bzw. name+category-Schlüssel dennoch mehrere
// unverbrauchte Kandidaten übrig (z. B. weil auch beide Schwestern geändert
// wurden), wird zusätzlich die Kandidatin mit gleichem source_row bevorzugt,
// sonst die mit identischem Fitment.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Product } from "@/lib/supabase/rows";
import type {
  DiffFieldChange,
  DiffModelRef,
  DiffProductAdded,
  DiffProductChanged,
  DiffProductRemoved,
  FamilyDiff,
  FamilyDiffSummary,
  FlowCategory,
  ImportDiff,
  ImportDiffSummary,
  ParsedFamily,
  ParsedProduct,
} from "./types";

type Db = SupabaseClient<Database>;

const CHUNK_SIZE = 500;

function chunk<T>(items: T[], size = CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Matching (von apply.ts wiederverwendet)
// ---------------------------------------------------------------------------

interface ProductPools {
  byHash: Map<string, Product[]>;
  byArticleNoName: Map<string, Product[]>;
  byNameCategory: Map<string, Product[]>;
}

function pushInto<K>(map: Map<K, Product[]>, key: K, product: Product) {
  const arr = map.get(key);
  if (arr) arr.push(product);
  else map.set(key, [product]);
}

/** Baut die drei Lookup-Indizes über eine Menge aktiver DB-Produkte einer Familie. */
export function buildProductPools(products: Product[]): ProductPools {
  const byHash = new Map<string, Product[]>();
  const byArticleNoName = new Map<string, Product[]>();
  const byNameCategory = new Map<string, Product[]>();
  for (const p of products) {
    if (p.content_hash) pushInto(byHash, p.content_hash, p);
    if (p.article_no) pushInto(byArticleNoName, `${p.article_no}|${p.name}`, p);
    pushInto(byNameCategory, `${p.name}|${p.category}`, p);
  }
  return { byHash, byArticleNoName, byNameCategory };
}

export type ProductMatchedBy = "content_hash" | "article_no_name" | "name_category";

export interface ProductMatch {
  product: Product;
  matchedBy: ProductMatchedBy;
}

export interface FamilyProductMatchResult {
  /** Ein Eintrag je Excel-Zeile, gleiche Reihenfolge/Index wie `parsedProducts`. */
  matches: (ProductMatch | null)[];
  /** Bestehende aktive DB-Zeilen, die von keiner Excel-Zeile getroffen wurden. */
  removedProducts: Product[];
}

/**
 * Wählt unter mehreren noch unverbrauchten Kandidatinnen für denselben
 * Schlüssel (article_no+name bzw. name+category) diejenige, die am
 * wahrscheinlichsten dieselbe reale Zeile ist: zuerst identischer
 * source_row (bleibt über Re-Importe stabil, siehe docs/excel-import.md),
 * sonst identisches Fitment (Menge der Modellnamen). Bei nur einer
 * Kandidatin oder ohne eindeutigen Treffer: die erste (stabile Reihenfolge
 * innerhalb des Aufrufs, auch wenn die DB-Reihenfolge selbst unbestimmt ist).
 */
function pickBestCandidate(
  candidates: Product[] | undefined,
  used: Set<string>,
  parsed: ParsedProduct,
  oldFitsByProductId: Map<string, string[]>,
): Product | null {
  if (!candidates) return null;
  const unused = candidates.filter((c) => !used.has(c.id));
  if (unused.length === 0) return null;
  if (unused.length === 1) return unused[0];

  const bySourceRow = unused.find((c) => c.source_row === parsed.sourceRow);
  if (bySourceRow) return bySourceRow;

  const parsedFits = fitsValue(parsed.fitsAll, parsed.fits);
  const byFits = unused.find((c) => {
    const oldFits = fitsValue(c.fits_all, oldFitsByProductId.get(c.id) ?? []);
    return JSON.stringify(oldFits) === JSON.stringify(parsedFits);
  });
  if (byFits) return byFits;

  return unused[0];
}

/**
 * Ordnet alle Excel-Zeilen einer Familie den bestehenden aktiven DB-Produkten
 * zu, in drei vollständigen Durchgängen über die ganze Liste (siehe
 * Kommentar am Dateianfang, Befund #2): erst content_hash, dann
 * article_no+name, dann name+category. `oldFitsByProductId` wird nur für die
 * Kandidaten-Auswahl bei Mehrdeutigkeit gebraucht (siehe pickBestCandidate)
 * und stammt aus loadFitsByProductId() (DB-Zustand VOR diesem Import).
 */
export function matchFamilyProducts(
  parsedProducts: ParsedProduct[],
  dbProducts: Product[],
  oldFitsByProductId: Map<string, string[]>,
): FamilyProductMatchResult {
  const pools = buildProductPools(dbProducts);
  const used = new Set<string>();
  const matches: (ProductMatch | null)[] = new Array(parsedProducts.length).fill(null);

  // Durchgang 1: content_hash (reserviert alle unveränderten Zeilen zuerst).
  parsedProducts.forEach((p, i) => {
    const candidate = pickBestCandidate(pools.byHash.get(p.contentHash), used, p, oldFitsByProductId);
    if (candidate) {
      used.add(candidate.id);
      matches[i] = { product: candidate, matchedBy: "content_hash" };
    }
  });

  // Durchgang 2: article_no + name, nur für noch offene Zeilen.
  parsedProducts.forEach((p, i) => {
    if (matches[i] || !p.articleNo) return;
    const candidate = pickBestCandidate(
      pools.byArticleNoName.get(`${p.articleNo}|${p.name}`),
      used,
      p,
      oldFitsByProductId,
    );
    if (candidate) {
      used.add(candidate.id);
      matches[i] = { product: candidate, matchedBy: "article_no_name" };
    }
  });

  // Durchgang 3: name + category, nur für noch offene Zeilen.
  parsedProducts.forEach((p, i) => {
    if (matches[i]) return;
    const candidate = pickBestCandidate(
      pools.byNameCategory.get(`${p.name}|${p.category}`),
      used,
      p,
      oldFitsByProductId,
    );
    if (candidate) {
      used.add(candidate.id);
      matches[i] = { product: candidate, matchedBy: "name_category" };
    }
  });

  const removedProducts = dbProducts.filter((p) => !used.has(p.id));
  return { matches, removedProducts };
}

// ---------------------------------------------------------------------------
// Feldvergleich für "changed"
// ---------------------------------------------------------------------------

function fitsValue(fitsAll: boolean, fits: string[]): string | string[] {
  return fitsAll ? "alle" : [...fits].sort((a, b) => a.localeCompare(b, "de-CH"));
}

function isEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  // numeric(...) kommt aus Postgres als string zurück (z. B. "4180"),
  // die Excel-Werte sind number|null. Für den Vergleich beides als Zahl
  // interpretieren, sonst meldet der Diff jeden Preis fälschlich als geändert.
  if (typeof a === "number" || typeof b === "number") {
    const na = a === null || a === undefined ? null : Number(a);
    const nb = b === null || b === undefined ? null : Number(b);
    return na === nb;
  }
  return a === b;
}

function buildFieldChanges(
  dbProduct: Product,
  parsed: ParsedProduct,
  oldFits: string[],
): DiffFieldChange[] {
  const pairs: { field: string; oldVal: unknown; newVal: unknown }[] = [
    { field: "category", oldVal: dbProduct.category, newVal: parsed.category },
    { field: "source_category", oldVal: dbProduct.source_category, newVal: parsed.sourceCategory },
    { field: "group_label", oldVal: dbProduct.group_label, newVal: parsed.groupLabel },
    { field: "description", oldVal: dbProduct.description, newVal: parsed.description },
    { field: "article_no", oldVal: dbProduct.article_no, newVal: parsed.articleNo },
    { field: "rc", oldVal: dbProduct.rc, newVal: parsed.rc },
    { field: "price_parts", oldVal: dbProduct.price_parts, newVal: parsed.pricePartsChf },
    { field: "price_install", oldVal: dbProduct.price_install, newVal: parsed.priceInstallChf },
    { field: "price_approval", oldVal: dbProduct.price_approval, newVal: parsed.priceApprovalChf },
    { field: "price_total", oldVal: dbProduct.price_total, newVal: parsed.priceTotalChf },
    { field: "price_status", oldVal: dbProduct.price_status, newVal: parsed.priceStatus },
    { field: "price_note", oldVal: dbProduct.price_note, newVal: parsed.priceNote },
    { field: "ps_base", oldVal: dbProduct.ps_base, newVal: parsed.psBase },
    { field: "ps_to", oldVal: dbProduct.ps_to, newVal: parsed.psTo },
    { field: "nm_to", oldVal: dbProduct.nm_to, newVal: parsed.nmTo },
    { field: "variant_group", oldVal: dbProduct.variant_group, newVal: parsed.variantGroup },
    {
      field: "fits",
      oldVal: fitsValue(dbProduct.fits_all, oldFits),
      newVal: fitsValue(parsed.fitsAll, parsed.fits),
    },
  ];
  return pairs
    .filter((p) => !isEqual(p.oldVal, p.newVal))
    .map((p) => ({ field: p.field, old: p.oldVal, new: p.newVal }));
}

// ---------------------------------------------------------------------------
// Fitment-Namen bestehender Produkte laden (für den "fits"-Feldvergleich)
// ---------------------------------------------------------------------------

// Prüfrunde Import-Modul, Befund "loadFitsByProductId-Pagination" (nicht zu
// verwechseln mit dem Befund #2 oben zur Match-Reihenfolge, andere
// Prüfrunde, andere Nummerierung): PostgREST kappt jede Antwort still bei
// max_rows (supabase/config.toml, aktuell 1000), auch innerhalb eines
// Chunks - product_fitment hat im Schnitt 4-5 Zeilen je Produkt, eine
// Familie mit >= 224 Produkten in einem Chunk reisst die Grenze (Beleg:
// Familie "3er F30, F31, F34, F35" mit 100 Produkten hat bereits 1008
// Fitment-Zeilen). Deshalb pro Chunk zusätzlich per .range() seitenweise
// laden, bis eine Seite weniger als PAGE_SIZE Zeilen liefert. Die
// Sortierung nach (product_id, model_id) - das ist der Primärschlüssel von
// product_fitment, siehe supabase/migrations/20260911000000_init.sql -
// macht die Seitenreihenfolge deterministisch, sonst wäre .range() ohne
// ORDER BY nicht verlässlich.
const FITMENT_PAGE_SIZE = 1000;

export async function loadFitsByProductId(db: Db, productIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (productIds.length === 0) return map;
  for (const ids of chunk(productIds)) {
    let from = 0;
    for (;;) {
      const { data, error } = await db
        .from("product_fitment")
        .select("product_id, model_id, models(name)")
        .in("product_id", ids)
        .order("product_id", { ascending: true })
        .order("model_id", { ascending: true })
        .range(from, from + FITMENT_PAGE_SIZE - 1);
      if (error) throw new Error(`Fitment laden fehlgeschlagen: ${error.message}`);
      const rows = data ?? [];
      for (const row of rows) {
        const name = (row as { models: { name: string } | null }).models?.name;
        if (!name) continue;
        const arr = map.get(row.product_id);
        if (arr) arr.push(name);
        else map.set(row.product_id, [name]);
      }
      if (rows.length < FITMENT_PAGE_SIZE) break;
      from += FITMENT_PAGE_SIZE;
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Diff je Familie
// ---------------------------------------------------------------------------

async function buildFamilyDiff(parsed: ParsedFamily, db: Db): Promise<FamilyDiff> {
  const bySlug = await db
    .from("model_families")
    .select("id, slug, source_file")
    .eq("slug", parsed.slug)
    .maybeSingle();
  if (bySlug.error) throw new Error(`Familie laden (slug) fehlgeschlagen: ${bySlug.error.message}`);

  let dbFamily = bySlug.data;
  let matchedByFallback = false;
  if (!dbFamily && parsed.sourceFile) {
    const bySource = await db
      .from("model_families")
      .select("id, slug, source_file")
      .eq("source_file", parsed.sourceFile)
      .maybeSingle();
    if (bySource.error) {
      throw new Error(`Familie laden (source_file) fehlgeschlagen: ${bySource.error.message}`);
    }
    dbFamily = bySource.data;
    matchedByFallback = dbFamily !== null;
  }

  const warnings = parsed.warnings;
  const notes = parsed.notes.length;

  if (!dbFamily) {
    const added: DiffModelRef[] = parsed.models.map((m) => ({ id: null, slug: m.slug, name: m.name }));
    const addedProducts: DiffProductAdded[] = parsed.products.map((p) => ({
      sourceRow: p.sourceRow,
      name: p.name,
      category: p.category,
      sourceCategory: p.sourceCategory,
      priceTotalChf: p.priceTotalChf,
      priceStatus: p.priceStatus,
    }));
    const summary: FamilyDiffSummary = {
      modelsAdded: added.length,
      modelsRemoved: 0,
      modelsUnchanged: 0,
      productsAdded: addedProducts.length,
      productsChanged: 0,
      productsUnchanged: 0,
      productsRemoved: 0,
      notes,
      warnings: warnings.length,
    };
    return {
      slug: parsed.slug,
      name: parsed.name,
      sourceFile: parsed.sourceFile,
      status: "new",
      familyId: null,
      matchedByFallback: false,
      models: { added, removed: [], unchanged: [] },
      products: { added: addedProducts, changed: [], removed: [] },
      notes,
      warnings,
      summary,
    };
  }

  // --- Modelle ---------------------------------------------------------
  const dbModelsRes = await db
    .from("models")
    .select("id, slug, name")
    .eq("family_id", dbFamily.id)
    .eq("active", true);
  if (dbModelsRes.error) throw new Error(`Modelle laden fehlgeschlagen: ${dbModelsRes.error.message}`);
  const dbModels = dbModelsRes.data ?? [];
  const dbModelBySlug = new Map(dbModels.map((m) => [m.slug, m]));
  const parsedSlugs = new Set(parsed.models.map((m) => m.slug));

  const modelsAdded: DiffModelRef[] = [];
  const modelsUnchanged: DiffModelRef[] = [];
  for (const m of parsed.models) {
    const existing = dbModelBySlug.get(m.slug);
    if (existing) modelsUnchanged.push({ id: existing.id, slug: m.slug, name: m.name });
    else modelsAdded.push({ id: null, slug: m.slug, name: m.name });
  }
  const modelsRemoved: DiffModelRef[] = dbModels
    .filter((m) => !parsedSlugs.has(m.slug))
    .map((m) => ({ id: m.id, slug: m.slug, name: m.name }));

  // --- Produkte ----------------------------------------------------------
  const dbProductsRes = await db
    .from("products")
    .select("*")
    .eq("family_id", dbFamily.id)
    .eq("active", true);
  if (dbProductsRes.error) throw new Error(`Produkte laden fehlgeschlagen: ${dbProductsRes.error.message}`);
  const dbProducts = dbProductsRes.data ?? [];
  // Fits VOR dem Matching laden: pickBestCandidate() braucht sie schon dort
  // zur Auswahl bei Mehrdeutigkeit (siehe matchFamilyProducts, Befund #2),
  // buildFieldChanges() danach für den "fits"-Feldvergleich - eine Abfrage
  // für beides.
  const fitsByProductId = await loadFitsByProductId(
    db,
    dbProducts.map((p) => p.id),
  );

  const { matches, removedProducts } = matchFamilyProducts(parsed.products, dbProducts, fitsByProductId);

  const added: DiffProductAdded[] = [];
  const changed: DiffProductChanged[] = [];
  let unchangedCount = 0;

  parsed.products.forEach((p, i) => {
    const match = matches[i];
    if (!match) {
      added.push({
        sourceRow: p.sourceRow,
        name: p.name,
        category: p.category,
        sourceCategory: p.sourceCategory,
        priceTotalChf: p.priceTotalChf,
        priceStatus: p.priceStatus,
      });
      return;
    }
    if (match.matchedBy === "content_hash") {
      unchangedCount++;
      return;
    }
    const oldFits = fitsByProductId.get(match.product.id) ?? [];
    changed.push({
      productId: match.product.id,
      sourceRow: p.sourceRow,
      name: p.name,
      category: p.category,
      matchedBy: match.matchedBy,
      changes: buildFieldChanges(match.product, p, oldFits),
    });
  });

  const removed: DiffProductRemoved[] = removedProducts.map((p) => ({
    productId: p.id,
    name: p.name,
    category: p.category as FlowCategory,
    sourceCategory: p.source_category ?? "",
  }));

  const summary: FamilyDiffSummary = {
    modelsAdded: modelsAdded.length,
    modelsRemoved: modelsRemoved.length,
    modelsUnchanged: modelsUnchanged.length,
    productsAdded: added.length,
    productsChanged: changed.length,
    productsUnchanged: unchangedCount,
    productsRemoved: removed.length,
    notes,
    warnings: warnings.length,
  };

  return {
    slug: parsed.slug,
    name: parsed.name,
    sourceFile: parsed.sourceFile,
    status: "existing",
    familyId: dbFamily.id,
    matchedByFallback,
    models: { added: modelsAdded, removed: modelsRemoved, unchanged: modelsUnchanged },
    products: { added, changed, removed },
    notes,
    warnings,
    summary,
  };
}

export async function buildDiff(parsed: ParsedFamily[], db: Db): Promise<ImportDiff> {
  const families: FamilyDiff[] = [];
  for (const family of parsed) {
    families.push(await buildFamilyDiff(family, db));
  }

  const summary: ImportDiffSummary = families.reduce<ImportDiffSummary>(
    (acc, f) => {
      acc.familiesNew += f.status === "new" ? 1 : 0;
      acc.familiesExisting += f.status === "existing" ? 1 : 0;
      acc.modelsAdded += f.summary.modelsAdded;
      acc.modelsRemoved += f.summary.modelsRemoved;
      acc.productsAdded += f.summary.productsAdded;
      acc.productsChanged += f.summary.productsChanged;
      acc.productsUnchanged += f.summary.productsUnchanged;
      acc.productsRemoved += f.summary.productsRemoved;
      acc.notes += f.summary.notes;
      acc.warnings += f.summary.warnings;
      return acc;
    },
    {
      familiesNew: 0,
      familiesExisting: 0,
      modelsAdded: 0,
      modelsRemoved: 0,
      productsAdded: 0,
      productsChanged: 0,
      productsUnchanged: 0,
      productsRemoved: 0,
      notes: 0,
      warnings: 0,
    },
  );

  return { families, summary };
}
