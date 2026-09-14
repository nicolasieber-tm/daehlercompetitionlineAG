#!/usr/bin/env tsx
// CLI: parst alle Dateien in docs/preislisten (oder eine einzelne Datei als
// Argument) und schreibt JSON je Familie plus eine Zusammenfassung. Regeln:
// docs/excel-import.md.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parseWorkbook } from "@/lib/pricelist/parser";
import type { ParsedFamily } from "@/lib/pricelist/types";

const DEFAULT_INPUT_DIR = resolve(process.cwd(), "docs/preislisten");
const DEFAULT_OUT_DIR = resolve(
  process.cwd(),
  "/private/tmp/claude-501/-Users-nicolasieber-Desktop-daehlercompetitionlineAG/f65d2010-82e3-47d1-8f28-2aec2417f9e6/scratchpad/parsed",
);

interface Args {
  inputPath: string | null; // einzelne Datei, oder null = alle Dateien in docs/preislisten
  outDir: string;
}

function parseArgs(argv: string[]): Args {
  let inputPath: string | null = null;
  let outDir = DEFAULT_OUT_DIR;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") {
      outDir = resolve(process.cwd(), argv[++i] ?? DEFAULT_OUT_DIR);
    } else if (a.startsWith("--out=")) {
      outDir = resolve(process.cwd(), a.slice("--out=".length));
    } else if (!a.startsWith("--")) {
      inputPath = resolve(process.cwd(), a);
    }
  }
  return { inputPath, outDir };
}

async function listXlsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && /\.xlsx?$/i.test(e.name))
    .map((e) => join(dir, e.name))
    .sort((a, b) => a.localeCompare(b, "de-CH"));
}

interface FileResult {
  file: string;
  family: ParsedFamily | null;
  error: string | null;
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function padNum(n: number | string, width: number): string {
  const s = String(n);
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

async function main() {
  const { inputPath, outDir } = parseArgs(process.argv.slice(2));

  const files = inputPath ? [inputPath] : await listXlsFiles(DEFAULT_INPUT_DIR);
  if (files.length === 0) {
    console.error(`Keine .xls/.xlsx-Dateien gefunden in ${DEFAULT_INPUT_DIR}`);
    process.exitCode = 1;
    return;
  }

  await mkdir(outDir, { recursive: true });

  const results: FileResult[] = [];
  for (const file of files) {
    try {
      const buf = await readFile(file);
      const family = parseWorkbook(buf, basename(file));
      results.push({ file, family, error: null });
      await writeFile(join(outDir, `${family.slug}.json`), JSON.stringify(family, null, 2), "utf8");
    } catch (err) {
      results.push({ file, family: null, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Zusammenfassung
  const summary = {
    generatedAt: new Date().toISOString(),
    inputDir: inputPath ? null : DEFAULT_INPUT_DIR,
    fileCount: files.length,
    okCount: results.filter((r) => r.family).length,
    errorCount: results.filter((r) => r.error).length,
    families: results.map((r) => ({
      file: basename(r.file),
      family: r.family?.name ?? null,
      slug: r.family?.slug ?? null,
      brand: r.family?.brand ?? null,
      pricelistNo: r.family?.pricelistNo ?? null,
      modelCount: r.family?.models.length ?? 0,
      productCount: r.family?.products.length ?? 0,
      priced: r.family?.products.filter((p) => p.priceStatus === "priced").length ?? 0,
      inPreparation: r.family?.products.filter((p) => p.priceStatus === "in_preparation").length ?? 0,
      onRequest: r.family?.products.filter((p) => p.priceStatus === "on_request").length ?? 0,
      noMarker: r.family?.products.filter((p) => p.fitsAll).length ?? 0,
      noteCount: r.family?.notes.length ?? 0,
      warnings: r.family?.warnings ?? [],
      error: r.error,
    })),
  };
  await writeFile(join(outDir, "_summary.json"), JSON.stringify(summary, null, 2), "utf8");

  // Tabelle
  const cols = [
    { key: "file", label: "Datei", width: 42 },
    { key: "family", label: "Familie", width: 30 },
    { key: "models", label: "Modelle", width: 7 },
    { key: "products", label: "Produkte", width: 8 },
    { key: "priced", label: "priced", width: 7 },
    { key: "inPrep", label: "in_prep", width: 7 },
    { key: "onReq", label: "on_req", width: 6 },
    { key: "noMarker", label: "o.Marker", width: 8 },
    { key: "notes", label: "Hinweise", width: 8 },
    { key: "warnings", label: "Warnungen", width: 9 },
  ];
  const headerLine = cols.map((c) => pad(c.label, c.width)).join(" | ");
  console.log(headerLine);
  console.log("-".repeat(headerLine.length));

  let totalModels = 0;
  let totalProducts = 0;
  let totalPriced = 0;
  let totalInPrep = 0;
  let totalOnReq = 0;
  let totalNoMarker = 0;
  let totalNotes = 0;
  let totalWarnings = 0;

  for (const r of results) {
    if (r.error || !r.family) {
      console.log(
        `${pad(basename(r.file), cols[0].width)} | FEHLER: ${r.error}`,
      );
      continue;
    }
    const f = r.family;
    const priced = f.products.filter((p) => p.priceStatus === "priced").length;
    const inPrep = f.products.filter((p) => p.priceStatus === "in_preparation").length;
    const onReq = f.products.filter((p) => p.priceStatus === "on_request").length;
    const noMarker = f.products.filter((p) => p.fitsAll).length;

    totalModels += f.models.length;
    totalProducts += f.products.length;
    totalPriced += priced;
    totalInPrep += inPrep;
    totalOnReq += onReq;
    totalNoMarker += noMarker;
    totalNotes += f.notes.length;
    totalWarnings += f.warnings.length;

    const row = [
      pad(basename(r.file), cols[0].width),
      pad(f.name, cols[1].width),
      padNum(f.models.length, cols[2].width),
      padNum(f.products.length, cols[3].width),
      padNum(priced, cols[4].width),
      padNum(inPrep, cols[5].width),
      padNum(onReq, cols[6].width),
      padNum(noMarker, cols[7].width),
      padNum(f.notes.length, cols[8].width),
      padNum(f.warnings.length, cols[9].width),
    ].join(" | ");
    console.log(row);
  }

  console.log("-".repeat(headerLine.length));
  console.log(
    [
      pad(`Total (${results.filter((r) => r.family).length} Dateien)`, cols[0].width),
      pad("", cols[1].width),
      padNum(totalModels, cols[2].width),
      padNum(totalProducts, cols[3].width),
      padNum(totalPriced, cols[4].width),
      padNum(totalInPrep, cols[5].width),
      padNum(totalOnReq, cols[6].width),
      padNum(totalNoMarker, cols[7].width),
      padNum(totalNotes, cols[8].width),
      padNum(totalWarnings, cols[9].width),
    ].join(" | "),
  );

  if (results.some((r) => r.error)) {
    process.exitCode = 1;
  }

  console.error(`\nJSON je Familie und _summary.json geschrieben nach: ${outDir}`);
}

main();
