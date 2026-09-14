"use client";

// Bestätigungsdialog, aktuell für "Antwort wirklich senden?" (Aufgaben-
// stellung: "Bestätigungs-Dialog vor dem Senden"). Kontrolliert (open/
// onConfirm/onCancel als Props) statt eines eigenen Imperative-Handles,
// damit der Aufrufer (components/admin/DraftEditor.tsx) den Pending-Zustand
// des Sendens selbst steuert (Button-Beschriftung, Deaktivieren).
import type { ReactNode } from "react";
import { Button } from "@/components/ui";
import { admin } from "@/lib/i18n/admin";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-[2px] border border-line-alt bg-panel p-6 shadow-xl">
        <h2 id="confirm-dialog-title" className="font-display text-lg font-bold uppercase tracking-wide text-text">
          {title}
        </h2>
        {children && <div className="mt-3 text-sm leading-relaxed text-muted">{children}</div>}
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            {cancelLabel ?? admin.confirm.cancel}
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={onConfirm} disabled={pending}>
            {confirmLabel ?? admin.confirm.yes}
          </Button>
        </div>
      </div>
    </div>
  );
}
