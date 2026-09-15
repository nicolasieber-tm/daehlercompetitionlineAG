"use client";

// Hält die offenen Preislisten-Importe (pending) und, getrennt davon, das
// Ergebnis einer gerade erfolgten Übernahme.
//
// Prüfbefund admin-pricelists/politur, Punkt 1: applyPendingImportAction()
// (app/admin/actions/pricelists.ts) ruft revalidatePath()/revalidateTag()
// auf (lib/pricelist/imports.ts applyPendingImport()). Next liefert dadurch
// im selben Response bereits den neu gerenderten Seitenbaum mit: der
// übernommene Import ist sofort aus `pending` verschwunden. Hielte die
// PricelistDiffCard das ApplyResult selbst (wie zuvor), würde sie in
// exakt demselben Render-Durchgang unmountet, in dem sie ihr eigenes
// Ergebnis erst setzt - das Panel blitzt nur kurz auf und verschwindet
// wieder (siehe Bericht, Playwright-Beleg mit MutationObserver).
//
// Fix: Dieses Board bleibt über die Übernahme hinweg gemountet, sein
// eigener State (`applied`) ist unabhängig vom serverseitig aktualisierten
// `pending`-Prop. Der Callback onApplied() der Karte setzt State HIER,
// nicht in der Karte - dieser State überlebt das Unmounten der Karte, weil
// er nicht am unmountenden Knoten hängt. Das Ergebnis-Panel bleibt sichtbar,
// bis der Admin es schliesst.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { admin } from "@/lib/i18n/admin";
import { tf } from "@/lib/i18n/dictionaries";
import { formatDate } from "@/lib/i18n/format";
import type { ApplyResult } from "@/lib/pricelist/apply";
import type { PendingImportRow } from "@/lib/admin/pricelists";
import { PricelistDiffCard, ApplyResultPanel } from "./PricelistDiffCard";

const t = admin.pricelists;

interface AppliedEntry {
  filenames: string[];
  createdAt: string;
  result: ApplyResult;
}

export function PendingImportsBoard({ pending }: { pending: PendingImportRow[] }) {
  const router = useRouter();
  const [applied, setApplied] = useState<Record<string, AppliedEntry>>({});

  function handleApplied(row: PendingImportRow, result: ApplyResult) {
    setApplied((prev) => ({ ...prev, [row.id]: { filenames: row.filenames, createdAt: row.createdAt, result } }));
  }

  function handleCloseResult(importId: string) {
    setApplied((prev) => {
      if (!(importId in prev)) return prev;
      const next = { ...prev };
      delete next[importId];
      return next;
    });
    router.refresh();
  }

  const appliedEntries = Object.entries(applied);

  if (pending.length === 0 && appliedEntries.length === 0) {
    return <p className="text-sm text-muted">{t.pending.empty}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {pending.map((p) => (
        <PricelistDiffCard
          key={p.id}
          importId={p.id}
          filenames={p.filenames}
          createdAt={p.createdAt}
          diff={p.diff}
          onApplied={(result) => handleApplied(p, result)}
        />
      ))}
      {appliedEntries.map(([importId, entry]) => (
        <section key={importId} className="min-w-0 border border-line bg-panel">
          <div className="border-b border-line px-5 py-3">
            <p className="text-sm font-semibold text-text">{tf(t.pending.files, { files: entry.filenames.join(", ") })}</p>
            <p className="text-xs text-dim">{tf(t.pending.uploadedAt, { date: formatDate(new Date(entry.createdAt), "de") })}</p>
          </div>
          <div className="p-5">
            <ApplyResultPanel result={entry.result} onClose={() => handleCloseResult(importId)} />
          </div>
        </section>
      ))}
    </div>
  );
}
