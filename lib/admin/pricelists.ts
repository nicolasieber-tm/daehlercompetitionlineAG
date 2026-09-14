// Admin-Datenzugriff für Preislisten-Importe (Posten "Preislisten"): Upload
// verarbeiten (parsen -> Diff -> pending Import ablegen), Historie lesen.
// Siehe docs/architektur.md, Abschnitt "Excel-Import im Admin", und
// lib/pricelist/{parser,diff,imports,apply,types}.ts, die hier ausschliesslich
// wiederverwendet werden (kein eigener Parser-/Diff-/Apply-Code).
//
// Wie lib/admin/inquiries.ts: Funktionen nehmen optional einen bereits
// erzeugten Supabase-Client entgegen (Tests gegen die lokale DB); ohne
// Angabe wird der Service-Role-Client verwendet (Schreibzugriffe auf
// pricelist_imports/Storage-Bucket "imports" verlangen ihn ohnehin, siehe
// lib/pricelist/imports.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { buildDiff } from "@/lib/pricelist/diff";
import { parseWorkbook } from "@/lib/pricelist/parser";
import { createPendingImport, uploadParsedFamilies } from "@/lib/pricelist/imports";
import type { ImportDiff, ParsedFamily } from "@/lib/pricelist/types";
import type { PricelistImportStatus } from "@/lib/supabase/rows";

type Db = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Upload -> parsen -> Diff -> pending Import
// ---------------------------------------------------------------------------

export interface UploadFileInput {
  filename: string;
  buffer: Buffer;
}

export interface FileParseError {
  filename: string;
  error: string;
}

export type CreatePricelistImportResult =
  | { ok: true; importId: string; diff: ImportDiff; fileErrors: FileParseError[] }
  | { ok: false; error: string; fileErrors: FileParseError[] };

/**
 * Parst alle übergebenen Dateien (parseWorkbook wirft pro Datei einzeln,
 * z.B. bei einer beschädigten/falsch formatierten Excel - eine einzelne
 * kaputte Datei darf einen Mehrfach-Upload nicht komplett scheitern lassen,
 * siehe Aufgabenstellung "Mehrfach-Upload"), berechnet den Diff gegen den
 * DB-Bestand und legt einen pending-Import an (createPendingImport +
 * uploadParsedFamilies, siehe lib/pricelist/imports.ts). Liefert ok:false,
 * wenn keine einzige Datei geparst werden konnte.
 */
export async function createPricelistImport(
  files: UploadFileInput[],
  userId?: string,
  db: Db = createAdminClient(),
): Promise<CreatePricelistImportResult> {
  const parsed: ParsedFamily[] = [];
  const fileErrors: FileParseError[] = [];

  for (const file of files) {
    try {
      parsed.push(parseWorkbook(file.buffer, file.filename));
    } catch (err) {
      fileErrors.push({ filename: file.filename, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (parsed.length === 0) {
    return { ok: false, error: "Keine der hochgeladenen Dateien konnte gelesen werden.", fileErrors };
  }

  const diff = await buildDiff(parsed, db);
  const importId = await createPendingImport(
    parsed.map((f) => f.sourceFile),
    diff,
    userId,
    db,
  );
  await uploadParsedFamilies(importId, parsed, db);

  return { ok: true, importId, diff, fileErrors };
}

// ---------------------------------------------------------------------------
// Offene (pending) Importe mit Diff, für die Übernehmen/Verwerfen-Ansicht
// ---------------------------------------------------------------------------

export interface PendingImportRow {
  id: string;
  filenames: string[];
  createdAt: string;
  diff: ImportDiff;
}

function asImportDiff(value: unknown): ImportDiff {
  return value as ImportDiff;
}

export async function getPendingImports(db: Db = createAdminClient()): Promise<PendingImportRow[]> {
  const { data, error } = await db
    .from("pricelist_imports")
    .select("id, filenames, diff, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Offene Importe laden fehlgeschlagen: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    filenames: row.filenames,
    createdAt: row.created_at,
    diff: asImportDiff(row.diff),
  }));
}

// ---------------------------------------------------------------------------
// Import-Historie (alle Status, neueste zuerst)
// ---------------------------------------------------------------------------

export interface ImportHistoryRow {
  id: string;
  filenames: string[];
  status: PricelistImportStatus;
  createdAt: string;
  appliedAt: string | null;
  summary: Record<string, unknown> | null;
}

const HISTORY_LIMIT = 30;

export async function getImportHistory(
  limit: number = HISTORY_LIMIT,
  db: Db = createAdminClient(),
): Promise<ImportHistoryRow[]> {
  const { data, error } = await db
    .from("pricelist_imports")
    .select("id, filenames, status, summary, created_at, applied_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Import-Historie laden fehlgeschlagen: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    filenames: row.filenames,
    status: row.status as PricelistImportStatus,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    summary: row.summary && typeof row.summary === "object" && !Array.isArray(row.summary)
      ? (row.summary as Record<string, unknown>)
      : null,
  }));
}
