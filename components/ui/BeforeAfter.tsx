import type { ReactNode } from "react";

export type BeforeAfterRow = {
  key: string;
  category: ReactNode;
  before: ReactNode;
  after: ReactNode;
};

export type BeforeAfterProps = {
  beforeLabel: ReactNode;
  afterLabel: ReactNode;
  rows: BeforeAfterRow[];
};

/**
 * Vorher/Nachher-Tabelle wie .ba in der Vorschau. Unter 600px fällt die
 * Kategorie-Spalte weg (Tabelle wird zweispaltig), Tabellenkopf bleibt
 * sichtbar. Eigener Breakpoint --breakpoint-sm2 (app/globals.css), weil
 * Tailwinds sm (640px) hier zu spät umbrechen würde.
 */
export function BeforeAfter({ beforeLabel, afterLabel, rows }: BeforeAfterProps) {
  return (
    <div className="mt-6 border border-line bg-panel">
      <div className="grid grid-cols-2 gap-3 border-b border-line px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.1em] text-muted sm2:grid-cols-[120px_1fr_1fr]">
        <span className="hidden sm2:block" />
        <span>{beforeLabel}</span>
        <span className="text-red-bright">{afterLabel}</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid grid-cols-2 items-baseline gap-3 border-b border-line px-4 py-[11px] text-[15px] last:border-b-0 sm2:grid-cols-[120px_1fr_1fr]"
        >
          <span className="hidden font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted sm2:block">
            {row.category}
          </span>
          <span className="text-dim">{row.before}</span>
          <span className="text-text">{row.after}</span>
        </div>
      ))}
    </div>
  );
}
