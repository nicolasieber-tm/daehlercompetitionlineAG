// POST /api/admin/pricelists/upload: Mehrfach-Upload von Excel-Preislisten
// (Posten "Preislisten"). Nimmt multipart/form-data mit mehreren "files"-
// Feldern entgegen (Route Handler statt Server Action, da ein FormData mit
// mehreren File-Objekten so am robustesten ankommt), validiert Anzahl/
// Grösse/Typ serverseitig, parst über lib/admin/pricelists.ts
// createPricelistImport() (parseWorkbook -> buildDiff -> pending Import) und
// liefert den berechneten Diff direkt zurück, damit die Upload-Komponente
// nicht auf einen zweiten Request warten muss. Nur für angemeldete Admins
// (Supabase-Session), sonst 401 (zusätzlich zu middleware.ts, Defense in
// Depth wie bei den übrigen /api/admin/*-Routen).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPricelistImport, type FileParseError } from "@/lib/admin/pricelists";

const MAX_FILES = 50;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = [".xls", ".xlsx"];

function hasAllowedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Ungültige Anfrage (kein multipart/form-data)." }, { status: 400 });
  }

  const entries = formData.getAll("files").filter((v): v is File => v instanceof File);
  if (entries.length === 0) {
    return NextResponse.json({ ok: false, error: "Bitte mindestens eine Datei auswählen." }, { status: 400 });
  }
  if (entries.length > MAX_FILES) {
    return NextResponse.json({ ok: false, error: `Höchstens ${MAX_FILES} Dateien auf einmal.` }, { status: 400 });
  }

  const fileErrors: FileParseError[] = [];
  const validInputs: { filename: string; buffer: Buffer }[] = [];

  for (const file of entries) {
    if (file.size > MAX_FILE_SIZE) {
      fileErrors.push({ filename: file.name, error: "Datei ist grösser als 10 MB." });
      continue;
    }
    if (!hasAllowedExtension(file.name)) {
      fileErrors.push({ filename: file.name, error: "Keine .xls/.xlsx-Datei." });
      continue;
    }
    const arrayBuffer = await file.arrayBuffer();
    validInputs.push({ filename: file.name, buffer: Buffer.from(arrayBuffer) });
  }

  if (validInputs.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Keine gültige Datei zum Hochladen.", fileErrors },
      { status: 400 },
    );
  }

  try {
    const result = await createPricelistImport(validInputs, user.id);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, fileErrors: [...fileErrors, ...result.fileErrors] },
        { status: 422 },
      );
    }
    return NextResponse.json({
      ok: true,
      importId: result.importId,
      diff: result.diff,
      fileErrors: [...fileErrors, ...result.fileErrors],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload fehlgeschlagen.";
    console.error("POST /api/admin/pricelists/upload fehlgeschlagen.", err);
    return NextResponse.json({ ok: false, error: message, fileErrors }, { status: 500 });
  }
}
