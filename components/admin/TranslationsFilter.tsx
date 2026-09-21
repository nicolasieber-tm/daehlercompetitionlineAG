// Filter/Suche der Übersetzungen-Seite: reines GET-Formular (wie
// components/admin/FilterBar.tsx), kein Client-JS nötig.
import { admin } from "@/lib/i18n/admin";
import type { TranslationFilter } from "@/lib/translations/store";

const t = admin.translations.filter;
const OPTIONS: { value: TranslationFilter; label: string }[] = [
  { value: "all", label: t.all },
  { value: "auto", label: t.auto },
  { value: "manual", label: t.manual },
  { value: "missing", label: t.missing },
];

const CONTROL_CLASSES =
  "rounded-[2px] border border-line-alt bg-bg px-2.5 py-2 text-sm text-text placeholder:text-dim " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-bright focus-visible:outline-offset-2";

export function TranslationsFilter({ filter, search }: { filter: TranslationFilter; search: string }) {
  return (
    <form method="get" action="/admin/uebersetzungen" className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{t.label}</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t.label}>
          {OPTIONS.map((o) => (
            <label
              key={o.value}
              className={[
                "inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 font-display text-[13px] font-semibold uppercase tracking-[0.06em]",
                filter === o.value ? "border-red bg-red text-white" : "border-line-alt text-muted hover:border-muted hover:text-text",
              ].join(" ")}
            >
              <input type="radio" name="filter" value={o.value} defaultChecked={filter === o.value} className="sr-only" />
              {o.label}
            </label>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{t.search}</span>
        <input type="search" name="q" defaultValue={search} placeholder={t.searchPlaceholder} className={`${CONTROL_CLASSES} w-64`} />
      </label>
      <button
        type="submit"
        className="rounded-[2px] border border-line-alt px-3 py-2 font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-text hover:border-muted"
      >
        {t.apply}
      </button>
      {filter !== "all" || search ? (
        <a href="/admin/uebersetzungen" className="py-2 text-sm text-red-bright hover:underline">
          {t.reset}
        </a>
      ) : null}
    </form>
  );
}
