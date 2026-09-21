// Übernahme eines Excel-Imports in die DB. Quelle: docs/architektur.md,
// Abschnitt "Excel-Import im Admin", docs/excel-import.md.
//
// Reihenfolge je Familie: model_families upsert -> models upsert -> products
// (Match wie in diff.ts: content_hash -> article_no+name -> name+category) ->
// product_fitment neu setzen -> pricelist_notes ersetzen. Admin-Felder
// (photo_url, short_text, sort auf model_families; series_ps, series_nm,
// photo_url auf models) werden nie in ein Update/Upsert-Payload aufgenommen,
// dadurch bleiben sie unangetastet (explizite update-Statements nennen nur
// die Excel-Felder, keine "update *").
//
// Zugriff über den Postgres-Pool (lib/db/client.ts, sql). Jede Familie
// läuft in einer eigenen Transaktion (sql.begin(), "Updates per Transaktion
// je Familie" -
// schlägt eine Familie fehl, bleibt der DB-Zustand für sie unverändert,
// andere Familien sind davon unabhängig, wie schon bisher: applyImport()
// sammelt Fehler pro Familie statt beim ersten Fehler ganz abzubrechen).
// abgeleitete Felder (z.B. gearbox, body_styles, drive) werden bei jedem Import für JEDES
// gematchte Produkt neu geschrieben, auch bei einem reinen content_hash-
// Treffer (kein Sonderfall im Code: das Update-Payload enthält immer alle
// Felder aus der aktuellen Excel-Zeile, unabhängig von matchedBy).
import { sql } from "@/lib/db/client";
import { chunk } from "@/lib/db/helpers";
import type { Product } from "@/lib/db/rows";
import { SEED_PHOTOS } from "@/lib/catalog/seed-photos";
import { loadFitsByProductId, matchFamilyProducts } from "./diff";
import type { ParsedFamily } from "./types";

/**
 * Gemeinsamer Typ für den globalen Pool (sql) und eine laufende Transaktion
 * (sql.begin()-Callback-Parameter): beide implementieren dieselbe
 * Abfrage-Schnittstelle zur Laufzeit (ISql), sind aber wegen der von
 * lib/db/client.ts registrierten Custom-Types (numeric/bigint/timestamp)
 * als `postgres.ISql<...>` nicht sauber typisierbar - weder mit der
 * konkreten Custom-Type-Form (die "Dynamic columns"-Query-Helfer, siehe
 * tx(rows, ...cols) unten, lösen ihre Überladungen dagegen nicht mehr auf)
 * noch mit `Record<string, unknown>`/`any` als Typparameter (dann fehlt
 * postgres.js' Mapped-Type `typed` strukturell eine Index-Signatur). `any`
 * als Typ selbst (statt als Typparameter von ISql) umgeht das: die
 * Bind-Parameter/Ergebnis-Typen dieser rein internen Helfer sind ohnehin
 * durch die expliziten Zeilentypen weiter unten (ProductRowFields, sql<T>()
 * -Aufrufe) abgesichert.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

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

async function upsertFamily(parsed: ParsedFamily, tx: Tx): Promise<{ id: string; created: boolean }> {
  const bySlug = await tx<{ id: string }[]>`select id from model_families where slug = ${parsed.slug}`;
  let existingId = bySlug[0]?.id ?? null;
  if (!existingId && parsed.sourceFile) {
    const bySource = await tx<{ id: string }[]>`
      select id from model_families where source_file = ${parsed.sourceFile}
    `;
    existingId = bySource[0]?.id ?? null;
  }

  // Admin-Felder photo_url, short_text, sort bewusst NICHT im update-
  // Statement: dadurch bleiben sie unangetastet.
  if (existingId) {
    await tx`
      update model_families set
        brand = ${parsed.brand},
        name = ${parsed.name},
        slug = ${parsed.slug},
        codes = ${parsed.codes},
        pricelist_no = ${parsed.pricelistNo},
        source_file = ${parsed.sourceFile},
        has_pricelist = true,
        active = true
      where id = ${existingId}
    `;
    return { id: existingId, created: false };
  }

  const inserted = await tx<{ id: string }[]>`
    insert into model_families (brand, name, slug, codes, pricelist_no, source_file, has_pricelist, active)
    values (
      ${parsed.brand}, ${parsed.name}, ${parsed.slug}, ${parsed.codes},
      ${parsed.pricelistNo}, ${parsed.sourceFile}, true, true
    )
    returning id
  `;
  return { id: inserted[0].id, created: true };
}

// ---------------------------------------------------------------------------
// Modelle: upsert nach (family_id, slug), nicht mehr vorhandene deaktivieren
// ---------------------------------------------------------------------------

async function upsertModels(
  familyId: string,
  parsed: ParsedFamily,
  tx: Tx,
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
  if (rows.length > 0) {
    const inserted = await tx<{ id: string; name: string }[]>`
      insert into models ${tx(rows, "family_id", "name", "slug", "fuel", "sort", "series_ps_suggested", "active")}
      on conflict (family_id, slug) do update set
        name = excluded.name,
        fuel = excluded.fuel,
        sort = excluded.sort,
        series_ps_suggested = excluded.series_ps_suggested,
        active = true
      returning id, name
    `;
    for (const r of inserted) nameToId.set(r.name, r.id);
  }

  const parsedSlugs = parsed.models.map((m) => m.slug);
  // Es gibt laut Parser immer mindestens ein Modell je Familie, aber falls
  // eine Excel-Datei doch mal leer wäre, würde ein leeres Array in
  // "<> all(...)" alles matchen statt nichts - deshalb der Sonderfall.
  let deactivated = 0;
  if (parsedSlugs.length > 0) {
    const rowsDeactivated = await tx<{ id: string }[]>`
      update models set active = false
      where family_id = ${familyId} and active = true and slug <> all(${parsedSlugs}::text[])
      returning id
    `;
    deactivated = rowsDeactivated.length;
  }

  return { nameToId, upserted: rows.length, deactivated };
}

// ---------------------------------------------------------------------------
// Produkte: matchen (wie diff.ts), updaten/einfügen, Rest deaktivieren
// ---------------------------------------------------------------------------

/** Die per Excel-Import gepflegten Produkt-Spalten (keine Admin-Felder). */
interface ProductRowFields {
  family_id: string;
  category: string;
  source_category: string | null;
  group_label: string | null;
  name: string;
  description: string | null;
  article_no: string | null;
  rc: string | null;
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
  body_styles: string[];
  drive: string | null;
  fits_all: boolean;
  sort: number;
  source_row: number | null;
  content_hash: string | null;
  active: boolean;
}

const PRODUCT_ROW_COLUMNS = [
  "family_id",
  "category",
  "source_category",
  "group_label",
  "name",
  "description",
  "article_no",
  "rc",
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
  "fits_all",
  "sort",
  "source_row",
  "content_hash",
  "active",
] as const;

interface ProductPlan {
  toUpdate: { id: string; row: ProductRowFields }[];
  toInsert: { row: ProductRowFields; fits: string[]; fitsAll: boolean }[];
  updateFits: { productId: string; fits: string[]; fitsAll: boolean }[];
  removedIds: string[];
}

function buildProductRow(familyId: string, p: ParsedFamily["products"][number]): ProductRowFields {
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
    gearbox: p.gearbox,
    body_styles: p.bodyStyles,
    drive: p.drive,
    fits_all: p.fitsAll,
    sort: p.sort,
    source_row: p.sourceRow,
    content_hash: p.contentHash,
    active: true,
  };
}

async function planProducts(familyId: string, parsed: ParsedFamily, tx: Tx): Promise<ProductPlan> {
  // Explizite Annotation nötig: tx ist als `any` typisiert (siehe Kommentar
  // zu `Tx` oben), das generische Typargument von tx<Product[]>`...` allein
  // reicht dadurch nicht, um dbProducts einen konkreten Typ zu geben.
  const dbProducts: Product[] = await tx<Product[]>`
    select * from products where family_id = ${familyId} and active = true
  `;

  // Gleiche Match-Logik wie diff.ts (siehe dortiger Kommentar zu Befund #2):
  // drei volle Durchgänge (content_hash -> article_no+name -> name+category)
  // statt zeilenweise, plus Fits VOR dem Matching laden, da
  // matchFamilyProducts() sie zur Kandidaten-Auswahl bei Mehrdeutigkeit
  // braucht (identisches Fitment als Tie-Breaker neben source_row). Über
  // dieselbe Transaktion gelesen wie dbProducts (tx statt des globalen
  // Pools), damit beides denselben, konsistenten Vor-Import-Stand sieht.
  const oldFitsByProductId = await loadFitsByProductId(
    dbProducts.map((p) => p.id),
    tx,
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
      toInsert.push({ row, fits: p.fits, fitsAll: p.fitsAll });
    }
  });

  const removedIds = removedProducts.map((p) => p.id);

  return { toUpdate, toInsert, updateFits, removedIds };
}

async function applyProductPlan(
  plan: ProductPlan,
  tx: Tx,
): Promise<{ inserted: number; updated: number; deactivated: number; fitment: { productId: string; fits: string[]; fitsAll: boolean }[] }> {
  // Ein update-Statement je Zeile, aber alle auf derselben Transaktions-
  // verbindung gepipelined (postgres.js sendet auf einer Connection immer
  // in Aufrufreihenfolge, Promise.all serialisiert hier also nicht künstlich
  // auf einen Round-Trip je Zeile).
  await Promise.all(
    plan.toUpdate.map(({ id, row }) =>
      tx`update products set ${tx(row, ...PRODUCT_ROW_COLUMNS)} where id = ${id}`,
    ),
  );

  let insertedFitment: { productId: string; fits: string[]; fitsAll: boolean }[] = [];
  if (plan.toInsert.length > 0) {
    const insertedRows: { id: string }[] = await tx<{ id: string }[]>`
      insert into products ${tx(plan.toInsert.map((b) => b.row), ...PRODUCT_ROW_COLUMNS)}
      returning id
    `;
    // Eine einzelne INSERT ... VALUES (...) RETURNING id liefert die Zeilen
    // in derselben Reihenfolge wie die VALUES-Liste (Postgres-Verhalten bei
        // einem einzelnen Statement, keine parallele Ausführung je Zeile) -
    // deshalb per Index statt per Zusatzschlüssel zuordnen.
    insertedFitment = insertedRows.map((row, idx) => {
      const b = plan.toInsert[idx];
      return { productId: row.id, fits: b.fits, fitsAll: b.fitsAll };
    });
  }

  let deactivated = 0;
  if (plan.removedIds.length > 0) {
    const rows = await tx<{ id: string }[]>`
      update products set active = false where id = any(${plan.removedIds}::uuid[]) returning id
    `;
    deactivated = rows.length;
  }

  return {
    inserted: plan.toInsert.length,
    updated: plan.toUpdate.length,
    deactivated,
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
  tx: Tx,
): Promise<number> {
  const productIds = productFits.map((f) => f.productId);
  if (productIds.length > 0) {
    await tx`delete from product_fitment where product_id = any(${productIds}::uuid[])`;
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

  if (rows.length > 0) {
    // In Häppchen statt einer einzigen riesigen VALUES-Liste (lib/db/
    // helpers.ts chunk()): bei Familien mit sehr vielen Fitment-Zeilen
    // (siehe docs/excel-import.md, über 1000 Zeilen bei grossen Familien)
    // bleibt so die Anzahl der Bind-Parameter je Statement überschaubar.
    for (const batch of chunk(rows, 500)) {
      await tx`insert into product_fitment ${tx(batch, "product_id", "model_id")}`;
    }
  }

  return rows.length;
}

// ---------------------------------------------------------------------------
// pricelist_notes ersetzen
// ---------------------------------------------------------------------------

async function replaceNotes(familyId: string, parsed: ParsedFamily, tx: Tx): Promise<number> {
  await tx`delete from pricelist_notes where family_id = ${familyId}`;

  if (parsed.notes.length === 0) return 0;

  const rows = parsed.notes.map((n) => ({
    family_id: familyId,
    category: n.sourceCategory,
    text: n.text,
    sort: n.sort,
  }));
  await tx`insert into pricelist_notes ${tx(rows, "family_id", "category", "text", "sort")}`;
  return rows.length;
}

// ---------------------------------------------------------------------------
// Eine Familie komplett anwenden (eigene Transaktion, siehe Dateikopf)
// ---------------------------------------------------------------------------

async function applyFamily(parsed: ParsedFamily): Promise<FamilyApplyResult> {
  return sql.begin(async (tx) => {
    const { id: familyId, created } = await upsertFamily(parsed, tx);
    const { nameToId, upserted, deactivated: modelsDeactivated } = await upsertModels(familyId, parsed, tx);
    const plan = await planProducts(familyId, parsed, tx);
    const { inserted, updated, deactivated: productsDeactivated, fitment } = await applyProductPlan(plan, tx);
    const fitmentRows = await replaceFitment(fitment, nameToId, tx);
    const notes = await replaceNotes(familyId, parsed, tx);

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
  });
}

// ---------------------------------------------------------------------------
// Seed-Fotos: nur setzen, wenn photo_url noch null ist (ausserhalb jeder
// Familien-Transaktion, wirkt familienübergreifend und ist idempotent)
// ---------------------------------------------------------------------------

async function applySeedPhotos(): Promise<number> {
  let count = 0;
  for (const seed of SEED_PHOTOS) {
    const rows = await sql<{ id: string }[]>`
      update model_families set photo_url = ${seed.photoUrl}
      where slug = ${seed.slug} and photo_url is null
      returning id
    `;
    count += rows.length;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Öffentliche API
// ---------------------------------------------------------------------------

export async function applyImport(
  parsed: ParsedFamily[],
  opts: { importId?: string } = {},
): Promise<ApplyResult> {
  const families: FamilyApplyResult[] = [];
  const errors: ApplyError[] = [];

  for (const family of parsed) {
    try {
      families.push(await applyFamily(family));
    } catch (err) {
      errors.push({
        slug: family.slug,
        sourceFile: family.sourceFile,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const photosSeeded = await applySeedPhotos();

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
