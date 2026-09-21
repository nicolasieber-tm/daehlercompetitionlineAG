// Datenzugriff für product_translations (db/migrations/0006) und das
// Sammeln der Katalog-Quelltexte. Über den einzigen serverseitigen
// Postgres-Pool (lib/db/client.ts). Reine Text-Logik liegt in resolve.ts/
// texts.ts, der Modellaufruf in ai.ts, der Lauf in sync.ts.
import { sql } from "@/lib/db/client";
import type { Locale } from "@/lib/i18n/dictionaries";
import { normalizeSourceText, type TranslationMap } from "./resolve";
import { collectSourceTexts, type SourceText, type SourceTextKind } from "./texts";

export type TranslationLocale = Exclude<Locale, "de">;
export type TranslationOrigin = "auto" | "manual";

// ---------------------------------------------------------------------------
// Nachschlagen
// ---------------------------------------------------------------------------

/** Map (normalisierter Quelltext -> Übersetzung) für genau diese Texte. Leer, wenn nichts bekannt ist. */
export async function getTranslationMap(locale: TranslationLocale, sourceTexts: readonly string[]): Promise<TranslationMap> {
  const keys = [...new Set(sourceTexts.map(normalizeSourceText).filter(Boolean))];
  if (keys.length === 0) return {};
  const rows = await sql<{ source_text: string; translated_text: string }[]>`
    select source_text, translated_text from product_translations
    where locale = ${locale} and source_text = any(${keys}::text[])
  `;
  const map: TranslationMap = {};
  for (const r of rows) map[r.source_text] = r.translated_text;
  return map;
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

export interface AutoTranslationEntry {
  source: string;
  translated: string;
}

/**
 * Automatische Übersetzungen ablegen. Bestehende manuelle Einträge (origin
 * 'manual') werden NIE überschrieben - eine Korrektur im Admin überlebt
 * jeden späteren Lauf. Liefert die Anzahl tatsächlich geschriebener Zeilen.
 */
export async function upsertAutoTranslations(
  locale: TranslationLocale,
  entries: readonly AutoTranslationEntry[],
  model: string | null,
): Promise<number> {
  const rows: { locale: string; source_text: string; translated_text: string; origin: string; model: string | null }[] = entries
    .map((e) => ({
      locale,
      source_text: normalizeSourceText(e.source),
      translated_text: e.translated.trim(),
      origin: "auto",
      model,
    }))
    .filter((r) => r.source_text && r.translated_text);
  if (rows.length === 0) return 0;
  // result.count = eingefügte plus tatsächlich aktualisierte Zeilen (die
  // where-Klausel lässt manuelle Einträge aus, sie zählen nicht mit).
  const result = await sql`
    insert into product_translations ${sql(rows, "locale", "source_text", "translated_text", "origin", "model")}
    on conflict (locale, source_text) do update
      set translated_text = excluded.translated_text, model = excluded.model
      where product_translations.origin = 'auto'
  `;
  return result.count;
}

/**
 * Manuelle Übersetzung aus dem Admin. Leerer Text löscht den Eintrag (der
 * Flow zeigt dann wieder Deutsch, und der nächste automatische Lauf
 * übersetzt den Text erneut).
 */
export async function saveManualTranslation(locale: TranslationLocale, source: string, translated: string): Promise<void> {
  const key = normalizeSourceText(source);
  if (!key) throw new Error("saveManualTranslation: leerer Quelltext.");
  const value = normalizeSourceText(translated);
  if (!value) {
    await sql`delete from product_translations where locale = ${locale} and source_text = ${key}`;
    return;
  }
  await sql`
    insert into product_translations (locale, source_text, translated_text, origin, model)
    values (${locale}, ${key}, ${value}, 'manual', null)
    on conflict (locale, source_text) do update
      set translated_text = excluded.translated_text, origin = 'manual', model = null
  `;
}

/** Nur für Tests/Aufräumen: löscht Einträge, deren Quelltext mit `prefix` beginnt. */
export async function deleteTranslationsBySourcePrefix(locale: TranslationLocale, prefix: string): Promise<void> {
  await sql`delete from product_translations where locale = ${locale} and source_text like ${prefix + "%"}`;
}

// ---------------------------------------------------------------------------
// Katalog-Quelltexte (alle aktiven Produkte aktiver Familien + Hinweise)
// ---------------------------------------------------------------------------

export interface CatalogSourceText extends SourceText {
  /** Wie oft der Text im aktiven Katalog vorkommt (Produkte/Gruppen/Hinweise). */
  count: number;
}

export async function collectCatalogSourceTexts(): Promise<CatalogSourceText[]> {
  const products = await sql<
    {
      name: string;
      description: string | null;
      variant_group: string | null;
      ps_to: number | null;
      nm_to: number | null;
      group_label: string | null;
      source_category: string | null;
    }[]
  >`
    select p.name, p.description, p.variant_group, p.ps_to, p.nm_to, p.group_label, p.source_category
    from products p
    join model_families mf on mf.id = p.family_id
    where p.active = true and mf.active = true
  `;
  const notes = await sql<{ text: string }[]>`
    select n.text from pricelist_notes n
    join model_families mf on mf.id = n.family_id
    where mf.active = true
  `;

  // Vorkommen zählen: je Produkt einzeln sammeln (collectSourceTexts
  // dedupliziert sonst schon innerhalb der Liste).
  const counts = new Map<string, CatalogSourceText>();
  const add = (t: SourceText) => {
    const existing = counts.get(t.text);
    if (existing) existing.count += 1;
    else counts.set(t.text, { ...t, count: 1 });
  };
  for (const p of products) for (const t of collectSourceTexts({ products: [p] })) add(t);
  for (const n of notes) for (const t of collectSourceTexts({ products: [], notes: [n.text] })) add(t);
  return [...counts.values()];
}

// ---------------------------------------------------------------------------
// Admin-Ansicht und Statistik
// ---------------------------------------------------------------------------

export type TranslationFilter = "all" | "auto" | "manual" | "missing";

export interface TranslationListEntry {
  source: string;
  kind: SourceTextKind;
  count: number;
  translated: string | null;
  origin: TranslationOrigin | null;
  updatedAt: string | null;
}

export interface TranslationStats {
  total: number;
  translated: number;
  auto: number;
  manual: number;
  missing: number;
}

export interface TranslationListResult {
  rows: TranslationListEntry[];
  total: number;
  page: number;
  pageCount: number;
  stats: TranslationStats;
}

const KIND_ORDER: Record<SourceTextKind, number> = { category: 0, group: 1, name: 2, detail: 3, description: 4, note: 5 };

/** Alle Katalog-Quelltexte samt Übersetzungsstand (Join in JS, ~1'000 Texte). */
export async function listTranslations(params: {
  locale: TranslationLocale;
  filter?: TranslationFilter;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<TranslationListResult> {
  const filter = params.filter ?? "all";
  const pageSize = Math.max(1, Math.min(params.pageSize ?? 100, 500));
  const search = (params.search ?? "").trim().toLowerCase();

  const catalog = await collectCatalogSourceTexts();
  const keys = catalog.map((c) => c.text);
  const rows = keys.length
    ? await sql<{ source_text: string; translated_text: string; origin: string; updated_at: string }[]>`
        select source_text, translated_text, origin, updated_at from product_translations
        where locale = ${params.locale} and source_text = any(${keys}::text[])
      `
    : [];
  const byKey = new Map(rows.map((r) => [r.source_text, r]));

  const all: TranslationListEntry[] = catalog
    .map((c) => {
      const hit = byKey.get(c.text);
      return {
        source: c.text,
        kind: c.kind,
        count: c.count,
        translated: hit?.translated_text ?? null,
        origin: (hit?.origin as TranslationOrigin | undefined) ?? null,
        updatedAt: hit?.updated_at ?? null,
      };
    })
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.count - a.count || a.source.localeCompare(b.source, "de-CH"));

  const stats: TranslationStats = {
    total: all.length,
    translated: all.filter((e) => e.translated != null).length,
    auto: all.filter((e) => e.origin === "auto").length,
    manual: all.filter((e) => e.origin === "manual").length,
    missing: all.filter((e) => e.translated == null).length,
  };

  const filtered = all.filter((e) => {
    if (filter === "auto" && e.origin !== "auto") return false;
    if (filter === "manual" && e.origin !== "manual") return false;
    if (filter === "missing" && e.translated != null) return false;
    if (search) {
      const haystack = `${e.source}\n${e.translated ?? ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, params.page ?? 1), pageCount);
  const start = (page - 1) * pageSize;

  return { rows: filtered.slice(start, start + pageSize), total: filtered.length, page, pageCount, stats };
}

/** Quelltexte des Katalogs, für die noch keine Übersetzung existiert. */
export async function findMissingSourceTexts(locale: TranslationLocale): Promise<CatalogSourceText[]> {
  const catalog = await collectCatalogSourceTexts();
  if (catalog.length === 0) return [];
  const keys = catalog.map((c) => c.text);
  const known = await sql<{ source_text: string }[]>`
    select source_text from product_translations
    where locale = ${locale} and source_text = any(${keys}::text[])
  `;
  const knownSet = new Set(known.map((k) => k.source_text));
  return catalog.filter((c) => !knownSet.has(c.text));
}
