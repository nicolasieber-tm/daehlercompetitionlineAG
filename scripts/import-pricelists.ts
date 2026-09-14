#!/usr/bin/env tsx
// CLI: Erstbefüllung der DB aus den Excel-Preislisten (lib/pricelist/apply.ts).
// Ohne --apply nur Diff (lib/pricelist/diff.ts) drucken, mit --apply
// zusätzlich anwenden. Siehe docs/excel-import.md, docs/architektur.md
// Abschnitt "Excel-Import im Admin".
//
// Aufruf: npm run import [-- <Pfad|Datei...>] [--apply]
//   ohne Pfad-Argument: alle .xls/.xlsx-Dateien in docs/preislisten.
export {}; // macht die Datei zu einem Modul (isolierter Scope)

import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDiff } from "@/lib/pricelist/diff";
import { applyImport } from "@/lib/pricelist/apply";
import { parseWorkbook } from "@/lib/pricelist/parser";
import type { ParsedFamily } from "@/lib/pricelist/types";
import type { ImportDiff } from "@/lib/pricelist/types";

const DEFAULT_INPUT_DIR = resolve(process.cwd(), "docs/preislisten");

interface Args {
  paths: string[]; // leer = alle Dateien in docs/preislisten
  apply: boolean;
}

function parseArgs(argv: string[]): Args {
  const paths: string[] = [];
  let apply = false;
  for (const a of argv) {
    if (a === "--apply") apply = true;
    else if (!a.startsWith("--")) paths.push(resolve(process.cwd(), a));
  }
  return { paths, apply };
}

async function listXlsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && /\.xlsx?$/i.test(e.name))
    .map((e) => join(dir, e.name))
    .sort((a, b) => a.localeCompare(b, "de-CH"));
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function padNum(n: number | string, width: number): string {
  const s = String(n);
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

function printDiff(diff: ImportDiff): void {
  const cols = [
    { key: "family", label: "Familie", width: 32 },
    { key: "status", label: "Status", width: 8 },
    { key: "mAdd", label: "M+", width: 4 },
    { key: "mRem", label: "M-", width: 4 },
    { key: "pAdd", label: "P+", width: 5 },
    { key: "pChg", label: "P~", width: 5 },
    { key: "pUnc", label: "P=", width: 6 },
    { key: "pRem", label: "P-", width: 5 },
    { key: "notes", label: "Notes", width: 6 },
    { key: "warn", label: "Warn", width: 5 },
  ];
  const headerLine = cols.map((c) => pad(c.label, c.width)).join(" | ");
  console.log("\nDiff je Familie (M = Modelle, P = Produkte, + neu, ~ geändert, = unverändert, - entfernt):\n");
  console.log(headerLine);
  console.log("-".repeat(headerLine.length));
  for (const f of diff.families) {
    const s = f.summary;
    const row = [
      pad(f.name, cols[0].width),
      pad(f.status, cols[1].width),
      padNum(s.modelsAdded, cols[2].width),
      padNum(s.modelsRemoved, cols[3].width),
      padNum(s.productsAdded, cols[4].width),
      padNum(s.productsChanged, cols[5].width),
      padNum(s.productsUnchanged, cols[6].width),
      padNum(s.productsRemoved, cols[7].width),
      padNum(s.notes, cols[8].width),
      padNum(s.warnings, cols[9].width),
    ].join(" | ");
    console.log(row);
  }
  console.log("-".repeat(headerLine.length));
  const t = diff.summary;
  console.log(
    `Total: ${diff.families.length} Familien (${t.familiesNew} neu, ${t.familiesExisting} bestehend), ` +
      `Modelle +${t.modelsAdded}/-${t.modelsRemoved}, ` +
      `Produkte +${t.productsAdded} ~${t.productsChanged} =${t.productsUnchanged} -${t.productsRemoved}, ` +
      `${t.notes} Hinweise, ${t.warnings} Parser-Warnungen.`,
  );
}

async function main() {
  process.loadEnvFile(".env");

  const { paths, apply } = parseArgs(process.argv.slice(2));

  const files = paths.length > 0 ? paths : await listXlsFiles(DEFAULT_INPUT_DIR);
  if (files.length === 0) {
    console.error(`Keine .xls/.xlsx-Dateien gefunden in ${DEFAULT_INPUT_DIR}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Parse ${files.length} Datei(en)...`);
  const parsed: ParsedFamily[] = [];
  let parseErrors = 0;
  for (const file of files) {
    try {
      const buf = await readFile(file);
      parsed.push(parseWorkbook(buf, basename(file)));
    } catch (err) {
      parseErrors++;
      console.error(`FEHLER beim Parsen von ${basename(file)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (parsed.length === 0) {
    console.error("Keine Familie erfolgreich geparst, breche ab.");
    process.exitCode = 1;
    return;
  }

  const totalWarnings = parsed.reduce((sum, f) => sum + f.warnings.length, 0);
  console.log(`${parsed.length} Familie(n) geparst, ${totalWarnings} Parser-Warnung(en) insgesamt.`);

  const db = createAdminClient();

  console.log("\nBerechne Diff gegen die DB...");
  const diff = await buildDiff(parsed, db);
  printDiff(diff);

  if (!apply) {
    console.log("\nOhne --apply: nichts geändert. Mit --apply erneut aufrufen, um zu übernehmen.");
    if (parseErrors > 0) process.exitCode = 1;
    return;
  }

  console.log("\n--apply gesetzt: übernehme in die DB...");
  const result = await applyImport(parsed, db, {});

  console.log("\nErgebnis je Familie:");
  const cols = [
    { key: "family", label: "Familie", width: 32 },
    { key: "fam", label: "Familie", width: 8 },
    { key: "models", label: "Modelle", width: 8 },
    { key: "mDeact", label: "M inakt.", width: 9 },
    { key: "pIns", label: "P neu", width: 6 },
    { key: "pUpd", label: "P upd.", width: 7 },
    { key: "pDeact", label: "P inakt.", width: 9 },
    { key: "fit", label: "Fitment", width: 8 },
    { key: "notes", label: "Notes", width: 6 },
  ];
  const headerLine = cols.map((c) => pad(c.label, c.width)).join(" | ");
  console.log(headerLine);
  console.log("-".repeat(headerLine.length));
  for (const f of result.families) {
    const row = [
      pad(f.name, cols[0].width),
      pad(f.familyCreated ? "neu" : "update", cols[1].width),
      padNum(f.modelsUpserted, cols[2].width),
      padNum(f.modelsDeactivated, cols[3].width),
      padNum(f.productsInserted, cols[4].width),
      padNum(f.productsUpdated, cols[5].width),
      padNum(f.productsDeactivated, cols[6].width),
      padNum(f.fitmentRows, cols[7].width),
      padNum(f.notes, cols[8].width),
    ].join(" | ");
    console.log(row);
  }
  console.log("-".repeat(headerLine.length));
  const t = result.totals;
  console.log(
    `Total: ${t.familiesProcessed} Familien verarbeitet (${t.familiesFailed} Fehler), ` +
      `${t.modelsUpserted} Modelle, Produkte +${t.productsInserted} upd.${t.productsUpdated} -${t.productsDeactivated}, ` +
      `${t.fitmentRows} Fitment-Zeilen, ${t.notes} Hinweise, ${result.photosSeeded} Seed-Foto(s) gesetzt.`,
  );

  if (result.errors.length > 0) {
    console.error("\nFehler je Familie:");
    for (const e of result.errors) {
      console.error(`  ${e.slug} (${e.sourceFile}): ${e.error}`);
    }
  }

  if (parseErrors > 0 || result.errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
