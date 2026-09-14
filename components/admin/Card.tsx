import type { ReactNode } from "react";

/** Panel-Karte wie .intern > div in docs/vorschau.html: Titel-Zeile + Inhalt. */
export function Card({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    // min-w-0: jede Card ist ein direktes Kind des flex-col-Containers in
    // components/admin/Shell.tsx (<main> -> <div className="flex flex-col
    // ...">{children}</div>), also selbst ein Flex-Item. Ohne min-w-0 bleibt
    // ein Flex-Item per Default auf sein min-content begrenzt (Prüfbefund
    // admin-shell, Punkt 3, dieselbe Fehlklasse wie <main> selbst) - eine
    // Tabelle mit min-w-[640px] und mehreren whitespace-nowrap-Spalten
    // (components/admin/Table.tsx, hier z.B. das Mail-Protokoll,
    // MailLog.tsx) braucht dann u.U. mehr als 640px min-content und weitet
    // damit die ganze Card (und den Flex-Container, also die Seite) auf,
    // statt dass die overflow-x-auto-Hülle der Tabelle intern scrollt.
    <section className="min-w-0 border border-line bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-muted">{title}</h2>
        {actions}
      </div>
      <div className="min-w-0 p-5">{children}</div>
    </section>
  );
}
