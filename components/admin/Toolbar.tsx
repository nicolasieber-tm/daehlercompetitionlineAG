import type { ReactNode } from "react";

/** Seitenkopf: Titel + optionaler Untertitel links, Aktionen rechts (Übersicht, Detail, Einstellungen). */
export function Toolbar({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
      <div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-text">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
