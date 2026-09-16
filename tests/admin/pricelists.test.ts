// lib/admin/pricelists.ts createPricelistImport() gegen die lokale DB
// (Aufgabenstellung: "Upload-Route mit «Produkteliste M2 G87.xls» aus
// docs/preislisten -> pending Import (Diff unchanged) -> discard"). Testet
// dieselbe Logik, die app/api/admin/pricelists/upload/route.ts aufruft (die
// Route selbst lässt sich ohne laufenden Next-Request-Kontext nicht
// sinnvoll direkt aufrufen, siehe next/headers cookies() in
// lib/auth/server.ts).
//
// Die lokale DB ist laut Aufgabenstellung bereits mit allen 42 Preislisten
// befüllt (identischer Parser wie hier) - ein erneuter Upload derselben
// Datei ergibt daher einen Diff ohne Änderungen (nur "unchanged"), das
// prüft dieser Test. Räumt den angelegten pricelist_imports-Eintrag danach
// vollständig weg (kein bleibender Unterschied zum Ausgangszustand, anders
// als ein "discarded" Eintrag, der im echten Admin-Betrieb absichtlich in
// der Historie bliebe). Import-Zwischenspeicher liegt seit dem
// Railway-Umbau in der jsonb-Spalte pricelist_imports.payload statt in
// einem Storage-Bucket (siehe docs/umbau-railway.md), kein eigenes
// Aufräumen dafür nötig.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "../helpers/db";
import { createPricelistImport } from "@/lib/admin/pricelists";
import { discardImport } from "@/lib/pricelist/imports";

const FILE_PATH = resolve(process.cwd(), "docs/preislisten/Produkteliste M2 G87.xls");

describe("createPricelistImport() gegen die lokale DB", () => {
  let importId: string | null = null;

  afterAll(async () => {
    if (!importId) return;
    await sql`delete from pricelist_imports where id = ${importId}`;
  });

  it("Produkteliste M2 G87.xls -> pending Import mit Diff (nur unverändert, keine Änderungen) -> discard", async () => {
    const buffer = await readFile(FILE_PATH);
    const result = await createPricelistImport([{ filename: "Produkteliste M2 G87.xls", buffer }]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    importId = result.importId;

    expect(result.fileErrors).toEqual([]);
    expect(result.diff.families).toHaveLength(1);
    const family = result.diff.families[0];
    expect(family.status).toBe("existing");
    expect(family.summary.productsAdded).toBe(0);
    expect(family.summary.productsChanged).toBe(0);
    expect(family.summary.productsRemoved).toBe(0);
    expect(family.summary.modelsAdded).toBe(0);
    expect(family.summary.modelsRemoved).toBe(0);
    expect(family.summary.productsUnchanged).toBeGreaterThan(0);

    const [row] = await sql<{ status: string; filenames: string[] }[]>`
      select status, filenames from pricelist_imports where id = ${importId}
    `;
    expect(row?.status).toBe("pending");
    expect(row?.filenames).toEqual(["Produkteliste M2 G87.xls"]);

    await discardImport(importId);

    const [afterDiscard] = await sql<{ status: string }[]>`
      select status from pricelist_imports where id = ${importId}
    `;
    expect(afterDiscard?.status).toBe("discarded");
  });
});
