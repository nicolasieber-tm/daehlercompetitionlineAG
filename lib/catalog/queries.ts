// Katalog-Leseabfragen für den Kundenflow, die Admin-Vorschau und den
// Schnellweg (Posten 3). Quelle: docs/architektur.md, Abschnitte
// "Kundenflow", "Excel-Import im Admin" (Kategorie-Mapping), "Posten 3".
//
// Alle Funktionen nehmen optional einen bereits erzeugten Supabase-Client
// entgegen ("oder einen übergebenen Client", siehe Aufgabenstellung), damit
// sie sowohl serverseitig im Next-Kontext (ohne Argument: eigener
// Server-Client mit RLS über die Request-Cookies) als auch aus tsx-Skripten
// ohne Next (Argument zwingend, da lib/supabase/server.ts next/headers
// braucht) funktionieren. Caching per unstable_cache passiert bewusst NICHT
// hier, sondern an den Aufrufstellen mit sicherem Next-Kontext (den beiden
// Route Handlern app/api/catalog/*), siehe Aufgabenstellung "Cache-Wrapper
// optional" - so bleibt dieses Modul ohne next/cache-Abhängigkeit direkt aus
// scripts/ verwendbar.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { FLOW_CATEGORIES, type Brand, type FlowCategory, type Fuel, type PriceStatus } from "@/lib/supabase/rows";

type Db = SupabaseClient<Database>;

async function resolveClient(db?: Db): Promise<Db> {
  return db ?? (await createServerClient());
}

// ---------------------------------------------------------------------------
// Typen (Flow-Sicht, camelCase statt DB-Spaltennamen)
// ---------------------------------------------------------------------------

export interface CatalogModel {
  id: string;
  name: string;
  slug: string;
  fuel: Fuel | null;
  seriesPs: number | null;
  seriesNm: number | null;
  seriesPsSuggested: number[];
  sort: number;
}

export interface CatalogFamily {
  id: string;
  brand: Brand;
  name: string;
  slug: string;
  codes: string[];
  hasPricelist: boolean;
  photoUrl: string | null;
  shortText: string | null;
  sort: number;
  models: CatalogModel[];
}

export interface CatalogProduct {
  id: string;
  name: string;
  description: string | null;
  category: FlowCategory;
  sourceCategory: string;
  groupLabel: string | null;
  articleNo: string | null;
  priceParts: number | null;
  priceInstall: number | null;
  priceApproval: number | null;
  priceTotal: number | null;
  priceStatus: PriceStatus;
  priceNote: string | null;
  psBase: number[];
  psTo: number | null;
  nmTo: number | null;
  variantGroup: string | null;
  sort: number;
}

export interface ProductGroup {
  category: FlowCategory;
  sourceCategory: string;
  groupLabel: string | null;
  products: CatalogProduct[];
}

export interface CategoryNote {
  sourceCategory: string;
  text: string;
}

export interface ProductsForModelResult {
  model: { id: string; name: string; slug: string; familyId: string };
  family: { id: string; slug: string; name: string; brand: Brand };
  groups: ProductGroup[];
  notes: CategoryNote[];
}

export interface CompactModel {
  slug: string;
  name: string;
}

export interface CompactProduct {
  id: string;
  name: string;
  category: FlowCategory;
  priceTotal: number | null;
}

export interface CompactFamily {
  slug: string;
  name: string;
  brand: Brand;
  models: CompactModel[];
  products: CompactProduct[];
}

// ---------------------------------------------------------------------------
// Sortierung: Brand-Reihenfolge (getFamilies), Excel-Kategorie-Reihenfolge
// innerhalb einer Flow-Kategorie (getProductsForModel), siehe
// docs/excel-import.md "Kategorie-Mapping (Excel -> Flow)".
// ---------------------------------------------------------------------------

const BRAND_ORDER: Record<string, number> = { BMW: 0, MINI: 1, Toyota: 2, Wiesmann: 3 };

/** Motor vor Kraftübertragung, Auspuff vor Active-Sound, Fahrwerk vor Bremse. */
const SOURCE_CATEGORY_ORDER: Record<string, number> = {
  Motor: 0,
  Kraftübertragung: 1,
  Auspuff: 0,
  "Active-Sound System": 1,
  Fahrwerk: 0,
  Bremse: 1,
  Räder: 0,
  Karosserie: 0,
  "Cockpit/Interieur": 0,
};

function flowCategoryOrder(category: string): number {
  const idx = FLOW_CATEGORIES.indexOf(category as FlowCategory);
  return idx < 0 ? FLOW_CATEGORIES.length : idx;
}

function sourceCategoryOrder(sourceCategory: string | null): number {
  return SOURCE_CATEGORY_ORDER[sourceCategory ?? ""] ?? 0;
}

// ---------------------------------------------------------------------------
// getFamilies / getFamilyBySlug
// ---------------------------------------------------------------------------

const FAMILY_SELECT =
  "id, brand, name, slug, codes, has_pricelist, photo_url, short_text, sort, " +
  "models(id, name, slug, fuel, series_ps, series_nm, series_ps_suggested, sort, active)";

interface FamilyRow {
  id: string;
  brand: string;
  name: string;
  slug: string;
  codes: string[];
  has_pricelist: boolean;
  photo_url: string | null;
  short_text: string | null;
  sort: number;
  models: {
    id: string;
    name: string;
    slug: string;
    fuel: string | null;
    series_ps: number | null;
    series_nm: number | null;
    series_ps_suggested: number[];
    sort: number;
    active: boolean;
  }[];
}

function mapFamily(row: FamilyRow): CatalogFamily {
  const models = [...row.models]
    .filter((m) => m.active)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "de-CH"))
    .map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      fuel: m.fuel as Fuel | null,
      seriesPs: m.series_ps,
      seriesNm: m.series_nm,
      seriesPsSuggested: m.series_ps_suggested,
      sort: m.sort,
    }));
  return {
    id: row.id,
    brand: row.brand as Brand,
    name: row.name,
    slug: row.slug,
    codes: row.codes,
    hasPricelist: row.has_pricelist,
    photoUrl: row.photo_url,
    shortText: row.short_text,
    sort: row.sort,
    models,
  };
}

function sortFamilies(families: CatalogFamily[]): CatalogFamily[] {
  return [...families].sort((a, b) => {
    const ba = BRAND_ORDER[a.brand] ?? 99;
    const bb = BRAND_ORDER[b.brand] ?? 99;
    if (ba !== bb) return ba - bb;
    if (a.sort !== b.sort) return a.sort - b.sort;
    return a.name.localeCompare(b.name, "de-CH");
  });
}

/** Aktive Familien mit aktiven Modellen, sortiert BMW/MINI/Toyota/Wiesmann, dann sort, dann name. */
export async function getFamilies(db?: Db): Promise<CatalogFamily[]> {
  const client = await resolveClient(db);
  const { data, error } = await client
    .from("model_families")
    .select(FAMILY_SELECT)
    .eq("active", true)
    .eq("models.active", true);
  if (error) throw new Error(`getFamilies fehlgeschlagen: ${error.message}`);
  return sortFamilies((data ?? []).map((row) => mapFamily(row as unknown as FamilyRow)));
}

export async function getFamilyBySlug(slug: string, db?: Db): Promise<CatalogFamily | null> {
  const client = await resolveClient(db);
  const { data, error } = await client
    .from("model_families")
    .select(FAMILY_SELECT)
    .eq("slug", slug)
    .eq("active", true)
    .eq("models.active", true)
    .maybeSingle();
  if (error) throw new Error(`getFamilyBySlug fehlgeschlagen: ${error.message}`);
  return data ? mapFamily(data as unknown as FamilyRow) : null;
}

// ---------------------------------------------------------------------------
// getProductsForModel
// ---------------------------------------------------------------------------

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  source_category: string | null;
  group_label: string | null;
  article_no: string | null;
  price_parts: number | null;
  price_install: number | null;
  price_approval: number | null;
  price_total: number | null;
  price_status: string;
  price_note: string | null;
  ps_base: number[];
  ps_to: number | null;
  nm_to: number | null;
  variant_group: string | null;
  sort: number;
}

function mapProduct(p: ProductRow): CatalogProduct {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category as FlowCategory,
    sourceCategory: p.source_category ?? "",
    groupLabel: p.group_label,
    articleNo: p.article_no,
    priceParts: p.price_parts,
    priceInstall: p.price_install,
    priceApproval: p.price_approval,
    priceTotal: p.price_total,
    priceStatus: p.price_status as PriceStatus,
    priceNote: p.price_note,
    psBase: p.ps_base,
    psTo: p.ps_to,
    nmTo: p.nm_to,
    variantGroup: p.variant_group,
    sort: p.sort,
  };
}

const PRODUCT_COLUMNS =
  "id, name, description, category, source_category, group_label, article_no, " +
  "price_parts, price_install, price_approval, price_total, price_status, price_note, " +
  "ps_base, ps_to, nm_to, variant_group, sort";

async function loadFittingProducts(familyId: string, modelId: string, client: Db): Promise<ProductRow[]> {
  const [fitsAllRes, fitmentRes] = await Promise.all([
    client
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("family_id", familyId)
      .eq("active", true)
      .eq("fits_all", true),
    client
      .from("product_fitment")
      .select(`products!inner(${PRODUCT_COLUMNS})`)
      .eq("model_id", modelId)
      .eq("products.active", true)
      .eq("products.family_id", familyId),
  ]);
  if (fitsAllRes.error) throw new Error(`Produkte (fits_all) laden fehlgeschlagen: ${fitsAllRes.error.message}`);
  if (fitmentRes.error) throw new Error(`Produkte (Fitment) laden fehlgeschlagen: ${fitmentRes.error.message}`);

  const byId = new Map<string, ProductRow>();
  for (const p of (fitsAllRes.data ?? []) as unknown as ProductRow[]) byId.set(p.id, p);
  for (const row of (fitmentRes.data ?? []) as unknown as { products: ProductRow }[]) {
    byId.set(row.products.id, row.products);
  }
  return [...byId.values()];
}

function groupProducts(products: ProductRow[]): ProductGroup[] {
  const sorted = [...products].sort((a, b) => {
    const ca = flowCategoryOrder(a.category);
    const cb = flowCategoryOrder(b.category);
    if (ca !== cb) return ca - cb;
    const sa = sourceCategoryOrder(a.source_category);
    const sb = sourceCategoryOrder(b.source_category);
    if (sa !== sb) return sa - sb;
    return a.sort - b.sort;
  });

  const groups: ProductGroup[] = [];
  let lastKey: string | null = null;
  for (const p of sorted) {
    const key = `${p.category}|${p.source_category ?? ""}|${p.group_label ?? ""}`;
    if (key !== lastKey) {
      groups.push({
        category: p.category as FlowCategory,
        sourceCategory: p.source_category ?? "",
        groupLabel: p.group_label,
        products: [],
      });
      lastKey = key;
    }
    groups[groups.length - 1].products.push(mapProduct(p));
  }
  return groups;
}

/**
 * Aktive Produkte, die ein Modell fitten (product_fitment) oder fits_all
 * haben, gruppiert nach (Flow-Kategorie, Excel-Kategorie, group_label) in
 * Flow-Reihenfolge, plus die Hinweise (pricelist_notes) je Excel-Kategorie
 * der Familie. null, wenn das Modell nicht existiert oder inaktiv ist.
 */
export async function getProductsForModel(modelId: string, db?: Db): Promise<ProductsForModelResult | null> {
  const client = await resolveClient(db);

  const { data: model, error: modelError } = await client
    .from("models")
    .select("id, name, slug, family_id, model_families(id, slug, name, brand)")
    .eq("id", modelId)
    .eq("active", true)
    .maybeSingle();
  if (modelError) throw new Error(`Modell laden fehlgeschlagen: ${modelError.message}`);
  if (!model) return null;

  const family = model.model_families as unknown as {
    id: string;
    slug: string;
    name: string;
    brand: string;
  } | null;
  if (!family) return null;

  const products = await loadFittingProducts(family.id, modelId, client);
  const groups = groupProducts(products);

  const { data: noteRows, error: notesError } = await client
    .from("pricelist_notes")
    .select("category, text")
    .eq("family_id", family.id)
    .order("sort", { ascending: true });
  if (notesError) throw new Error(`pricelist_notes laden fehlgeschlagen: ${notesError.message}`);
  const notes: CategoryNote[] = (noteRows ?? []).map((n) => ({
    sourceCategory: n.category ?? "",
    text: n.text,
  }));

  return {
    model: { id: model.id, name: model.name, slug: model.slug, familyId: family.id },
    family: { id: family.id, slug: family.slug, name: family.name, brand: family.brand as Brand },
    groups,
    notes,
  };
}

// ---------------------------------------------------------------------------
// getProductsByIds (Preise serverseitig für Anfragen nachladen, nie vom
// Client übernehmen, siehe docs/architektur.md "Anfrage anlegen")
// ---------------------------------------------------------------------------

export async function getProductsByIds(ids: string[], db?: Db): Promise<CatalogProduct[]> {
  if (ids.length === 0) return [];
  const client = await resolveClient(db);
  const { data, error } = await client
    .from("products")
    .select(PRODUCT_COLUMNS)
    .in("id", ids)
    .eq("active", true);
  if (error) throw new Error(`getProductsByIds fehlgeschlagen: ${error.message}`);
  return ((data ?? []) as unknown as ProductRow[]).map(mapProduct);
}

// ---------------------------------------------------------------------------
// getCatalogCompact (Posten 3: kompakter Katalog fürs Sprachmodell)
// ---------------------------------------------------------------------------

// PostgREST kappt jede Antwort still bei max_rows (supabase/config.toml,
// aktuell 1000). Bei > 1000 aktiven Produkten insgesamt (Befund #1, Bericht:
// 2685 aktive Produkte, ein einzelnes select() ohne range() liefert nur die
// ersten 1000 ohne Fehler) muss seitenweise geladen werden, bis eine Seite
// weniger als PAGE_SIZE Zeilen liefert. Sortierung nach (sort, id) macht die
// Seitenreihenfolge deterministisch, sonst wäre .range() ohne eindeutigen
// ORDER BY nicht verlässlich.
const PRODUCT_PAGE_SIZE = 1000;

async function loadAllActiveProducts(
  client: Db,
  familyIds: string[],
): Promise<{ id: string; name: string; category: string; price_total: number | null; family_id: string }[]> {
  const out: { id: string; name: string; category: string; price_total: number | null; family_id: string }[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from("products")
      .select("id, name, category, price_total, family_id")
      .in("family_id", familyIds)
      .eq("active", true)
      .order("sort", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PRODUCT_PAGE_SIZE - 1);
    if (error) throw new Error(`getCatalogCompact fehlgeschlagen: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PRODUCT_PAGE_SIZE) break;
    from += PRODUCT_PAGE_SIZE;
  }
  return out;
}

export async function getCatalogCompact(db?: Db): Promise<CompactFamily[]> {
  const client = await resolveClient(db);
  const families = await getFamilies(client);
  const familyIds = families.map((f) => f.id);
  if (familyIds.length === 0) return [];

  const data = await loadAllActiveProducts(client, familyIds);

  const productsByFamily = new Map<string, CompactProduct[]>();
  for (const p of data) {
    const arr = productsByFamily.get(p.family_id);
    const item: CompactProduct = { id: p.id, name: p.name, category: p.category as FlowCategory, priceTotal: p.price_total };
    if (arr) arr.push(item);
    else productsByFamily.set(p.family_id, [item]);
  }

  return families.map((f) => ({
    slug: f.slug,
    name: f.name,
    brand: f.brand,
    models: f.models.map((m) => ({ slug: m.slug, name: m.name })),
    products: productsByFamily.get(f.id) ?? [],
  }));
}
