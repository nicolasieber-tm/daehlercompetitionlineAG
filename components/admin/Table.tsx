import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

// Gemeinsame Tabellen-Optik für Übersicht, Mail-Protokoll und Follow-ups:
// overflow-x auto (docs/architektur.md "Tabellen mit overflow-x: auto"),
// Panel-Hintergrund, Kopfzeile in Panel-Alt.
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[2px] border border-line bg-panel">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-line bg-panel-alt text-xs font-semibold uppercase tracking-[0.08em] text-muted">
      <tr>{children}</tr>
    </thead>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function Th({ children, className = "", ...props }: ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <th {...props} className={`px-4 py-3 font-semibold ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = "", ...props }: TdHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <td {...props} className={`px-4 py-3 align-top text-text ${className}`}>
      {children}
    </td>
  );
}
