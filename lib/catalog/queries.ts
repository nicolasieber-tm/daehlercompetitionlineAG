// Katalog-Leseabfragen für den Kundenflow, die Admin-Vorschau und den
// Schnellweg (Posten 3). Quelle: docs/architektur.md, Abschnitte
// "Kundenflow", "Excel-Import im Admin" (Kategorie-Mapping), "Posten 3".
//
// Zugriff über den einzigen, serverseitigen Postgres-Pool (lib/db/client.ts,
// sql).
import { sql } from "@/lib/db/client";
import { bodyStyleFromText, isBodyStyle, sortBodyStyles } from "@/lib/catalog/body-style";
import { DRIVE_ORDER, isDrive } from "@/lib/catalog/drive";
import {
  FLOW_CATEGORIES,
  type BodyStyle,
  type Brand,
  type Drive,
  type FlowCategory,
  type Fuel,
  type Gearbox,
  type PriceStatus,
} from "@/lib/db/rows";

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
  /** true, wenn mindestens ein aktives Produkt, das dieses Modell fittet
   * (oder fits_all), getriebespezifisch ist (products.gearbox != null,
   * siehe lib/catalog/gearbox.ts). Steuert die Getriebefrage im
   * Fahrzeug-Schritt (components/flow/steps/CarStep.tsx), analog
   * seriesPsSuggested für die Serienleistungs-Chips. Rückmeldung erster
   * Klicktest, CLAUDE.md Abschnitt "AUFGABE", Punkt 3. */
  hasGearboxSpecificProducts: boolean;
  /** Karosserieformen, zwischen denen der Kunde im Fahrzeug-Schritt wählen
   * muss (Entscheid 21.09.2026, lib/catalog/body-style.ts): die Vereinigung
   * der body_styles aller Produkte, die dieses Modell fitten, sofern
   * mindestens ZWEI verschiedene Karosserie-Zuordnungen darunter sind
   * (sonst gäbe es nichts auszublenden). Leer = Frage nicht stellen. */
  bodyStyleOptions: BodyStyle[];
  /** Antriebe, zwischen denen der Kunde wählen muss (lib/catalog/drive.ts):
   * nur wenn Produkte für BEIDE Antriebe dieses Modell fitten. Leer =
   * Frage nicht stellen. */
  driveOptions: Drive[];
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
  /** Aus dem Namen abgeleitet (lib/catalog/gearbox.ts), null = getriebeneutral. */
  gearbox: Gearbox | null;
  /** Karosserieformen, für die das Produkt gilt (lib/catalog/body-style.ts), leer = alle. */
  bodyStyles: BodyStyle[];
  /** Antrieb, für den das Produkt gilt (lib/catalog/drive.ts), null = antriebsneutral. */
  drive: Drive | null;
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

/** Eine Zeile aus dem LEFT JOIN model_families/models: eine Familie kann
 * mehrfach auftreten (eine Zeile je Modell), oder genau einmal mit
 * model_id null (Familie ohne aktive Modelle, z.B. die Platzhalter-Familien
 * "auf Anfrage" aus db/seed.sql). LEFT statt INNER JOIN, damit solche
 * Familien nicht verschwinden (Pendant zum bisherigen PostgREST-Verhalten:
 * .eq("models.active", true) filtert die eingebettete Relation, entfernt
 * aber keine Familien ohne Treffer). */
interface FamilyModelRow {
  family_id: string;
  brand: string;
  family_name: string;
  family_slug: string;
  codes: string[];
  has_pricelist: boolean;
  photo_url: string | null;
  short_text: string | null;
  family_sort: number;
  model_id: string | null;
  model_name: string | null;
  model_slug: string | null;
  model_fuel: string | null;
  model_series_ps: number | null;
  model_series_nm: number | null;
  model_series_ps_suggested: number[] | null;
  model_sort: number | null;
}

/**
 * Ergebnis von loadVariantCoverage() (siehe dort): je Modell die Menge der
 * Produkte, die modellspezifische Fragen im Fahrzeug-Schritt auslösen
 * (Getriebe, Karosserieform, Antrieb).
 */
interface VariantCoverage {
  /** family_id -> Produkte mit fits_all (gelten für ALLE Modelle der Familie). */
  fitsAllByFamily: Map<string, VariantProduct[]>;
  /** model_id -> Produkte, die das Modell über product_fitment direkt fitten. */
  byModel: Map<string, VariantProduct[]>;
}

interface VariantProduct {
  gearbox: string | null;
  bodyStyles: BodyStyle[];
  drive: Drive | null;
}

/** Produkte, die ein Modell fitten und mindestens eine Variantenangabe tragen. */
function variantProductsFor(coverage: VariantCoverage, familyId: string, modelId: string): VariantProduct[] {
  return [...(coverage.fitsAllByFamily.get(familyId) ?? []), ...(coverage.byModel.get(modelId) ?? [])];
}

/**
 * Karosserie-Optionen eines Modells (siehe CatalogModel.bodyStyleOptions):
 * Vereinigung der body_styles der fittenden Produkte, aber nur, wenn
 * mindestens zwei VERSCHIEDENE Zuordnungen vorkommen (z.B. {touring} und
 * {limousine}, oder {cabrio} und {dreituerer, fuenftuerer}) - bei nur einer
 * Zuordnung (z.B. M5 G90: alle karosseriespezifischen Produkte gelten für
 * die Limousine, das Modell «M5 Touring» ist ein eigenes Modell) gibt es
 * nichts auszublenden und keine Frage. Nennt der Modellname selbst eine
 * Karosserieform («M3 Touring», «M4 Cabrio», «M5 Touring»), ist sie damit
 * bekannt, keine Frage - und bewusst auch kein Filter: die Excel markiert
 * dort Produkte wie «Performance Fahrwerk ... für M4 Cabrio xDrive»
 * ausdrücklich als passend für «M3 Touring», das Fitment hat Vorrang.
 */
function bodyStyleOptionsFor(products: VariantProduct[], modelName: string): BodyStyle[] {
  if (bodyStyleFromText(modelName) !== null) return [];
  const keys = new Set<string>();
  const union = new Set<BodyStyle>();
  for (const p of products) {
    if (p.bodyStyles.length === 0) continue;
    keys.add([...p.bodyStyles].sort().join("|"));
    for (const s of p.bodyStyles) union.add(s);
  }
  if (keys.size < 2 || union.size < 2) return [];
  return sortBodyStyles(union);
}

/** Antriebs-Optionen eines Modells (siehe CatalogModel.driveOptions): nur wenn Produkte für BEIDE Antriebe fitten. */
function driveOptionsFor(products: VariantProduct[]): Drive[] {
  const found = new Set<Drive>();
  for (const p of products) if (p.drive) found.add(p.drive);
  if (found.size < 2) return [];
  return DRIVE_ORDER.filter((d) => found.has(d));
}

/** Gruppiert die flachen JOIN-Zeilen zu einer CatalogFamily je family_id,
 * in der Reihenfolge des ersten Auftretens. */
function groupFamilyRows(rows: FamilyModelRow[], coverage: VariantCoverage): CatalogFamily[] {
  const byId = new Map<string, CatalogFamily>();
  for (const row of rows) {
    let family = byId.get(row.family_id);
    if (!family) {
      family = {
        id: row.family_id,
        brand: row.brand as Brand,
        name: row.family_name,
        slug: row.family_slug,
        codes: row.codes,
        hasPricelist: row.has_pricelist,
        photoUrl: row.photo_url,
        shortText: row.short_text,
        sort: row.family_sort,
        models: [],
      };
      byId.set(row.family_id, family);
    }
    if (row.model_id) {
      const variantProducts = variantProductsFor(coverage, row.family_id, row.model_id);
      family.models.push({
        id: row.model_id,
        name: row.model_name!,
        slug: row.model_slug!,
        fuel: row.model_fuel as Fuel | null,
        seriesPs: row.model_series_ps,
        seriesNm: row.model_series_nm,
        seriesPsSuggested: row.model_series_ps_suggested ?? [],
        sort: row.model_sort ?? 0,
        hasGearboxSpecificProducts: variantProducts.some((p) => p.gearbox !== null),
        bodyStyleOptions: bodyStyleOptionsFor(variantProducts, row.model_name!),
        driveOptions: driveOptionsFor(variantProducts),
      });
    }
  }
  for (const family of byId.values()) {
    family.models.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "de-CH"));
  }
  return [...byId.values()];
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

/**
 * Lädt für die gegebenen Familien alle aktiven Produkte, die mindestens
 * eine Variantenangabe tragen (gearbox != null, body_styles nicht leer oder
 * drive != null) und ordnet sie den Modellen zu (fits_all -> ganze Familie,
 * sonst über product_fitment) - Grundlage für CatalogModel.
 * hasGearboxSpecificProducts / bodyStyleOptions / driveOptions (siehe dort).
 * Zwei kleine Abfragen statt einer grossen: die Variantenprodukte sind eine
 * kleine Teilmenge (Kraftübertragung, Pedale, Fahrwerk), product_fitment
 * wird nur für deren fits_all=false-Teil geladen.
 */
async function loadVariantCoverage(familyIds: string[]): Promise<VariantCoverage> {
  const empty: VariantCoverage = { fitsAllByFamily: new Map(), byModel: new Map() };
  if (familyIds.length === 0) return empty;

  const products = await sql<
    { id: string; family_id: string; fits_all: boolean; gearbox: string | null; body_styles: string[] | null; drive: string | null }[]
  >`
    select id, family_id, fits_all, gearbox, body_styles, drive
    from products
    where family_id = any(${familyIds}::uuid[])
      and active = true
      and (gearbox is not null or drive is not null or cardinality(body_styles) > 0)
  `;

  const byProductId = new Map<string, VariantProduct>();
  const specificProductIds: string[] = [];
  for (const p of products) {
    const vp: VariantProduct = {
      gearbox: p.gearbox,
      bodyStyles: (p.body_styles ?? []).filter(isBodyStyle),
      drive: isDrive(p.drive) ? p.drive : null,
    };
    if (p.fits_all) {
      const arr = empty.fitsAllByFamily.get(p.family_id);
      if (arr) arr.push(vp);
      else empty.fitsAllByFamily.set(p.family_id, [vp]);
    } else {
      byProductId.set(p.id, vp);
      specificProductIds.push(p.id);
    }
  }

  if (specificProductIds.length > 0) {
    const fitment = await sql<{ product_id: string; model_id: string }[]>`
      select product_id, model_id from product_fitment where product_id = any(${specificProductIds}::uuid[])
    `;
    for (const f of fitment) {
      const vp = byProductId.get(f.product_id);
      if (!vp) continue;
      const arr = empty.byModel.get(f.model_id);
      if (arr) arr.push(vp);
      else empty.byModel.set(f.model_id, [vp]);
    }
  }

  return empty;
}

/** Aktive Familien mit aktiven Modellen, sortiert BMW/MINI/Toyota/Wiesmann, dann sort, dann name. */
export async function getFamilies(): Promise<CatalogFamily[]> {
  const rows = await sql<FamilyModelRow[]>`
    select
      mf.id as family_id, mf.brand, mf.name as family_name, mf.slug as family_slug,
      mf.codes, mf.has_pricelist, mf.photo_url, mf.short_text, mf.sort as family_sort,
      m.id as model_id, m.name as model_name, m.slug as model_slug, m.fuel as model_fuel,
      m.series_ps as model_series_ps, m.series_nm as model_series_nm,
      m.series_ps_suggested as model_series_ps_suggested, m.sort as model_sort
    from model_families mf
    left join models m on m.family_id = mf.id and m.active = true
    where mf.active = true
  `;
  const familyIds = [...new Set(rows.map((r) => r.family_id))];
  const coverage = await loadVariantCoverage(familyIds);
  return sortFamilies(groupFamilyRows(rows, coverage));
}

export async function getFamilyBySlug(slug: string): Promise<CatalogFamily | null> {
  const rows = await sql<FamilyModelRow[]>`
    select
      mf.id as family_id, mf.brand, mf.name as family_name, mf.slug as family_slug,
      mf.codes, mf.has_pricelist, mf.photo_url, mf.short_text, mf.sort as family_sort,
      m.id as model_id, m.name as model_name, m.slug as model_slug, m.fuel as model_fuel,
      m.series_ps as model_series_ps, m.series_nm as model_series_nm,
      m.series_ps_suggested as model_series_ps_suggested, m.sort as model_sort
    from model_families mf
    left join models m on m.family_id = mf.id and m.active = true
    where mf.active = true and mf.slug = ${slug}
  `;
  if (rows.length === 0) return null;
  const coverage = await loadVariantCoverage([rows[0].family_id]);
  return groupFamilyRows(rows, coverage)[0] ?? null;
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
  gearbox: string | null;
  body_styles: string[] | null;
  drive: string | null;
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
    gearbox: p.gearbox as Gearbox | null,
    bodyStyles: (p.body_styles ?? []).filter(isBodyStyle),
    drive: isDrive(p.drive) ? p.drive : null,
    sort: p.sort,
  };
}

const PRODUCT_COLUMNS = [
  "id",
  "name",
  "description",
  "category",
  "source_category",
  "group_label",
  "article_no",
  "price_parts",
  "price_install",
  "price_approval",
  "price_total",
  "price_status",
  "price_note",
  "ps_base",
  "ps_to",
  "nm_to",
  "variant_group",
  "gearbox",
  "body_styles",
  "drive",
  "sort",
] as const;

async function loadFittingProducts(familyId: string, modelId: string): Promise<ProductRow[]> {
  const [fitsAll, fitment] = await Promise.all([
    sql<ProductRow[]>`
      select ${sql(PRODUCT_COLUMNS)} from products
      where family_id = ${familyId} and active = true and fits_all = true
    `,
    sql<ProductRow[]>`
      select ${sql(PRODUCT_COLUMNS.map((c) => `p.${c}`))}
      from product_fitment pf
      join products p on p.id = pf.product_id
      where pf.model_id = ${modelId} and p.active = true and p.family_id = ${familyId}
    `,
  ]);

  const byId = new Map<string, ProductRow>();
  for (const p of fitsAll) byId.set(p.id, p);
  for (const p of fitment) byId.set(p.id, p);
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
export async function getProductsForModel(modelId: string): Promise<ProductsForModelResult | null> {
  const modelRows = await sql<
    { id: string; name: string; slug: string; family_id: string; family_slug: string; family_name: string; family_brand: string }[]
  >`
    select m.id, m.name, m.slug, m.family_id,
           mf.slug as family_slug, mf.name as family_name, mf.brand as family_brand
    from models m
    join model_families mf on mf.id = m.family_id
    where m.id = ${modelId} and m.active = true
  `;
  const model = modelRows[0];
  if (!model) return null;

  const products = await loadFittingProducts(model.family_id, modelId);
  const groups = groupProducts(products);

  const noteRows = await sql<{ category: string | null; text: string }[]>`
    select category, text from pricelist_notes
    where family_id = ${model.family_id}
    order by sort asc
  `;
  const notes: CategoryNote[] = noteRows.map((n) => ({
    sourceCategory: n.category ?? "",
    text: n.text,
  }));

  return {
    model: { id: model.id, name: model.name, slug: model.slug, familyId: model.family_id },
    family: { id: model.family_id, slug: model.family_slug, name: model.family_name, brand: model.family_brand as Brand },
    groups,
    notes,
  };
}

// ---------------------------------------------------------------------------
// getProductsByIds (Preise serverseitig für Anfragen nachladen, nie vom
// Client übernehmen, siehe docs/architektur.md "Anfrage anlegen")
// ---------------------------------------------------------------------------

export async function getProductsByIds(ids: string[]): Promise<CatalogProduct[]> {
  if (ids.length === 0) return [];
  const rows = await sql<ProductRow[]>`
    select ${sql(PRODUCT_COLUMNS)} from products
    where id = any(${ids}::uuid[]) and active = true
  `;
  return rows.map(mapProduct);
}

// ---------------------------------------------------------------------------
// getCatalogCompact (Posten 3: kompakter Katalog fürs Sprachmodell)
// ---------------------------------------------------------------------------

export async function getCatalogCompact(): Promise<CompactFamily[]> {
  const families = await getFamilies();
  const familyIds = families.map((f) => f.id);
  if (familyIds.length === 0) return [];

  // Direkter Postgres-Zugriff statt PostgREST: kein max_rows-Limit mehr
  // (vormals 1000, seitenweises Laden per .range() nötig, siehe Git-
  // Historie), eine einzelne Abfrage genügt.
  const rows = await sql<{ id: string; name: string; category: string; price_total: number | null; family_id: string }[]>`
    select id, name, category, price_total, family_id
    from products
    where family_id = any(${familyIds}::uuid[]) and active = true
    order by sort asc, id asc
  `;

  const productsByFamily = new Map<string, CompactProduct[]>();
  for (const p of rows) {
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
