import Link from "next/link";
import { admin } from "@/lib/i18n/admin";
import type { InquiryStatus } from "@/lib/db/rows";
import type { FamilyFilterOption } from "@/lib/admin/inquiries";

// Filterleiste der Übersicht: Status-Chips als reine Links (kein Client-JS
// nötig, ein Klick navigiert direkt zur gefilterten URL), Baureihe/Zeitraum/
// Suche als ein GET-Formular (native Navigation, siehe app/admin/page.tsx:
// Server Component liest searchParams direkt). Setzt bei jeder Änderung auf
// Seite 1 zurück (page bleibt daher bewusst aus buildHref draussen).
const STATUS_ORDER: InquiryStatus[] = ["neu", "in_bearbeitung", "beantwortet", "abgeschlossen"];

export interface FilterBarValues {
  status?: string;
  familyId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

function buildHref(values: FilterBarValues): string {
  const params = new URLSearchParams();
  if (values.status && values.status !== "alle") params.set("status", values.status);
  if (values.familyId) params.set("family", values.familyId);
  if (values.dateFrom) params.set("from", values.dateFrom);
  if (values.dateTo) params.set("to", values.dateTo);
  if (values.search) params.set("q", values.search);
  const qs = params.toString();
  return qs ? `/admin?${qs}` : "/admin";
}

export function FilterBar({
  values,
  familyOptions,
}: {
  values: FilterBarValues;
  familyOptions: FamilyFilterOption[];
}) {
  const currentStatus = values.status && values.status !== "alle" ? values.status : "alle";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label={admin.list.columns.status}>
        <Link
          href={buildHref({ ...values, status: undefined })}
          aria-current={currentStatus === "alle" ? "true" : undefined}
          className={[
            "rounded-full border px-4 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.06em] transition-colors",
            currentStatus === "alle"
              ? "border-red bg-red text-white"
              : "border-line-alt text-muted hover:border-muted hover:text-text",
          ].join(" ")}
        >
          {admin.list.filters.statusAll}
        </Link>
        {STATUS_ORDER.map((status) => (
          <Link
            key={status}
            href={buildHref({ ...values, status })}
            aria-current={currentStatus === status ? "true" : undefined}
            className={[
              "rounded-full border px-4 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.06em] transition-colors",
              currentStatus === status
                ? "border-red bg-red text-white"
                : "border-line-alt text-muted hover:border-muted hover:text-text",
            ].join(" ")}
          >
            {admin.status[status]}
          </Link>
        ))}
      </div>

      <form method="get" action="/admin" className="flex flex-wrap items-end gap-3">
        {currentStatus !== "alle" && <input type="hidden" name="status" value={currentStatus} />}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-family" className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            {admin.list.filters.family}
          </label>
          <select
            id="filter-family"
            name="family"
            defaultValue={values.familyId ?? ""}
            className="w-full min-w-[180px] rounded-[2px] border border-line-alt bg-bg px-2.5 py-2 text-sm text-text"
          >
            <option value="">{admin.list.filters.familyAll}</option>
            {familyOptions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-from" className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            {admin.list.filters.dateFrom}
          </label>
          <input
            id="filter-from"
            type="date"
            name="from"
            defaultValue={values.dateFrom ?? ""}
            className="rounded-[2px] border border-line-alt bg-bg px-2.5 py-2 text-sm text-text"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-to" className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            {admin.list.filters.dateTo}
          </label>
          <input
            id="filter-to"
            type="date"
            name="to"
            defaultValue={values.dateTo ?? ""}
            className="rounded-[2px] border border-line-alt bg-bg px-2.5 py-2 text-sm text-text"
          />
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <label htmlFor="filter-q" className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            {admin.list.filters.search}
          </label>
          <input
            id="filter-q"
            type="search"
            name="q"
            defaultValue={values.search ?? ""}
            placeholder={admin.list.filters.searchPlaceholder}
            className="w-full rounded-[2px] border border-line-alt bg-bg px-2.5 py-2 text-sm text-text placeholder:text-dim"
          />
        </div>
        <button
          type="submit"
          className="rounded-[2px] bg-red px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.08em] text-white hover:bg-red-bright"
        >
          {admin.list.filters.submit}
        </button>
        <Link
          href="/admin"
          className="rounded-[2px] border border-line-alt px-4 py-2 font-display text-sm font-semibold uppercase tracking-[0.08em] text-muted hover:border-muted hover:text-text"
        >
          {admin.list.filters.reset}
        </Link>
      </form>
    </div>
  );
}
