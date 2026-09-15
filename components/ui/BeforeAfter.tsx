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
 * Vorher/Nachher-Tabelle wie .ba in der Vorschau. Ab 600px die bisherige
 * dreispaltige Zeile (Kategorie/Vorher/Nachher). Unter 600px (Prüfbefund
 * flow, Punkt 7) fiel die Kategorie-Spalte bisher ganz weg - der Kunde sah
 * nur noch zwei Werte ohne erkennbaren Bezug, welche Position sie betreffen.
 * Jetzt gestapelt: Kategoriename als kleine Überschrift, darunter
 * "Vorher → Nachher" in einer Zeile. Beide Varianten liegen pro Zeile im
 * Markup, je eine wird per sm2:hidden/hidden sm2:grid ein-/ausgeblendet
 * (keine Breakpoint-Logik in JS nötig). Eigener Breakpoint --breakpoint-sm2
 * (app/globals.css), weil Tailwinds sm (640px) hier zu spät umbrechen würde.
 */
export function BeforeAfter({ beforeLabel, afterLabel, rows }: BeforeAfterProps) {
  return (
    <div className="mt-6 border border-line bg-panel">
      {/* Tabellenkopf mit Vorher/Nachher-Spaltenüberschriften nur ab 600px -
          darunter trägt jede Zeile ihre eigene Beschriftung (Pfeil), ein
          gemeinsamer Kopf ohne Kategorie-Spalte wäre dort ohne Bezug. */}
      <div className="hidden border-b border-line px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.1em] text-muted sm2:grid sm2:grid-cols-[120px_1fr_1fr] sm2:gap-3">
        <span />
        <span>{beforeLabel}</span>
        <span className="text-red-bright">{afterLabel}</span>
      </div>
      {rows.map((row) => (
        <div key={row.key} className="border-b border-line px-4 py-[11px] text-[15px] last:border-b-0">
          <div className="sm2:hidden">
            <div className="font-display text-xs font-semibold uppercase tracking-[0.06em] text-muted">
              {row.category}
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="min-w-0 break-words [overflow-wrap:anywhere] text-dim">{row.before}</span>
              <span aria-hidden="true" className="text-dim">
                →
              </span>
              <span className="min-w-0 break-words [overflow-wrap:anywhere] text-text">{row.after}</span>
            </div>
          </div>
          <div className="hidden items-baseline gap-3 sm2:grid sm2:grid-cols-[120px_1fr_1fr]">
            <span className="min-w-0 font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted">
              {row.category}
            </span>
            <span className="min-w-0 break-words [overflow-wrap:anywhere] text-dim">{row.before}</span>
            <span className="min-w-0 break-words [overflow-wrap:anywhere] text-text">{row.after}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
