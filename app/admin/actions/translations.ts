"use server";

// Server Actions der Übersetzungen-Seite (app/admin/uebersetzungen/page.tsx,
// Posten 4): fehlende Texte per Sprachmodell übersetzen (lib/translations/
// sync.ts) und eine einzelne Übersetzung manuell speichern
// (lib/translations/store.ts, origin 'manual').
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { saveManualTranslation } from "@/lib/translations/store";
import { translateMissing, type TranslateMissingResult } from "@/lib/translations/sync";

export type ActionResult<T extends object = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string };

const PATH = "/admin/uebersetzungen";


export async function translateMissingAction(): Promise<ActionResult<{ result: TranslateMissingResult }>> {
  await requireAdmin();
  try {
    // Synchron (nicht per after()): der Admin wartet bewusst auf das
    // Ergebnis und sieht danach Zähler und neue Einträge. Nach dem ersten
    // Vollimport sind das rund 1'000 Texte (rund eine Minute), danach nur
    // noch die Handvoll neuer Texte je Quartalsupdate.
    const result = await translateMissing("en");
    revalidatePath(PATH);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Übersetzen fehlgeschlagen." };
  }
}

export async function saveTranslationAction(source: string, translated: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await saveManualTranslation("en", source, translated);
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Speichern fehlgeschlagen." };
  }
}
