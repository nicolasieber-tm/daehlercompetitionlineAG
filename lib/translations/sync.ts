// Übersetzungslauf: alle Katalog-Quelltexte ohne Übersetzung sammeln, in
// Batches per Claude übersetzen (lib/translations/ai.ts), geprüfte
// Ergebnisse als origin 'auto' ablegen (lib/translations/store.ts).
// Aufrufer: die Preislisten-Übernahme im Admin (app/admin/actions/
// pricelists.ts, im Hintergrund per after()), der Button «Fehlende
// übersetzen» (app/admin/actions/translations.ts) und die CLI-Erstbefüllung
// (scripts/import-pricelists.ts).
//
// Ohne ANTHROPIC_API_KEY passiert nichts (skipped: true) - die App läuft
// dann weiter mit deutschen Produkttexten, wie vor Posten 4.
import { chunk } from "@/lib/db/helpers";
import { translateBatch } from "./ai";
import { findMissingSourceTexts, upsertAutoTranslations, type TranslationLocale } from "./store";

export interface TranslateMissingResult {
  locale: TranslationLocale;
  /** true, wenn kein ANTHROPIC_API_KEY gesetzt ist (nichts passiert). */
  skipped: boolean;
  /** true, wenn bereits ein Lauf lief und dessen Ergebnis zurückgegeben wurde. */
  joined: boolean;
  missing: number;
  translated: number;
  /** Vom Modell geliefert, aber in der Nachprüfung verworfen (bleiben fehlend). */
  rejected: number;
  /** Batches, die mit einem API-/Formatfehler abgebrochen sind (ihre Texte bleiben fehlend). */
  failedBatches: number;
  errors: string[];
  durationMs: number;
}

export interface TranslateMissingOptions {
  batchSize?: number;
  concurrency?: number;
  /** Höchstens so viele fehlende Texte in diesem Lauf (Rest beim nächsten). */
  limit?: number;
  onProgress?: (done: number, total: number) => void;
}

const DEFAULT_BATCH_SIZE = 40;
const DEFAULT_CONCURRENCY = 3;

// Ein Lauf je Sprache und Prozess: ein zweiter Aufruf während eines
// laufenden (z.B. Button-Klick, während der Import-Nachlauf noch arbeitet)
// hängt sich an dessen Ergebnis statt dieselben Texte doppelt zu schicken.
const running = new Map<TranslationLocale, Promise<TranslateMissingResult>>();

export function hasApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

export async function translateMissing(
  locale: TranslationLocale = "en",
  opts: TranslateMissingOptions = {},
): Promise<TranslateMissingResult> {
  const active = running.get(locale);
  if (active) return active.then((r) => ({ ...r, joined: true }));

  const run = (async (): Promise<TranslateMissingResult> => {
    const started = Date.now();
    const base: TranslateMissingResult = {
      locale,
      skipped: false,
      joined: false,
      missing: 0,
      translated: 0,
      rejected: 0,
      failedBatches: 0,
      errors: [],
      durationMs: 0,
    };
    if (!hasApiKey()) return { ...base, skipped: true };

    const missingAll = await findMissingSourceTexts(locale);
    const missing = opts.limit ? missingAll.slice(0, opts.limit) : missingAll;
    base.missing = missing.length;
    if (missing.length === 0) return { ...base, durationMs: Date.now() - started };

    const batches = chunk(
      missing.map((m) => m.text),
      Math.max(1, opts.batchSize ?? DEFAULT_BATCH_SIZE),
    );
    const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
    let done = 0;
    let next = 0;

    const worker = async () => {
      while (next < batches.length) {
        const batch = batches[next++];
        try {
          const result = await translateBatch(batch, locale);
          const entries = [...result.translations].map(([source, translated]) => ({ source, translated }));
          base.translated += await upsertAutoTranslations(locale, entries, result.model);
          base.rejected += result.rejected.size;
          for (const [source, reason] of result.rejected) {
            base.errors.push(`verworfen (${reason}): ${source.slice(0, 80)}`);
          }
        } catch (err) {
          base.failedBatches += 1;
          base.errors.push(`Batch fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          done += batch.length;
          opts.onProgress?.(done, missing.length);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));

    return { ...base, durationMs: Date.now() - started };
  })();

  running.set(locale, run);
  try {
    return await run;
  } finally {
    running.delete(locale);
  }
}
