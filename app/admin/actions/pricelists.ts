"use server";

// Server Actions der Preislisten-Seite (app/admin/preislisten/page.tsx):
// einen pending Import übernehmen oder verwerfen. Siehe lib/pricelist/
// imports.ts (applyPendingImport/discardImport), die hier ausschliesslich
// wiederverwendet werden.
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { applyPendingImport, discardImport } from "@/lib/pricelist/imports";
import type { ApplyResult } from "@/lib/pricelist/apply";

export type ActionResult<T extends object = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string };

export async function applyPendingImportAction(importId: string): Promise<ActionResult<{ result: ApplyResult }>> {
  await requireAdmin();
  try {
    const { result } = await applyPendingImport(importId);
    // Prüfbefund admin-pricelists, Punkt 6: applyPendingImport() aktualisiert
    // model_families/models/products direkt in der DB - revalidatePath()
    // sorgt zusätzlich dafür, dass die Preislisten- und die Modelle-Seite
    // (Modell-/Produktzahlen je Baureihe, siehe lib/admin/models.ts) beim
    // nächsten Aufruf frische Daten zeigen, auch wenn sie gerade nicht
    // geöffnet sind.
    //
    // Politur-Prüfbefund 1: revalidatePath() liefert den frisch gerenderten
    // Seitenbaum bereits mit der Server-Action-Antwort aus - der übernommene
    // Import verschwindet dadurch noch in diesem Request aus `pending`. Das
    // ApplyResult wird deshalb NICHT in der PricelistDiffCard selbst
    // gehalten (die unmountet dabei), sondern im umgebenden
    // PendingImportsBoard (components/admin/PendingImportsBoard.tsx), das
    // über die Übernahme hinweg gemountet bleibt. Dessen Schliessen-Button
    // ruft router.refresh() - bei diesem Zeitpunkt bereits redundant (die
    // Daten sind schon frisch), aber harmlos und schadet nicht, falls sich
    // das je ändert.
    revalidatePath("/admin/preislisten");
    revalidatePath("/admin/modelle");
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
