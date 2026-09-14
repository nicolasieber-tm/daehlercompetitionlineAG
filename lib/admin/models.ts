// Admin-Datenzugriff für Baureihen/Modelle (Posten "Modelle"): Übersicht
// (Foto, Preisliste ja/nein, aktiv, Anzahl Modelle/Produkte), Detail je
// Baureihe (Foto, Kurzbeschrieb, Sortierung, Modelle mit series_ps/nm).
// Siehe docs/architektur.md, Abschnitte "Datenmodell" und "Excel-Import im
// Admin" ("Admin-Felder photo_url, short_text, series_ps, series_nm, sort
// bleiben erhalten").
//
// Wie lib/admin/inquiries.ts: liest/schreibt über den Server-Client
// (Session-Cookies, RLS) - die Policies `model_families_all_authenticated`
// und `models_all_authenticated` (siehe supabase/migrations/
// 20260911000000_init.sql) geben jedem eingeloggten Admin volle Rechte,
// auch auf inaktive Zeilen. Foto-Uploads laufen separat über den
// Service-Role-Client (siehe app/api/admin/models/photo/route.ts, Storage-
// Bucket "model-photos").
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { Brand, Fuel, ModelFamilyUpdate, ModelUpdate } from "@/lib/supabase/rows";

type Db = SupabaseClient<Database>;

async function resolveClient(db?: Db): Promise<Db> {
  return db ?? (await createServerClient());
}

// ---------------------------------------------------------------------------
// Zählungen (Anzahl Modelle/Produkte je Baureihe), seitenweise geladen wie
// lib/catalog/queries.ts loadAllActiveProducts(): PostgREST kappt jede
// Antwort still bei max_rows (supabase/config.toml), bei ~2'500 aktiven
// Produkten reicht eine einzelne select() ohne .range() nicht.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000;

async function countActiveByFamily(db: Db, table: "models" | "products"): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from(table)
      .select("family_id")
      .eq("active", true)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table} zählen fehlgeschlagen: ${error.message}`);
    const rows = data ?? [];
    for (const r of rows) counts.set(r.family_id, (counts.get(r.family_id) ?? 0) + 1);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Übersicht
// ---------------------------------------------------------------------------

export interface AdminFamilyListItem {
  id: string;
  slug: string;
  name: string;
  brand: Brand;
  photoUrl: string | null;
  hasPricelist: boolean;
  active: boolean;
  sort: number;
  modelCount: number;
  productCount: number;
}

const BRAND_ORDER: Record<string, number> = { BMW: 0, MINI: 1, Toyota: 2, Wiesmann: 3 };

export async function getFamiliesForAdmin(db?: Db): Promise<AdminFamilyListItem[]> {
  const client = await resolveClient(db);
  const { data, error } = await client
    .from("model_families")
    .select("id, slug, name, brand, photo_url, has_pricelist, active, sort");
  if (error) throw new Error(`Baureihen laden fehlgeschlagen: ${error.message}`);

  const [modelCounts, productCounts] = await Promise.all([
    countActiveByFamily(client, "models"),
    countActiveByFamily(client, "products"),
  ]);

  return (data ?? [])
    .map((f) => ({
      id: f.id,
      slug: f.slug,
      name: f.name,
      brand: f.brand as Brand,
      photoUrl: f.photo_url,
      hasPricelist: f.has_pricelist,
      active: f.active,
      sort: f.sort,
      modelCount: modelCounts.get(f.id) ?? 0,
      productCount: productCounts.get(f.id) ?? 0,
    }))
    .sort((a, b) => {
      const ba = BRAND_ORDER[a.brand] ?? 99;
      const bb = BRAND_ORDER[b.brand] ?? 99;
      if (ba !== bb) return ba - bb;
      if (a.sort !== b.sort) return a.sort - b.sort;
      return a.name.localeCompare(b.name, "de-CH");
    });
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export interface AdminModelItem {
  id: string;
  slug: string;
  name: string;
  fuel: Fuel | null;
  seriesPs: number | null;
  seriesNm: number | null;
  seriesPsSuggested: number[];
  sort: number;
  active: boolean;
  productCount: number;
}

export interface AdminFamilyDetail {
  id: string;
  slug: string;
  name: string;
  brand: Brand;
  codes: string[];
  hasPricelist: boolean;
  active: boolean;
  sort: number;
  shortText: string | null;
  photoUrl: string | null;
  models: AdminModelItem[];
}

export async function getFamilyDetailForAdmin(slug: string, db?: Db): Promise<AdminFamilyDetail | null> {
  const client = await resolveClient(db);
  const { data: family, error: familyError } = await client
    .from("model_families")
    .select("id, slug, name, brand, codes, has_pricelist, active, sort, short_text, photo_url")
    .eq("slug", slug)
    .maybeSingle();
  if (familyError) throw new Error(`Baureihe laden fehlgeschlagen: ${familyError.message}`);
  if (!family) return null;

  const { data: models, error: modelsError } = await client
    .from("models")
    .select("id, slug, name, fuel, series_ps, series_nm, series_ps_suggested, sort, active")
    .eq("family_id", family.id)
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (modelsError) throw new Error(`Modelle laden fehlgeschlagen: ${modelsError.message}`);

  const { data: productRows, error: productsError } = await client
    .from("product_fitment")
    .select("model_id, products!inner(id, family_id, active)")
    .eq("products.family_id", family.id)
    .eq("products.active", true);
  if (productsError) throw new Error(`Produktzahl laden fehlgeschlagen: ${productsError.message}`);
  const fitmentCounts = new Map<string, number>();
  for (const row of (productRows ?? []) as unknown as { model_id: string }[]) {
    fitmentCounts.set(row.model_id, (fitmentCounts.get(row.model_id) ?? 0) + 1);
  }
  // fits_all-Produkte (kein product_fitment-Eintrag) zählen für jedes Modell
  // der Familie zusätzlich, wie im Kundenflow (lib/catalog/queries.ts
  // loadFittingProducts()).
  const { count: fitsAllCount, error: fitsAllError } = await client
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("family_id", family.id)
    .eq("active", true)
    .eq("fits_all", true);
  if (fitsAllError) throw new Error(`Produktzahl (fits_all) laden fehlgeschlagen: ${fitsAllError.message}`);

  return {
    id: family.id,
    slug: family.slug,
    name: family.name,
    brand: family.brand as Brand,
    codes: family.codes,
    hasPricelist: family.has_pricelist,
    active: family.active,
    sort: family.sort,
    shortText: family.short_text,
    photoUrl: family.photo_url,
    models: (models ?? []).map((m) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      fuel: m.fuel as Fuel | null,
      seriesPs: m.series_ps,
      seriesNm: m.series_nm,
      seriesPsSuggested: m.series_ps_suggested,
      sort: m.sort,
      active: m.active,
      productCount: (fitmentCounts.get(m.id) ?? 0) + (fitsAllCount ?? 0),
    })),
  };
}

// ---------------------------------------------------------------------------
// Mutationen
// ---------------------------------------------------------------------------

export interface FamilyMetaPatch {
  name?: string;
  shortText?: string | null;
  sort?: number;
  active?: boolean;
}

/**
 * Aktualisiert die Admin-Felder einer Baureihe. `name` wird nur übernommen,
 * wenn die Familie ein Platzhalter ohne Preisliste ist (has_pricelist =
 * false, siehe Aufgabenstellung "Platzhalter-Familien editierbar (Name,
 * Foto, Text)") - bei Familien mit Preisliste kommt der Name aus dem Excel-
 * Import und würde beim nächsten Import ohnehin überschrieben; ein
 * abweichender Admin-Name wäre irreführend, deshalb wird er hier
 * serverseitig verworfen statt nur im UI ausgeblendet.
 */
export async function updateFamilyMeta(familyId: string, patch: FamilyMetaPatch, db?: Db): Promise<void> {
  const client = await resolveClient(db);

  const { data: family, error: loadError } = await client
    .from("model_families")
    .select("has_pricelist")
    .eq("id", familyId)
    .single();
  if (loadError) throw new Error(`Baureihe laden fehlgeschlagen: ${loadError.message}`);

  const payload: ModelFamilyUpdate = {};
  if (patch.shortText !== undefined) payload.short_text = patch.shortText;
  if (patch.sort !== undefined) payload.sort = patch.sort;
  if (patch.active !== undefined) payload.active = patch.active;
  if (patch.name !== undefined && !family.has_pricelist) payload.name = patch.name;

  if (Object.keys(payload).length === 0) return;

  const { error } = await client.from("model_families").update(payload).eq("id", familyId);
  if (error) throw new Error(`Baureihe speichern fehlgeschlagen: ${error.message}`);
}

export interface ModelPatch {
  seriesPs?: number | null;
  seriesNm?: number | null;
  active?: boolean;
}

export async function updateModel(modelId: string, patch: ModelPatch, db?: Db): Promise<void> {
  const client = await resolveClient(db);
  const payload: ModelUpdate = {};
  if (patch.seriesPs !== undefined) payload.series_ps = patch.seriesPs;
  if (patch.seriesNm !== undefined) payload.series_nm = patch.seriesNm;
  if (patch.active !== undefined) payload.active = patch.active;
  if (Object.keys(payload).length === 0) return;

  const { error } = await client.from("models").update(payload).eq("id", modelId);
  if (error) throw new Error(`Modell speichern fehlgeschlagen: ${error.message}`);
}

/** Nur für die Foto-Route: liefert slug + aktuelle photo_url einer Baureihe. */
export async function getFamilyForPhoto(
  familyId: string,
  db?: Db,
): Promise<{ id: string; slug: string; photoUrl: string | null } | null> {
  const client = await resolveClient(db);
  const { data, error } = await client
    .from("model_families")
    .select("id, slug, photo_url")
    .eq("id", familyId)
    .maybeSingle();
  if (error) throw new Error(`Baureihe laden fehlgeschlagen: ${error.message}`);
  return data ? { id: data.id, slug: data.slug, photoUrl: data.photo_url } : null;
}

export async function setFamilyPhotoUrl(familyId: string, photoUrl: string | null, db?: Db): Promise<void> {
  const client = await resolveClient(db);
  const { error } = await client.from("model_families").update({ photo_url: photoUrl }).eq("id", familyId);
  if (error) throw new Error(`Foto speichern fehlgeschlagen: ${error.message}`);
}
