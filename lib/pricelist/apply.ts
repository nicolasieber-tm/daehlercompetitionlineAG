// Übernahme eines Excel-Imports in die DB. Quelle: docs/architektur.md,
// Abschnitt "Excel-Import im Admin", docs/excel-import.md.
//
// Reihenfolge je Familie: model_families upsert -> models upsert -> products
// (Match wie in diff.ts: content_hash -> article_no+name -> name+category) ->
// product_fitment neu setzen -> pricelist_notes ersetzen. Admin-Felder
// (photo_url, short_text, sort auf model_families; series_ps, series_nm,
// photo_url auf models) werden nie in ein Update/Upsert-Payload aufgenommen,
// dadurch bleiben sie unangetastet (Postgres "on conflict do update set"
// rührt nur explizit genannte Spalten an).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Product, ProductInsert } from "@/lib/supabase/rows";
import { SEED_PHOTOS } from "@/lib/catalog/seed-photos";
import { loadFitsByProductId, matchFamilyProducts } from "./diff";
import type { ParsedFamily } from "./types";

type Db = SupabaseClient<Database>;

// Prüfung Phase B, Punkt 8: auf 150 begrenzt (vorher 500), siehe
// lib/pricelist/diff.ts (gleicher Grund, dieselbe Grenze).
const CHUNK_SIZE = 150;

function chunk<T>(items: T[], size = CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface FamilyApplyResult {
  slug: string;
  name: string;
  sourceFile: string;
  familyId: string;
  familyCreated: boolean;
  modelsUpserted: number;
  modelsDeactivated: number;
  productsInserted: number;
  productsUpdated: number;
  productsDeactivated: number;
  fitmentRows: number;
  notes: number;
}

export interface ApplyError {
  slug: string;
  sourceFile: string;
  error: string;
}

export interface ApplyResult {
  importId: string | null;
  families: FamilyApplyResult[];
  errors: ApplyError[];
  photosSeeded: number;
  totals: {
    familiesProcessed: number;
    familiesFailed: number;
    modelsUpserted: number;
    productsInserted: number;
    productsUpdated: number;
    productsDeactivated: number;
    fitmentRows: number;
    notes: number;
  };
}

// ---------------------------------------------------------------------------
// Familie: model_families upsert (Update, wenn per slug oder source_file
// bereits vorhanden, sonst Insert)
// ---------------------------------------------------------------------------

async function upsertFamily(parsed: ParsedFamily, db: Db): Promise<{ id: string; created: boolean }> {
  const bySlug = await db.from("model_families").select("id").eq("slug", parsed.slug).maybeSingle();
  if (bySlug.error) throw new Error(`model_families laden (slug) fehlgeschlagen: ${bySlug.error.message}`);

  let existingId = bySlug.data?.id ?? null;
  if (!existingId && parsed.sourceFile) {
    const bySource = await db
      .from("model_families")
      .select("id")
      .eq("source_file", parsed.sourceFile)
      .maybeSingle();
    if (bySource.error) {
      throw new Error(`model_families laden (source_file) fehlgeschlagen: ${bySource.error.message}`);
    }
    existingId = bySource.data?.id ?? null;
  }

  // Admin-Felder photo_url, short_text, sort bewusst NICHT im Payload:
  // dadurch lässt "update"/"insert" sie unverändert bzw. auf DB-Default.
  const payload = {
    brand: parsed.brand,
    name: parsed.name,
    slug: parsed.slug,
    codes: parsed.codes,
    pricelist_no: parsed.pricelistNo,
    source_file: parsed.sourceFile,
    has_pricelist: true,
    active: true,
  };

  if (existingId) {
    const { data, error } = await db
      .from("model_families")
      .update(payload)
      .eq("id", existingId)
      .select("id")
      .single();
    if (error) throw new Error(`model_families update fehlgeschlagen: ${error.message}`);
    return { id: data.id, created: false };
  }

  const { data, error } = await db.from("model_families").insert(payload).select("id").single();
  if (error) throw new Error(`model_families insert fehlgeschlagen: ${error.message}`);
  return { id: data.id, created: true };
}

// ---------------------------------------------------------------------------
// Modelle: upsert nach (family_id, slug), nicht mehr vorhandene deaktivieren
// ---------------------------------------------------------------------------

async function upsertModels(
  familyId: string,
  parsed: ParsedFamily,
  db: Db,
): Promise<{ nameToId: Map<string, string>; upserted: number; deactivated: number }> {
  const rows = parsed.models.map((m) => ({
    family_id: familyId,
    name: m.name,
    slug: m.slug,
    fuel: m.fuel,
    sort: m.sort,
    series_ps_suggested: m.seriesPsSuggested,
    active: true,
  }));

  const nameToId = new Map<string, string>();
  for (const batch of chunk(rows)) {
    const { data, error } = await db
      .from("models")
      .upsert(batch, { onConflict: "family_id,slug" })
      .select("id, name");
    if (error) throw new Error(`models upsert fehlgeschlagen: ${error.message}`);
    for (const r of data ?? []) nameToId.set(r.name, r.id);
  }

  const parsedSlugs = parsed.models.map((m) => m.slug);
  // Es gibt laut Parser immer mindestens ein Modell je Familie, aber falls
  // eine Excel-Datei doch mal leer wäre, würde eine leere in-Liste in
  // PostgREST alles matchen ("()") statt nichts - deshalb der Sonderfall.
  let deactivated = 0;
  if (parsedSlugs.length > 0) {
    const { data, error } = await db
      .from("models")
      .update({ active: false })
      .eq("family_id", familyId)
      .eq("active", true)
      .not("slug", "in", `(${parsedSlugs.join(",")})`)
      .select("id");
    if (error) throw new Error(`models deaktivieren fehlgeschlagen: ${error.message}`);
    deactivated = data?.length ?? 0;
  }

  return { nameToId, upserted: rows.length, deactivated };
}

// ---------------------------------------------------------------------------
// Produkte: matchen (wie diff.ts), updaten/einfügen, Rest deaktivieren
// ---------------------------------------------------------------------------

interface ProductPlan {
  toUpdate: { id: string; row: Omit<ProductInsert, "id"> }[];
  toInsert: { sourceRow: number; row: ProductInsert; fits: string[]; fitsAll: boolean }[];
  updateFits: { productId: string; fits: string[]; fitsAll: boolean }[];
  removedIds: string[];
}

function buildProductRow(familyId: string, p: ParsedFamily["products"][number]): ProductInsert {
  return {
    family_id: familyId,
    category: p.category,
    source_category: p.sourceCategory,
    group_label: p.groupLabel,
    name: p.name,
    description: p.description,
    article_no: p.articleNo,
    rc: p.rc,
    price_parts: p.pricePartsChf,
    price_install: p.priceInstallChf,
    price_approval: p.priceApprovalChf,
    price_total: p.priceTotalChf,
    price_status: p.priceStatus,
    price_note: p.priceNote,
    ps_base: p.psBase,
    ps_to: p.psTo,
    nm_to: p.nmTo,
    variant_group: p.variantGroup,
    fits_all: p.fitsAll,
    sort: p.sort,
    source_row: p.sourceRow,
    content_hash: p.contentHash,
    active: true,
  };
}

async function planProducts(familyId: string, parsed: ParsedFamily, db: Db): Promise<ProductPlan> {
  const { data, error } = await db
    .from("products")
    .select("*")
    .eq("family_id", familyId)
    .eq("active", true);
  if (error) throw new Error(`products laden fehlgeschlagen: ${error.message}`);
  const dbProducts = (data ?? []) as Product[];

  // Gleiche Match-Logik wie diff.ts (siehe dortiger Kommentar zu Befund #2):
  // drei volle Durchgänge (content_hash -> article_no+name -> name+category)
  // statt zeilenweise, plus Fits VOR dem Matching laden, da
  // matchFamilyProducts() sie zur Kandidaten-Auswahl bei Mehrdeutigkeit
  // braucht (identisches Fitment als Tie-Breaker neben source_row).
  const oldFitsByProductId = await loadFitsByProductId(
    db,
    dbProducts.map((p) => p.id),
  );
  const { matches, removedProducts } = matchFamilyProducts(parsed.products, dbProducts, oldFitsByProductId);

  const toUpdate: ProductPlan["toUpdate"] = [];
  const updateFits: ProductPlan["updateFits"] = [];
  const toInsert: ProductPlan["toInsert"] = [];

  parsed.products.forEach((p, i) => {
    const match = matches[i];
    const row = buildProductRow(familyId, p);
    if (match) {
      toUpdate.push({ id: match.product.id, row });
      updateFits.push({ productId: match.product.id, fits: p.fits, fitsAll: p.fitsAll });
    } else {
      toInsert.push({ sourceRow: p.sourceRow, row, fits: p.fits, fitsAll: p.fitsAll });
    }
  });

  const removedIds = removedProducts.map((p) => p.id);

  return { toUpdate, toInsert, updateFits, removedIds };
}

async function applyProductPlan(
  plan: ProductPlan,
  db: Db,
): Promise<{ inserted: number; updated: number; deactivated: number; fitment: { productId: string; fits: string[]; fitsAll: boolean }[] }> {
  for (const batch of chunk(plan.toUpdate)) {
    const rows = batch.map((u) => ({ id: u.id, ...u.row }));
    const { error } = await db.from("products").upsert(rows);
    if (error) throw new Error(`products update fehlgeschlagen: ${error.message}`);
  }

  const insertedFitment: { productId: string; fits: string[]; fitsAll: boolean }[] = [];
  for (const batch of chunk(plan.toInsert)) {
    const { data, error } = await db
      .from("products")
      .insert(batch.map((b) => b.row))
      .select("id");
    if (error) throw new Error(`products insert fehlgeschlagen: ${error.message}`);
    // Eine einzelne INSERT ... VALUES (...) RETURNING id liefert die Zeilen
    // in derselben Reihenfolge wie die VALUES-Liste (Postgres-Verhalten bei
    // einem einzelnen Statement, keine parallele Ausführung je Zeile) -
    // deshalb per Index statt per Zusatzschlüssel zuordnen.
    (data ?? []).forEach((row, idx) => {
      const b = batch[idx];
      insertedFitment.push({ productId: row.id, fits: b.fits, fitsAll: b.fitsAll });
    });
  }

  for (const batch of chunk(plan.removedIds)) {
    const { error } = await db.from("products").update({ active: false }).in("id", batch);
    if (error) throw new Error(`products deaktivieren fehlgeschlagen: ${error.message}`);
  }

  return {
    inserted: plan.toInsert.length,
    updated: plan.toUpdate.length,
    deactivated: plan.removedIds.length,
    fitment: [...plan.updateFits, ...insertedFitment],
  };
}

// ---------------------------------------------------------------------------
// product_fitment komplett neu setzen (delete + insert je Produkt dieses
// Imports; bei fits_all keine Zeilen)
// ---------------------------------------------------------------------------

async function replaceFitment(
  productFits: { productId: string; fits: string[]; fitsAll: boolean }[],
  nameToId: Map<string, string>,
  db: Db,
): Promise<number> {
  const productIds = productFits.map((f) => f.productId);
  for (const batch of chunk(productIds)) {
    const { error } = await db.from("product_fitment").delete().in("product_id", batch);
    if (error) throw new Error(`product_fitment löschen fehlgeschlagen: ${error.message}`);
  }

  const rows: { product_id: string; model_id: string }[] = [];
  for (const f of productFits) {
    if (f.fitsAll) continue;
    for (const fitName of f.fits) {
      const modelId = nameToId.get(fitName);
      // Sollte laut Parser-Garantie (fits enthält immer models[].name
      // derselben Familie) nicht vorkommen; defensiv überspringen statt
      // die ganze Familie scheitern zu lassen.
      if (modelId) rows.push({ product_id: f.productId, model_id: modelId });
    }
  }

  for (const batch of chunk(rows)) {
    const { error } = await db.from("product_fitment").insert(batch);
    if (error) throw new Error(`product_fitment einfügen fehlgeschlagen: ${error.message}`);
  }

  return rows.length;
}

// ---------------------------------------------------------------------------
// pricelist_notes ersetzen
// ---------------------------------------------------------------------------

async function replaceNotes(familyId: string, parsed: ParsedFamily, db: Db): Promise<number> {
  const { error: deleteError } = await db.from("pricelist_notes").delete().eq("family_id", familyId);
  if (deleteError) throw new Error(`pricelist_notes löschen fehlgeschlagen: ${deleteError.message}`);

  if (parsed.notes.length === 0) return 0;

  const rows = parsed.notes.map((n) => ({
    family_id: familyId,
    category: n.sourceCategory,
    text: n.text,
    sort: n.sort,
  }));
  for (const batch of chunk(rows)) {
    const { error } = await db.from("pricelist_notes").insert(batch);
    if (error) throw new Error(`pricelist_notes einfügen fehlgeschlagen: ${error.message}`);
  }
  return rows.length;
}

// ---------------------------------------------------------------------------
// Eine Familie komplett anwenden
// ---------------------------------------------------------------------------

async function applyFamily(parsed: ParsedFamily, db: Db): Promise<FamilyApplyResult> {
  const { id: familyId, created } = await upsertFamily(parsed, db);
  const { nameToId, upserted, deactivated: modelsDeactivated } = await upsertModels(familyId, parsed, db);
  const plan = await planProducts(familyId, parsed, db);
  const { inserted, updated, deactivated: productsDeactivated, fitment } = await applyProductPlan(plan, db);
  const fitmentRows = await replaceFitment(fitment, nameToId, db);
  const notes = await replaceNotes(familyId, parsed, db);

  return {
    slug: parsed.slug,
    name: parsed.name,
    sourceFile: parsed.sourceFile,
    familyId,
    familyCreated: created,
    modelsUpserted: upserted,
    modelsDeactivated,
    productsInserted: inserted,
    productsUpdated: updated,
    productsDeactivated,
    fitmentRows,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Seed-Fotos: nur setzen, wenn photo_url noch null ist
// ---------------------------------------------------------------------------

async function applySeedPhotos(db: Db): Promise<number> {
  let count = 0;
  for (const seed of SEED_PHOTOS) {
    const { data, error } = await db
      .from("model_families")
      .update({ photo_url: seed.photoUrl })
      .eq("slug", seed.slug)
      .is("photo_url", null)
      .select("id");
    if (error) throw new Error(`Seed-Foto für ${seed.slug} fehlgeschlagen: ${error.message}`);
    count += data?.length ?? 0;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Öffentliche API
// ---------------------------------------------------------------------------

export async function applyImport(
  parsed: ParsedFamily[],
  db: Db,
  opts: { importId?: string } = {},
): Promise<ApplyResult> {
  const families: FamilyApplyResult[] = [];
  const errors: ApplyError[] = [];

  for (const family of parsed) {
    try {
      families.push(await applyFamily(family, db));
    } catch (err) {
      errors.push({
        slug: family.slug,
        sourceFile: family.sourceFile,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const photosSeeded = await applySeedPhotos(db);

  const totals = families.reduce(
    (acc, f) => {
      acc.modelsUpserted += f.modelsUpserted;
      acc.productsInserted += f.productsInserted;
      acc.productsUpdated += f.productsUpdated;
      acc.productsDeactivated += f.productsDeactivated;
      acc.fitmentRows += f.fitmentRows;
      acc.notes += f.notes;
      return acc;
    },
    {
      familiesProcessed: families.length,
      familiesFailed: errors.length,
      modelsUpserted: 0,
      productsInserted: 0,
      productsUpdated: 0,
      productsDeactivated: 0,
      fitmentRows: 0,
      notes: 0,
    },
  );

  return { importId: opts.importId ?? null, families, errors, photosSeeded, totals };
}
