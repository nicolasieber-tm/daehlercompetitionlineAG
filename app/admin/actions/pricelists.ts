"use server";

// Server Actions der Preislisten-Seite (app/admin/preislisten/page.tsx):
// einen pending Import übernehmen oder verwerfen. Siehe lib/pricelist/
// imports.ts (applyPendingImport/discardImport), die hier ausschliesslich
// wiederverwendet werden.
import { requireAdmin } from "@/lib/admin/auth";
import { applyPendingImport, discardImport } from "@/lib/pricelist/imports";
import type { ApplyResult } from "@/lib/pricelist/apply";

export type ActionResult<T extends object = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string };

export async function applyPendingImportAction(importId: string): Promise<ActionResult<{ result: ApplyResult }>> {
  await requireAdmin();
  try {
    const { result } = await applyPendingImport(importId);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Übernehmen fehlgeschlagen." };
  }
}

export async function discardImportAction(importId: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await discardImport(importId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Verwerfen fehlgeschlagen." };
  }
}
