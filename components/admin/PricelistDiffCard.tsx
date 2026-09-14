"use client";

// Diff-Ansicht eines offenen (pending) Preislisten-Imports: Zähler oben,
// je Baureihe aufklappbar (neue/geänderte/entfernte Produkte, neue/entfernte
// Modelle, Parser-Warnungen), «Übernehmen» und «Verwerfen». Siehe
// docs/architektur.md, Abschnitt "Excel-Import im Admin", und
// lib/pricelist/types.ts (ImportDiff/FamilyDiff-Struktur).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { admin } from "@/lib/i18n/admin";
import { tf } from "@/lib/i18n/dictionaries";
import { formatDate } from "@/lib/i18n/format";
import { chf } from "@/lib/i18n/format";
import type { FamilyDiff, ImportDiff } from "@/lib/pricelist/types";
import type { ApplyResult } from "@/lib/pricelist/apply";
import { Button } from "@/components/ui";
import { applyPendingImportAction, discardImportAction } from "@/app/admin/actions/pricelists";
import { useToast } from "./Toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { Table, TableHead, TableBody, Th, Td } from "./Table";

const t = admin.pricelists;

function fitsText(value: unknown): string {
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "-";
  return String(value ?? "-");
}

function fieldValueText(field: string, value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (field === "fits") return fitsText(value);
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "-";
  if (field === "price_status") {
    return admin.priceStatus[value as keyof typeof admin.priceStatus] ?? String(value);
  }
  if (field.startsWith("price_") && field !== "price_status" && field !== "price_note" && typeof value === "number") {
    return chf(value);
  }
  return String(value);
}

function fieldLabel(field: string): string {
  return (t.fields as Record<string, string>)[field] ?? field;
}

function FamilyPanel({ family }: { family: FamilyDiff }) {
  const s = family.summary;
  return (
    <details className="border border-line-alt bg-bg">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
        <span className="font-display font-semibold uppercase tracking-[0.04em] text-text">{family.name}</span>
        <span
          className={[
            "rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]",
            family.status === "new" ? "border-red-bright text-red-bright" : "border-line-alt text-muted",
          ].join(" ")}
        >
          {family.status === "new" ? t.family.new : t.family.existing}
        </span>
        <span className="text-xs text-dim">
          {tf(t.pending.counters.models, { added: s.modelsAdded, removed: s.modelsRemoved })} ·{" "}
          {tf(t.pending.counters.products, {
            added: s.productsAdded,
            changed: s.productsChanged,
            removed: s.productsRemoved,
            unchanged: s.productsUnchanged,
          })}
          {s.warnings > 0 ? ` · ${tf(t.pending.counters.warnings, { count: s.warnings })}` : ""}
        </span>
        {family.matchedByFallback && <span className="text-xs text-warn">{t.family.matchedByFallback}</span>}
      </summary>

      <div className="flex flex-col gap-4 border-t border-line-alt px-4 py-4">
        {family.models.added.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted">{t.family.modelsAdded}</h4>
            <ul className="flex flex-wrap gap-1.5 text-sm text-text">
              {family.models.added.map((m) => (
                <li key={m.slug} className="rounded-[2px] border border-ok/40 bg-[rgba(61,190,122,.1)] px-2 py-1">
                  {m.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {family.models.removed.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted">{t.family.modelsRemoved}</h4>
            <ul className="flex flex-wrap gap-1.5 text-sm text-text">
              {family.models.removed.map((m) => (
                <li key={m.slug} className="rounded-[2px] border border-red-bright/40 bg-red-soft px-2 py-1">
                  {m.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {family.products.added.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              {t.family.productsAdded} ({family.products.added.length})
            </h4>
            <Table>
              <TableHead>
                <Th>{t.family.columns.name}</Th>
                <Th>{t.family.columns.category}</Th>
                <Th>{t.family.columns.price}</Th>
                <Th>{t.family.columns.status}</Th>
              </TableHead>
              <TableBody>
                {family.products.added.map((p, i) => (
                  <tr key={`${p.sourceRow}-${i}`}>
                    <Td>{p.name}</Td>
                    <Td>{p.sourceCategory}</Td>
                    <Td className="font-mono">{p.priceTotalChf !== null ? chf(p.priceTotalChf) : "-"}</Td>
                    <Td>{admin.priceStatus[p.priceStatus]}</Td>
                  </tr>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {family.products.changed.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              {t.family.productsChanged} ({family.products.changed.length})
            </h4>
            <div className="flex flex-col gap-2">
              {family.products.changed.map((p) => (
                <div key={p.productId} className="border border-line-alt bg-panel-alt px-3 py-2">
                  <p className="text-sm font-semibold text-text">{p.name}</p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                    {p.changes.map((c) => (
                      <li key={c.field} className="text-muted">
                        <span className="text-dim">{fieldLabel(c.field)}:</span>{" "}
                        <span className="font-mono">{fieldValueText(c.field, c.old)}</span>{" "}
                        <span aria-hidden="true">→</span>{" "}
                        <span className="font-mono text-text">{fieldValueText(c.field, c.new)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {family.products.removed.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              {t.family.productsRemoved} ({family.products.removed.length})
            </h4>
            <Table>
              <TableHead>
                <Th>{t.family.columns.name}</Th>
                <Th>{t.family.columns.category}</Th>
              </TableHead>
              <TableBody>
                {family.products.removed.map((p) => (
                  <tr key={p.productId}>
                    <Td>{p.name}</Td>
                    <Td>{p.sourceCategory}</Td>
                  </tr>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {family.warnings.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-warn">{t.family.warnings}</h4>
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">
              {family.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

function ApplyResultPanel({ result, onClose }: { result: ApplyResult; onClose: () => void }) {
  return (
    <div className="mt-4 border border-line-alt bg-bg px-4 py-3">
      <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{t.pending.applyResultTitle}</h4>
      <p className="mt-1 text-sm text-text">
        {tf(t.pending.applyResultOk, { count: result.totals.familiesProcessed - result.totals.familiesFailed })}
        {result.errors.length > 0 && ` · ${tf(t.pending.applyResultErrors, { count: result.errors.length })}`}
      </p>
      {result.errors.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-xs text-red-bright">
          {result.errors.map((e) => (
            <li key={e.slug}>
              {e.sourceFile}: {e.error}
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="line" size="sm" className="mt-3" onClick={onClose}>
        {t.pending.close}
      </Button>
    </div>
  );
}

export function PricelistDiffCard({
  importId,
  filenames,
  createdAt,
  diff,
}: {
  importId: string;
  filenames: string[];
  createdAt: string;
  diff: ImportDiff;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmKind, setConfirmKind] = useState<"apply" | "discard" | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);

  function handleApply() {
    setConfirmKind(null);
    startTransition(async () => {
      const result = await applyPendingImportAction(importId);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      setApplyResult(result.result);
      showToast(t.pending.applyResultTitle, result.result.errors.length > 0 ? "error" : "success");
    });
  }

  function handleDiscard() {
    setConfirmKind(null);
    startTransition(async () => {
      const result = await discardImportAction(importId);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      router.refresh();
    });
  }

  const s = diff.summary;

  return (
    <section className="min-w-0 border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <p className="text-sm font-semibold text-text">{tf(t.pending.files, { files: filenames.join(", ") })}</p>
          <p className="text-xs text-dim">{tf(t.pending.uploadedAt, { date: formatDate(new Date(createdAt), "de") })}</p>
        </div>
        {!applyResult && (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmKind("discard")}>
              {t.pending.discard}
            </Button>
            <Button type="button" size="sm" disabled={pending} onClick={() => setConfirmKind("apply")}>
              {t.pending.apply}
            </Button>
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>{tf(t.pending.counters.familiesNew, { count: s.familiesNew })}</span>
          <span>{tf(t.pending.counters.familiesExisting, { count: s.familiesExisting })}</span>
          <span>{tf(t.pending.counters.models, { added: s.modelsAdded, removed: s.modelsRemoved })}</span>
          <span>
            {tf(t.pending.counters.products, {
              added: s.productsAdded,
              changed: s.productsChanged,
              removed: s.productsRemoved,
              unchanged: s.productsUnchanged,
            })}
          </span>
          {s.notes > 0 && <span>{tf(t.pending.counters.notes, { count: s.notes })}</span>}
          {s.warnings > 0 && <span className="text-warn">{tf(t.pending.counters.warnings, { count: s.warnings })}</span>}
        </div>

        <div className="flex flex-col gap-2">
          {diff.families.map((f) => (
            <FamilyPanel key={f.slug} family={f} />
          ))}
        </div>

        {applyResult && <ApplyResultPanel result={applyResult} onClose={() => router.refresh()} />}
      </div>

      <ConfirmDialog
        open={confirmKind === "apply"}
        title={t.pending.confirmApplyTitle}
        confirmLabel={t.pending.apply}
        pending={pending}
        onConfirm={handleApply}
        onCancel={() => setConfirmKind(null)}
      >
        {t.pending.confirmApplyBody}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmKind === "discard"}
        title={t.pending.confirmDiscardTitle}
        confirmLabel={t.pending.discard}
        pending={pending}
        onConfirm={handleDiscard}
        onCancel={() => setConfirmKind(null)}
      >
        {t.pending.confirmDiscardBody}
      </ConfirmDialog>
    </section>
  );
}
