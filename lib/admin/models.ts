// Admin-Datenzugriff für Baureihen/Modelle (Posten "Modelle"): Übersicht
// (Foto, Preisliste ja/nein, aktiv, Anzahl Modelle/Produkte), Detail je
// Baureihe (Foto, Kurzbeschrieb, Sortierung, Modelle mit series_ps/nm).
// Siehe docs/architektur.md, Abschnitte "Datenmodell" und "Excel-Import im
// Admin" ("Admin-Felder photo_url, short_text, series_ps, series_nm, sort
// bleiben erhalten").
//
// Postgres direkt über lib/db/client.ts (sql), siehe docs/umbau-railway.md,
// Abschnitt "Datenzugriffsschicht": keine RLS mehr, jeder Zugriff läuft
// ohnehin serverseitig durch die App. Foto-Uploads laufen über
// app/api/admin/models/photo/route.ts (Tabelle photos statt Storage-Bucket,
// siehe dortiger Kommentar und docs/umbau-railway.md, Abschnitt "Fotos").
import { sql } from "@/lib/db/client";
import type { Brand, Fuel } from "@/lib/db/rows";

// ---------------------------------------------------------------------------
// Foto-Validierung (app/api/admin/models/photo/route.ts): als reine
// Funktionen hier statt in der Route selbst, damit sie ohne HTTP-Server/DB
// getestet werden können (siehe tests/admin/models.test.ts) - eine
// Next.js-Route-Handler-Datei soll ausser den HTTP-Methoden (GET/POST/...)
// keine weiteren Exporte tragen.
// ---------------------------------------------------------------------------

/** Einfache Formprüfung (RFC-4122-Layout), keine Versions-/Variant-Bit-Prüfung - reicht, um Tippfehler/manipulierte IDs aus URL/Body/Formdaten abzufangen. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Magic-Bytes-Prüfung zusätzlich zum vom Client mitgeschickten MIME-Typ
 * (Prüfbefund admin-photo, Punkt 3): `file.type` ist unquestioniert der
 * Content-Type des multipart-Teils und lässt sich beliebig gegen den
 * tatsächlichen Dateiinhalt fälschen - relevant, weil die hochgeladene Datei
 * anschliessend öffentlich (GET /api/photos/[id]) ausgeliefert wird. Prüft
 * nur so viele Bytes, wie für die jeweilige Signatur nötig sind, ein kurzer
 * Test-Fixture-Buffer reicht daher für jede der drei Signaturen.
 *
 * - JPEG: FF D8 FF
 * - PNG:  89 50 4E 47 (der Rest der 8-Byte-PNG-Signatur, 0D 0A 1A 0A, wird
 *   bewusst nicht zusätzlich verlangt - die ersten vier Bytes reichen, um
 *   ein PNG von den anderen beiden Formaten zu unterscheiden)
 * - WebP: "RIFF" (Byte 0-3) ... "WEBP" (Byte 8-11), RIFF-Container-Format
 */
export function detectImageExtension(buffer: Buffer): "jpg" | "png" | "webp" | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
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

interface FamilyListRow {
  id: string;
  slug: string;
  name: string;
  brand: string;
  photo_url: string | null;
  has_pricelist: boolean;
  active: boolean;
  sort: number;
  model_count: number;
  product_count: number;
}

export async function getFamiliesForAdmin(): Promise<AdminFamilyListItem[]> {
  const rows = await sql<FamilyListRow[]>`
    select
      f.id, f.slug, f.name, f.brand, f.photo_url, f.has_pricelist, f.active, f.sort,
      (select count(*) from models m where m.family_id = f.id and m.active) as model_count,
      (select count(*) from products p where p.family_id = f.id and p.active) as product_count
    from model_families f
  `;

  return rows
    .map((f) => ({
      id: f.id,
      slug: f.slug,
      name: f.name,
      brand: f.brand as Brand,
      photoUrl: f.photo_url,
      hasPricelist: f.has_pricelist,
      active: f.active,
      sort: f.sort,
      modelCount: f.model_count,
      productCount: f.product_count,
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

interface FamilyDetailRow {
  id: string;
  slug: string;
  name: string;
  brand: string;
  codes: string[];
  has_pricelist: boolean;
  active: boolean;
  sort: number;
  short_text: string | null;
  photo_url: string | null;
}

interface ModelDetailRow {
  id: string;
  slug: string;
  name: string;
  fuel: string | null;
  series_ps: number | null;
  series_nm: number | null;
  series_ps_suggested: number[];
  sort: number;
  active: boolean;
  // Trefferzahl aus product_fitment PLUS fits_all-Produkte der Familie (kein
  // eigener product_fitment-Eintrag), wie im Kundenflow (lib/catalog/
  // queries.ts loadFittingProducts()): pro Modell separat berechnet, damit
  // sich fits_all korrekt für jedes Modell derselben Familie addiert.
  product_count: number;
}

export async function getFamilyDetailForAdmin(slug: string): Promise<AdminFamilyDetail | null> {
  const [family] = await sql<FamilyDetailRow[]>`
    select id, slug, name, brand, codes, has_pricelist, active, sort, short_text, photo_url
    from model_families
    where slug = ${slug}
  `;
  if (!family) return null;

  const models = await sql<ModelDetailRow[]>`
    select
      m.id, m.slug, m.name, m.fuel, m.series_ps, m.series_nm, m.series_ps_suggested, m.sort, m.active,
      (
        (select count(*) from product_fitment pf
          join products p on p.id = pf.product_id
          where pf.model_id = m.id and p.active)
        +
        (select count(*) from products p
          where p.family_id = m.family_id and p.active and p.fits_all)
      ) as product_count
    from models m
    where m.family_id = ${family.id}
    order by m.sort asc, m.name asc
  `;

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
    models: models.map((m) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      fuel: m.fuel as Fuel | null,
      seriesPs: m.series_ps,
      seriesNm: m.series_nm,
      seriesPsSuggested: m.series_ps_suggested,
      sort: m.sort,
      active: m.active,
      productCount: m.product_count,
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
export async function updateFamilyMeta(familyId: string, patch: FamilyMetaPatch): Promise<void> {
  const [family] = await sql<{ has_pricelist: boolean }[]>`
    select has_pricelist from model_families where id = ${familyId}
  `;
  if (!family) throw new Error(`Baureihe speichern fehlgeschlagen: ${familyId} nicht gefunden.`);

  const name = patch.name !== undefined && !family.has_pricelist ? patch.name : undefined;
  if (
    patch.shortText === undefined &&
    patch.sort === undefined &&
    patch.active === undefined &&
    name === undefined
  ) {
    return;
  }

  await sql`
    update model_families
    set
      short_text = ${patch.shortText !== undefined ? patch.shortText : sql`short_text`},
      sort = ${patch.sort !== undefined ? patch.sort : sql`sort`},
      active = ${patch.active !== undefined ? patch.active : sql`active`},
      name = ${name !== undefined ? name : sql`name`}
    where id = ${familyId}
  `;
}

export interface ModelPatch {
  seriesPs?: number | null;
  seriesNm?: number | null;
  active?: boolean;
}

export async function updateModel(modelId: string, patch: ModelPatch): Promise<void> {
  if (patch.seriesPs === undefined && patch.seriesNm === undefined && patch.active === undefined) {
    return;
  }

  await sql`
    update models
    set
      series_ps = ${patch.seriesPs !== undefined ? patch.seriesPs : sql`series_ps`},
      series_nm = ${patch.seriesNm !== undefined ? patch.seriesNm : sql`series_nm`},
      active = ${patch.active !== undefined ? patch.active : sql`active`}
    where id = ${modelId}
  `;
}

/** Nur für die Foto-Route: liefert slug + aktuelle photo_url einer Baureihe. */
export async function getFamilyForPhoto(
  familyId: string,
): Promise<{ id: string; slug: string; photoUrl: string | null } | null> {
  const [row] = await sql<{ id: string; slug: string; photo_url: string | null }[]>`
    select id, slug, photo_url from model_families where id = ${familyId}
  `;
  return row ? { id: row.id, slug: row.slug, photoUrl: row.photo_url } : null;
}

export async function setFamilyPhotoUrl(familyId: string, photoUrl: string | null): Promise<void> {
  await sql`update model_families set photo_url = ${photoUrl} where id = ${familyId}`;
}
