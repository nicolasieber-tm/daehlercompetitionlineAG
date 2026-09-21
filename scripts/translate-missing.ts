#!/usr/bin/env tsx
// CLI: fehlende englische Produkttexte übersetzen (Posten 4, lib/translations/
// sync.ts translateMissing()). Dasselbe wie der Button «Fehlende übersetzen»
// unter /admin/uebersetzungen, für die Erstbefüllung und für Railway-Shell.
//
// Aufruf: npm run translate [-- --limit=100]
export {};

try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten.
}

let closeDb: (() => Promise<void>) | undefined;

async function main() {
  const { translateMissing } = await import("@/lib/translations/sync");
  ({ closeDb } = await import("@/lib/db/client"));

  const limitArg = process.argv.slice(2).find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.slice("--limit=".length), 10) : undefined;

  console.log("Übersetze fehlende englische Produkttexte...");
  const t = await translateMissing("en", {
    limit: Number.isFinite(limit) && limit! > 0 ? limit : undefined,
    onProgress: (done, total) => console.log(`  ${done}/${total}`),
  });
  if (t.skipped) {
    console.log("Übersprungen: ANTHROPIC_API_KEY nicht gesetzt.");
    process.exitCode = 1;
    return;
  }
  console.log(
    `Übersetzt ${t.translated} von ${t.missing} fehlenden Texten, verworfen ${t.rejected}, fehlgeschlagene Batches ${t.failedBatches} (${Math.round(t.durationMs / 1000)}s).`,
  );
  for (const e of t.errors) console.log(`  ${e}`);
  if (t.failedBatches > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb?.();
  });
