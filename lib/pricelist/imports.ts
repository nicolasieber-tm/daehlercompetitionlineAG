// Verwaltung von Preislisten-Imports (Tabelle pricelist_imports) inklusive
// der im privaten Storage-Bucket "imports" abgelegten Rohdaten des Parsers.
// Quelle: docs/architektur.md, Abschnitt "Excel-Import im Admin".
//
// Ein Import ist zweistufig: createPendingImport() legt die Zeile mit dem
// bereits berechneten Diff (lib/pricelist/diff.ts) an ("pending"). Die vom
// Parser gelieferten ParsedFamily[] selbst sind zu gross für das
// pricelist_imports.diff-jsonb und werden separat unter
// imports/<importId>.json im Bucket "imports" abgelegt (Migration
// supabase/migrations/20260914000000_imports_bucket.sql, Policies nur für
// authenticated). applyPendingImport() lädt sie von dort erneut, statt sie
// aus der DB zu rekonstruieren, und wendet sie über apply.ts an.
//
// Alle drei Funktionen nehmen einen optionalen Supabase-Client entgegen
// (fürs Testen); ohne Angabe wird der Service-Role-Client aus
// lib/supabase/admin.ts verwendet, wie es die Schreibzugriffe auf diese
// Tabelle gemäss CLAUDE.md/docs/architektur.md ohnehin verlangen.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { applyImport, type ApplyResult } from "./apply";
import type { ImportDiff, ParsedFamily } from "./types";

type Db = SupabaseClient<Database>;

const BUCKET = "imports";

function storagePath(importId: string): string {
  return `imports/${importId}.json`;
}

// ---------------------------------------------------------------------------
// Pending-Import anlegen
// ---------------------------------------------------------------------------

export async function createPendingImport(
  filenames: string[],
  diff: ImportDiff,
  userId?: string,
  db: Db = createAdminClient(),
): Promise<string> {
  const { data, error } = await db
    .from("pricelist_imports")
    .insert({
      filenames,
      status: "pending",
      diff: diff as unknown as Json,
      summary: diff.summary as unknown as Json,
      created_by: userId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`pricelist_imports anlegen fehlgeschlagen: ${error.message}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Geparste Rohdaten in Storage ablegen (vom Upload-Flow nach
// createPendingImport() aufzurufen, damit applyPendingImport() sie später
// wiederfindet)
// ---------------------------------------------------------------------------

export async function uploadParsedFamilies(
  importId: string,
  parsed: ParsedFamily[],
  db: Db = createAdminClient(),
): Promise<void> {
  const body = Buffer.from(JSON.stringify(parsed), "utf8");
  const { error } = await db.storage.from(BUCKET).upload(storagePath(importId), body, {
    contentType: "application/json",
    upsert: true,
  });
  if (error) throw new Error(`Parsed-Familien-Upload fehlgeschlagen: ${error.message}`);
}

async function downloadParsedFamilies(importId: string, db: Db): Promise<ParsedFamily[]> {
  const { data, error } = await db.storage.from(BUCKET).download(storagePath(importId));
  if (error) throw new Error(`Parsed-Familien-Download fehlgeschlagen: ${error.message}`);
  const text = await data.text();
  return JSON.parse(text) as ParsedFamily[];
}

// ---------------------------------------------------------------------------
// Pending-Import übernehmen
// ---------------------------------------------------------------------------

export interface ApplyPendingImportResult {
  importId: string;
  result: ApplyResult;
}

export async function applyPendingImport(
  importId: string,
  db: Db = createAdminClient(),
): Promise<ApplyPendingImportResult> {
  const { data: importRow, error: loadError } = await db
    .from("pricelist_imports")
    .select("id, status")
    .eq("id", importId)
    .single();
  if (loadError) throw new Error(`pricelist_imports laden fehlgeschlagen: ${loadError.message}`);
  if (importRow.status !== "pending") {
    throw new Error(
      `pricelist_imports ${importId} hat Status "${importRow.status}", erwartet "pending".`,
    );
  }

  const parsed = await downloadParsedFamilies(importId, db);
  const result = await applyImport(parsed, db, { importId });

  const { error: updateError } = await db
    .from("pricelist_imports")
    .update({ status: "applied", applied_at: new Date().toISOString() })
    .eq("id", importId);
  if (updateError) throw new Error(`pricelist_imports als applied markieren fehlgeschlagen: ${updateError.message}`);

  // revalidateTag ist nur innerhalb eines laufenden Next.js-Servers
  // verfügbar (nicht in einem CLI-Skript via tsx); Fehler hier dürfen den
  // erfolgreich abgeschlossenen Import nicht zunichtemachen.
  try {
    const { revalidateTag } = await import("next/cache");
    revalidateTag("catalog");
  } catch {
    // Ausserhalb von Next (Erstbefüllung per Skript) erwartet und harmlos.
  }

  return { importId, result };
}

// ---------------------------------------------------------------------------
// Pending-Import verwerfen
// ---------------------------------------------------------------------------

export async function discardImport(importId: string, db: Db = createAdminClient()): Promise<void> {
  const { error } = await db
    .from("pricelist_imports")
    .update({ status: "discarded" })
    .eq("id", importId)
    .eq("status", "pending");
  if (error) throw new Error(`pricelist_imports verwerfen fehlgeschlagen: ${error.message}`);
}
