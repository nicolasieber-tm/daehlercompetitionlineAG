// Übersetzungen (Posten 4, Entscheid 21.09.2026): englische Fassung der
// deutschen Excel-Produkttexte prüfen und korrigieren. Server Component:
// Filter/Suche/Seite aus den URL-Parametern (reine GET-Links wie die
// Anfragen-Übersicht), Daten über lib/translations/store.ts
// listTranslations(); Speichern und «Fehlende übersetzen» laufen über
// app/admin/actions/translations.ts.
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { admin } from "@/lib/i18n/admin";
import { tf } from "@/lib/i18n/dictionaries";
import { listTranslations, type TranslationFilter } from "@/lib/translations/store";
import { hasApiKey } from "@/lib/translations/sync";
import { Toolbar } from "@/components/admin/Toolbar";
import { TranslateMissingButton } from "@/components/admin/TranslateMissingButton";
import { TranslationsFilter } from "@/components/admin/TranslationsFilter";
import { TranslationsTable } from "@/components/admin/TranslationsTable";

export const metadata: Metadata = { title: `${admin.translations.title} – Admin` };

const t = admin.translations;
const FILTERS: TranslationFilter[] = ["all", "auto", "manual", "missing"];

function parseFilter(value: string | undefined): TranslationFilter {
  return FILTERS.includes(value as TranslationFilter) ? (value as TranslationFilter) : "all";
}

function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function buildHref(filter: TranslationFilter, search: string, page: number): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/uebersetzungen?${qs}` : "/admin/uebersetzungen";
}

export default async function AdminTranslationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const filter = parseFilter(one(params.filter));
  const search = (one(params.q) ?? "").trim();
  const page = parsePage(one(params.page));

  const result = await listTranslations({ locale: "en", filter, search, page, pageSize: 100 });
  const { stats } = result;

  return (
    <>
      <Toolbar
        title={t.title}
        subtitle={t.subtitle}
        actions={<TranslateMissingButton missing={stats.missing} apiKeyAvailable={hasApiKey()} />}
      />

      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        <li>{tf(t.stats.total, { count: stats.total })}</li>
        <li className="text-ok">{tf(t.stats.translated, { count: stats.translated })}</li>
        <li>{tf(t.stats.auto, { count: stats.auto })}</li>
        <li>{tf(t.stats.manual, { count: stats.manual })}</li>
        <li className={stats.missing > 0 ? "text-warn" : undefined}>{tf(t.stats.missing, { count: stats.missing })}</li>
      </ul>

      <TranslationsFilter filter={filter} search={search} />

      <TranslationsTable rows={result.rows} />

      {result.pageCount <= 1 ? (
        <p className="text-xs text-dim">{tf(t.pagination.total, { count: result.total })}</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-xs text-dim">{tf(t.pagination.total, { count: result.total })}</p>
          <nav className="flex items-center gap-3" aria-label="Pagination">
            {result.page > 1 ? (
              <Link href={buildHref(filter, search, result.page - 1)} className="text-red-bright hover:underline">
                {t.pagination.prev}
              </Link>
            ) : (
              <span className="text-dim">{t.pagination.prev}</span>
            )}
            <span className="text-muted">{tf(t.pagination.pageOf, { page: result.page, total: result.pageCount })}</span>
            {result.page < result.pageCount ? (
              <Link href={buildHref(filter, search, result.page + 1)} className="text-red-bright hover:underline">
                {t.pagination.next}
              </Link>
            ) : (
              <span className="text-dim">{t.pagination.next}</span>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
