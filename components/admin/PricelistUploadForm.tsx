"use client";

// Mehrfach-Upload für Excel-Preislisten (Drag&Drop + Dateiauswahl, max. 50
// Dateien, je max. 10 MB, siehe app/api/admin/pricelists/upload/route.ts,
// das dieselben Grenzen serverseitig nochmals prüft). Nach erfolgreichem
// Upload wird nur router.refresh() aufgerufen: die Server Component
// app/admin/preislisten/page.tsx lädt die offenen Importe (inkl. des neu
// angelegten) und die Historie dann serverseitig neu, diese Komponente
// rendert selbst keinen Diff (keine doppelte Diff-Darstellung neben
// PricelistDiffCard.tsx).
import { useRef, useState, useTransition } from "react";
import type { DragEvent } from "react";
import { useRouter } from "next/navigation";
import { admin } from "@/lib/i18n/admin";
import { tf } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui";
import { useToast } from "./Toast";
import { Card } from "./Card";

const MAX_FILES = 50;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function hasAllowedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith(".xls") || lower.endsWith(".xlsx");
}

interface UploadResponse {
  ok: boolean;
  error?: string;
  importId?: string;
  diff?: { summary: { familiesNew: number; familiesExisting: number } };
  fileErrors?: { filename: string; error: string }[];
}

export function PricelistUploadForm() {
  const t = admin.pricelists.upload;
  const router = useRouter();
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    const next = [...files];
    for (const f of incoming) {
      if (!next.some((existing) => existing.name === f.name && existing.size === f.size)) {
        next.push(f);
      }
    }
    setFiles(next);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }

  function removeFile(name: string, size: number) {
    setFiles((prev) => prev.filter((f) => !(f.name === name && f.size === size)));
  }

  function validateSelection(): string | null {
    if (files.length === 0) return t.noFiles;
    if (files.length > MAX_FILES) return t.tooMany;
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) return tf(t.tooLarge, { name: f.name });
      if (!hasAllowedExtension(f.name)) return tf(t.wrongType, { name: f.name });
    }
    return null;
  }

  function handleUpload() {
    const validationError = validateSelection();
    if (validationError) {
      showToast(validationError, "error");
      return;
    }

    const formData = new FormData();
    for (const f of files) formData.append("files", f);

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/pricelists/upload", { method: "POST", body: formData });
        const data = (await res.json()) as UploadResponse;
        if (!data.ok) {
          showToast(tf(t.resultFailed, { error: data.error ?? "Unbekannter Fehler." }), "error");
          return;
        }
        const families = (data.diff?.summary.familiesNew ?? 0) + (data.diff?.summary.familiesExisting ?? 0);
        const errors = data.fileErrors?.length ?? 0;
        showToast(tf(t.resultOk, { families, errors }), errors > 0 ? "error" : "success");
        setFiles([]);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } catch (err) {
        showToast(tf(t.resultFailed, { error: err instanceof Error ? err.message : "Netzwerkfehler." }), "error");
      }
    });
  }

  return (
    <Card title={t.title}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={[
          "flex flex-col items-center gap-3 rounded-[2px] border border-dashed px-6 py-8 text-center transition-colors",
          dragOver ? "border-red-bright bg-red-soft" : "border-line-alt",
        ].join(" ")}
      >
        <p className="text-sm text-muted">{dragOver ? t.dropHintActive : t.dropHint}</p>
        <p className="text-xs text-dim">{t.fileTypes}</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xls,.xlsx"
          className="sr-only"
          id="pricelist-file-input"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
          }}
        />
        <Button type="button" variant="line" size="sm" onClick={() => inputRef.current?.click()}>
          {t.pickButton}
        </Button>
      </div>

      {files.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5">
          {files.map((f) => (
            <li key={`${f.name}-${f.size}`} className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-sm">
              <span className="truncate text-text">{f.name}</span>
              <button
                type="button"
                onClick={() => removeFile(f.name, f.size)}
                className="shrink-0 text-xs uppercase tracking-[0.06em] text-muted hover:text-red-bright"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-xs text-dim">{tf(t.selectedCount, { count: files.length })}</span>
        <div className="flex-1" />
        {files.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setFiles([])} disabled={pending}>
            {t.clear}
          </Button>
        )}
        <Button type="button" size="sm" onClick={handleUpload} disabled={pending || files.length === 0}>
          {pending ? t.submitting : t.submit}
        </Button>
      </div>
    </Card>
  );
}
