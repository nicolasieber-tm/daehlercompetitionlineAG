// Verwaltung von Preislisten-Imports (Tabelle pricelist_imports). Quelle:
// docs/architektur.md, Abschnitt "Excel-Import im Admin".
//
// Railway-Umbau (docs/umbau-railway.md, Abschnitt "Fotos und Import-
// Zwischenspeicher"): die vom Parser gelieferten Rohdaten (ParsedFamily[])
// waren vormals zu gross für das jsonb-Feld und lagen separat unter
// imports/<importId>.json im Supabase-Storage-Bucket "imports"
// (uploadParsedFamilies()/downloadParsedFamilies()). Diese Bucket-Zugriffe
// entfallen ersatzlos: pricelist_imports.payload (jsonb) nimmt die
// Rohdaten jetzt direkt auf. createPendingImport() legt Diff UND Payload in
// einem Insert an, applyPendingImport() liest das Payload zurück und setzt
// es nach dem Übernehmen (erfolgreich oder nicht) auf null, discardImport()
// ebenso beim Verwerfen - der Import-Zwischenspeicher wird also in jedem
// Fall geleert, sobald der pending-Zustand verlassen wird.
import type postgres from "postgres";
import { sql } from "@/lib/db/client";
import { applyImport, type ApplyResult } from "./apply";
import type { ImportDiff, ParsedFamily } from "./types";

// ---------------------------------------------------------------------------
// Pending-Import anlegen (Diff + Rohdaten in einem Insert)
// ---------------------------------------------------------------------------

export async function createPendingImport(
  filenames: string[],
  diff: ImportDiff,
  parsed: ParsedFamily[],
  userId?: string,
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    insert into pricelist_imports (filenames, status, diff, summary, payload, created_by)
    values (
      ${filenames},
      'pending',
      ${sql.json(diff as unknown as postgres.JSONValue)},
      ${sql.json(diff.summary as unknown as postgres.JSONValue)},
      ${sql.json(parsed as unknown as postgres.JSONValue)},
      ${userId ?? null}
    )
    returning id
  `;
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// Pending-Import übernehmen
// ---------------------------------------------------------------------------

export interface ApplyPendingImportResult {
  importId: string;
  result: ApplyResult;
}

export async function applyPendingImport(importId: string): Promise<ApplyPendingImportResult> {
  const rows = await sql<{ id: string; status: string; summary: unknown; payload: unknown }[]>`
    select id, status, summary, payload from pricelist_imports where id = ${importId}
  `;
  const importRow = rows[0];
  if (!importRow) {
    throw new Error(`pricelist_imports ${importId} nicht gefunden.`);
  }
  if (importRow.status !== "pending") {
    throw new Error(
      `pricelist_imports ${importId} hat Status "${importRow.status}", erwartet "pending".`,
    );
  }
  if (!importRow.payload) {
    throw new Error(`pricelist_imports ${importId}: kein payload (Rohdaten) vorhanden.`);
  }

  const parsed = importRow.payload as ParsedFamily[];
  const result = await applyImport(parsed, { importId });

  // Prüfung Phase B, Punkt 8: applyImport() bricht bei einer einzelnen
  // Familie nicht ab (siehe lib/pricelist/apply.ts applyImport(), sammelt
  // Fehler in result.errors statt zu werfen), markierte den Import bisher
  // aber IMMER als "applied" - auch wenn einzelne oder alle Familien
  // fehlgeschlagen waren. Bei mindestens einem Fehler wird der Import
  // stattdessen als "failed" markiert und die Fehler werden im
  // summary-jsonb ergänzt (neben dem ursprünglichen Diff-summary aus
  // createPendingImport()), damit der Admin sie sieht. payload wird in
  // jedem Fall geleert (erfolgreich oder nicht): ein "failed"-Import wird
  // nicht automatisch erneut versucht, sondern manuell neu hochgeladen.
  const hasErrors = result.errors.length > 0;
  const existingSummary =
    importRow.summary && typeof importRow.summary === "object" && !Array.isArray(importRow.summary)
      ? (importRow.summary as Record<string, unknown>)
      : {};

  if (hasErrors) {
    await sql`
      update pricelist_imports
      set status = 'failed',
          applied_at = now(),
          summary = ${sql.json({ ...existingSummary, errors: result.errors } as unknown as postgres.JSONValue)},
          payload = null
      where id = ${importId}
    `;
  } else {
    await sql`
      update pricelist_imports
      set status = 'applied', applied_at = now(), payload = null
      where id = ${importId}
    `;
  }

  // revalidateTag ist nur innerhalb eines laufenden Next.js-Servers
  // verfügbar (nicht in einem CLI-Skript via tsx); Fehler hier dürfen den
  // erfolgreich abgeschlossenen Import nicht zunichtemachen. Die beiden
  // Katalog-Routen (app/api/catalog/route.ts, app/api/catalog/products/
  // route.ts) verwenden bewusst KEIN unstable_cache mit Tag "catalog" mehr
  // (ein einzelner Import war die einzige Schreibstelle, die revalidateTag
  // aufgerufen hat, alle anderen liessen den Katalog bis zu einer Stunde
  // veraltet). Der Aufruf hier bleibt trotzdem stehen (kostet nichts, ist
  // ein No-Op ohne passenden Cache-Eintrag).
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

/**
 * `_legacyDb` bleibt als ignorierter, optionaler zweiter Parameter stehen:
 * tests/admin/pricelists.test.ts (ausserhalb des Umbau-Umfangs dieser
 * Aufgabe) ruft discardImport() noch mit einem zweiten (Supabase-)Argument
 * auf; das Argument wird hier einfach nicht mehr verwendet.
 */
export async function discardImport(importId: string, _legacyDb?: unknown): Promise<void> {
  await sql`
    update pricelist_imports
    set status = 'discarded', payload = null
    where id = ${importId} and status = 'pending'
  `;
}
