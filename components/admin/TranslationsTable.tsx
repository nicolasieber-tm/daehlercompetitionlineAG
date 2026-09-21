"use client";

// Tabelle der Übersetzungen-Seite: deutscher Quelltext (mit Art und
// Vorkommen), englische Fassung als editierbares Textfeld je Zeile,
// Herkunft. Speichern je Zeile über saveTranslationAction (origin 'manual',
// wird vom automatischen Lauf nie mehr überschrieben); leer speichern löscht.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { admin } from "@/lib/i18n/admin";
import { tf } from "@/lib/i18n/dictionaries";
import type { TranslationListEntry } from "@/lib/translations/store";
import { saveTranslationAction } from "@/app/admin/actions/translations";
import { Table, TableHead, TableBody, Th, Td } from "./Table";
import { useToast } from "./Toast";

const t = admin.translations.table;

const ORIGIN_CLASSES: Record<"auto" | "manual" | "missing", string> = {
  auto: "border-line-alt text-muted",
  manual: "border-ok text-ok",
  missing: "border-warn text-warn",
};

function OriginBadge({ origin }: { origin: "auto" | "manual" | null }) {
  const key = origin ?? "missing";
  const label = origin === "auto" ? t.originAuto : origin === "manual" ? t.originManual : t.originMissing;
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-[0.08em]",
        ORIGIN_CLASSES[key],
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function TranslationRow({ row }: { row: TranslationListEntry }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [value, setValue] = useState(row.translated ?? "");
  const [pending, startTransition] = useTransition();
  const dirty = value !== (row.translated ?? "");

  function save() {
    startTransition(async () => {
      const res = await saveTranslationAction(row.source, value);
      if (res.ok) {
        showToast(t.saved, "success");
        router.refresh();
      } else {
        showToast(res.error, "error");
      }
    });
  }

  return (
    <tr>
      <Td className="w-[38%]">
        <div className="whitespace-pre-line text-sm">{row.source}</div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.08em] text-dim">
          {t.kind[row.kind]} · {tf(t.usage, { count: row.count })}
        </div>
      </Td>
      <Td className="w-[46%]">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={Math.max(1, row.source.split("\n").length)}
          disabled={pending}
          aria-label={t.columns.target}
          placeholder={row.translated == null ? t.missingHint : undefined}
          className="w-full rounded-[2px] border border-line-alt bg-bg px-2.5 py-2 text-sm text-text placeholder:text-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-bright focus-visible:outline-offset-2"
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            className="rounded-[2px] bg-red px-3 py-1.5 font-display text-[12px] font-semibold uppercase tracking-[0.06em] text-white disabled:opacity-40"
          >
            {pending ? t.saving : t.save}
          </button>
          {dirty && value.trim() === "" ? <span className="text-xs text-dim">{t.clearHint}</span> : null}
        </div>
      </Td>
      <Td className="whitespace-nowrap">
        <OriginBadge origin={row.origin} />
      </Td>
    </tr>
  );
}

export function TranslationsTable({ rows }: { rows: TranslationListEntry[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">{t.empty}</p>;
  return (
    <Table>
      <TableHead>
        <Th>{t.columns.source}</Th>
        <Th>{t.columns.target}</Th>
        <Th>{t.columns.origin}</Th>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TranslationRow key={row.source} row={row} />
        ))}
      </TableBody>
    </Table>
  );
}
