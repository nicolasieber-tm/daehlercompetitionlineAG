// Diff eines Excel-Imports gegen den DB-Bestand. Quelle: docs/architektur.md,
// Abschnitt "Excel-Import im Admin", und docs/excel-import.md.
//
// Match-Reihenfolge für Produkte (siehe apply.ts, das dieselbe Reihenfolge
// beim Anwenden verwendet):
//   1. content_hash (unverändert)
//   2. article_no + name, wenn article_no gesetzt ist (geändert)
//   3. name + category (geändert)
//   4. kein Match (neu)
// Bestehende DB-Zeilen, die von keiner Excel-Zeile getroffen werden, gelten
// als entfernt.
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

/**
 * Sucht die erste noch nicht verbrauchte Kandidatin für eine Excel-Zeile,
 * gemäss der Match-Reihenfolge oben, und markiert sie als verbraucht
 * (`used`), damit dieselbe DB-Zeile nicht zweimal gematcht wird.
 */
export function matchProduct(
  parsed: ParsedProduct,
  pools: ProductPools,
  used: Set<string>,
): ProductMatch | null {
  const takeFirstUnused = (candidates: Product[] | undefined): Product | null => {
    if (!candidates) return null;
    for (const c of candidates) {
      if (!used.has(c.id)) return c;
    }
    return null;
  };

  const byHash = takeFirstUnused(pools.byHash.get(parsed.contentHash));
  if (byHash) {
    used.add(byHash.id);
    return { product: byHash, matchedBy: "content_hash" };
  }

  if (parsed.articleNo) {
    const byArticleNo = takeFirstUnused(pools.byArticleNoName.get(`${parsed.articleNo}|${parsed.name}`));
    if (byArticleNo) {
      used.add(byArticleNo.id);
      return { product: byArticleNo, matchedBy: "article_no_name" };
    }
  }

  const byNameCategory = takeFirstUnused(pools.byNameCategory.get(`${parsed.name}|${parsed.category}`));
  if (byNameCategory) {
    used.add(byNameCategory.id);
    return { product: byNameCategory, matchedBy: "name_category" };
  }

  return null;
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

async function loadFitsByProductId(db: Db, productIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (productIds.length === 0) return map;
  for (const ids of chunk(productIds)) {
    const { data, error } = await db
      .from("product_fitment")
      .select("product_id, models(name)")
      .in("product_id", ids);
    if (error) throw new Error(`Fitment laden fehlgeschlagen: ${error.message}`);
    for (const row of data ?? []) {
      const name = (row as { models: { name: string } | null }).models?.name;
      if (!name) continue;
      const arr = map.get(row.product_id);
      if (arr) arr.push(name);
      else map.set(row.product_id, [name]);
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
  const pools = buildProductPools(dbProducts);
  const fitsByProductId = await loadFitsByProductId(
    db,
    dbProducts.map((p) => p.id),
  );

  const used = new Set<string>();
  const added: DiffProductAdded[] = [];
  const changed: DiffProductChanged[] = [];
  let unchangedCount = 0;

  for (const p of parsed.products) {
    const match = matchProduct(p, pools, used);
    if (!match) {
      added.push({
        sourceRow: p.sourceRow,
        name: p.name,
        category: p.category,
        sourceCategory: p.sourceCategory,
        priceTotalChf: p.priceTotalChf,
        priceStatus: p.priceStatus,
      });
      continue;
    }
    if (match.matchedBy === "content_hash") {
      unchangedCount++;
      continue;
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
  }

  const removed: DiffProductRemoved[] = dbProducts
    .filter((p) => !used.has(p.id))
    .map((p) => ({
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
