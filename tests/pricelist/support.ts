// Gemeinsame Test-Hilfen für lib/pricelist (Matching-Unit-Tests und den
// DB-Test gegen die synthetische Testfamilie). Absichtlich KEINE *.test.ts
// Datei (siehe vitest.config.ts: include nur "tests/**/*.test.ts" und
// "lib/**/*.test.ts"), wird also selbst nicht als Testsuite ausgeführt.
import { createHash } from "node:crypto";
import type { Product } from "@/lib/supabase/rows";
import type { ParsedProduct } from "@/lib/pricelist/types";

/**
 * Repliziert die nicht exportierte computeContentHash() aus
 * lib/pricelist/parser.ts (siehe docs/excel-import.md, Abschnitt
 * "content_hash"), damit Test-Fixtures einen zu ihren Feldern passenden
 * Hash bekommen, ohne den Parser selbst aufzurufen.
 */
export function computeContentHash(p: {
  category: string;
  name: string;
  description: string | null;
  articleNo: string | null;
  pricePartsChf: number | null;
  priceInstallChf: number | null;
  priceApprovalChf: number | null;
  priceTotalChf: number | null;
  priceStatus: string;
  fits: string[];
}): string {
  const input = [
    p.category,
    p.name,
    p.description ?? "",
    p.articleNo ?? "",
    p.pricePartsChf ?? "",
    p.priceInstallChf ?? "",
    p.priceApprovalChf ?? "",
    p.priceTotalChf ?? "",
    p.priceStatus,
    [...p.fits].sort().join(","),
  ].join("|");
  return createHash("sha1").update(input).digest("hex");
}

let sourceRowCounter = 0;

/**
 * Baut ein ParsedProduct mit sinnvollen Defaults für Matching-Tests.
 * contentHash wird automatisch aus den (ggf. überschriebenen) Feldern
 * berechnet, ausser er wird explizit mitgegeben.
 */
export function makeParsedProduct(
  overrides: Partial<ParsedProduct> & { name: string; category: ParsedProduct["category"] },
): ParsedProduct {
  sourceRowCounter += 1;
  const base: ParsedProduct = {
    sourceRow: sourceRowCounter,
    sort: sourceRowCounter,
    sourceCategory: "Fahrwerk",
    groupLabel: null,
    description: null,
    articleNo: null,
    rc: null,
    pricePartsChf: null,
    priceInstallChf: null,
    priceApprovalChf: null,
    priceTotalChf: null,
    priceStatus: "priced",
    priceNote: null,
    psBase: [],
    psTo: null,
    nmTo: null,
    variantGroup: null,
    fits: [],
    fitsAll: false,
    contentHash: "",
    ...overrides,
  };
  if (!overrides.contentHash) {
    base.contentHash = computeContentHash(base);
  }
  return base;
}

let dbRowCounter = 0;

/**
 * Baut eine vollständige products-DB-Zeile (Product-Row) mit sinnvollen
 * Defaults für Matching-Tests, die nicht gegen eine echte DB laufen.
 */
export function makeDbProduct(overrides: Partial<Product> & { name: string; category: string }): Product {
  dbRowCounter += 1;
  const now = new Date().toISOString();
  return {
    id: `test-product-${dbRowCounter}`,
    family_id: "test-family",
    active: true,
    article_no: null,
    content_hash: null,
    created_at: now,
    updated_at: now,
    description: null,
    fits_all: false,
    group_label: null,
    nm_to: null,
    price_approval: null,
    price_install: null,
    price_note: null,
    price_parts: null,
    price_status: "priced",
    price_total: null,
    ps_base: [],
    ps_to: null,
    rc: null,
    sort: dbRowCounter,
    source_category: "Fahrwerk",
    source_row: dbRowCounter,
    variant_group: null,
    ...overrides,
  };
}
