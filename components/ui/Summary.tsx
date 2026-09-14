import type { ReactNode } from "react";

export type SummaryLine = {
  key: string;
  category: ReactNode;
  name: ReactNode;
  detail?: ReactNode;
  price: ReactNode;
};

export type SummaryProps = {
  header: ReactNode;
  headerMeta?: ReactNode;
  lines: SummaryLine[];
  totalLabel: ReactNode;
  totalValue: ReactNode;
};

/** Zusammenfassungsbox wie .summary in der Vorschau: Kopfzeile, Positionen, Summe. */
export function Summary({ header, headerMeta, lines, totalLabel, totalValue }: SummaryProps) {
  return (
    <div className="mt-6 border border-line bg-panel">
      <div className="flex justify-between border-b border-line px-4 py-3 font-display text-xs font-semibold uppercase tracking-[0.1em] text-muted">
        <span>{header}</span>
        {headerMeta ? <span>{headerMeta}</span> : null}
      </div>
      <ul className="grid gap-0 py-1.5">
        {lines.map((line) => (
          <li
            key={line.key}
            className="flex justify-between gap-4 border-b border-line px-4 py-2.5 text-[15px] last:border-b-0"
          >
            <div className="min-w-0 break-words [overflow-wrap:anywhere]">
              <span className="text-muted">{line.category}</span> {line.name}
              {line.detail ? <span className="text-muted"> · {line.detail}</span> : null}
            </div>
            <em className="shrink-0 whitespace-nowrap font-mono text-[13px] not-italic tabular-nums">{line.price}</em>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t-2 border-red bg-bg-alt px-4 py-3.5">
        <span className="text-[13px] text-muted">{totalLabel}</span>
        <b className="font-display text-3xl font-bold tabular-nums">{totalValue}</b>
      </div>
    </div>
  );
}
