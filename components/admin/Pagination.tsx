import Link from "next/link";
import { admin } from "@/lib/i18n/admin";
import { tf } from "@/lib/i18n/dictionaries";
import type { FilterBarValues } from "./FilterBar";

function buildHref(values: FilterBarValues, page: number): string {
  const params = new URLSearchParams();
  if (values.status && values.status !== "alle") params.set("status", values.status);
  if (values.familyId) params.set("family", values.familyId);
  if (values.dateFrom) params.set("from", values.dateFrom);
  if (values.dateTo) params.set("to", values.dateTo);
  if (values.search) params.set("q", values.search);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin?${qs}` : "/admin";
}

export function Pagination({
  page,
  pageCount,
  total,
  values,
}: {
  page: number;
  pageCount: number;
  total: number;
  values: FilterBarValues;
}) {
  if (pageCount <= 1) {
    return <p className="text-xs text-dim">{tf(admin.list.pagination.total, { count: total })}</p>;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-xs text-dim">{tf(admin.list.pagination.total, { count: total })}</p>
      <nav className="flex items-center gap-3" aria-label="Pagination">
        {page > 1 ? (
          <Link href={buildHref(values, page - 1)} className="text-red-bright hover:underline">
            {admin.list.pagination.prev}
          </Link>
        ) : (
          <span className="text-dim">{admin.list.pagination.prev}</span>
        )}
        <span className="text-muted">{tf(admin.list.pagination.pageOf, { page, total: pageCount })}</span>
        {page < pageCount ? (
          <Link href={buildHref(values, page + 1)} className="text-red-bright hover:underline">
            {admin.list.pagination.next}
          </Link>
        ) : (
          <span className="text-dim">{admin.list.pagination.next}</span>
        )}
      </nav>
    </div>
  );
}
