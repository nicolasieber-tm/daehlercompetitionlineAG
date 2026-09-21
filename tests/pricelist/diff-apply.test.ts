// Diff/Apply gegen den lokalen Postgres (docs/db.md, docs/umbau-railway.md).
//
// Befund #1 (Bericht): frühere Fassung testete gegen
// die echte Familie M2 G87 und hinterliess bei jedem Lauf Rückstände in der
// gemeinsam genutzten Katalog-DB (Admin-Feld short_text überschrieben und
// nie zurückgesetzt; deaktivierte Testzeilen, die beim "Wiederherstellen"
// per INSERT statt Reaktivierung neu angelegt wurden, sodass ein reales
// Produkt bei jedem Testlauf eine neue id bekam). Diese Fassung baut
// stattdessen eine eigene, synthetische Familie (Slug "test-diff-apply",
// siehe makeSyntheticFamily unten) auf, fasst keine echten Katalogdaten an
// und löscht die synthetische Familie am Ende vollständig (afterAll, läuft
// auch wenn ein it() fehlschlägt) - model_families -> models/products/
// product_fitment/pricelist_notes cascaded per on delete cascade
// (db/migrations/0001_init.sql), ein einzelnes DELETE genügt.
//
// Läuft direkt gegen den lokalen Postgres (lib/db/client.ts,
// DATABASE_URL aus .env, siehe tests/setup.ts).
//
// Die präzise Reproduktion von Befund #2 (Schwester-Produkte, DB-Reihenfolge
// ohne ORDER BY unbestimmt) liegt bewusst in tests/pricelist/match.test.ts:
// dort ist die DB-Zeilenreihenfolge deterministisch simulierbar. Hier läuft
// derselbe Sonderfall (gleicher Artikelnummer+Name, unterschiedliches
// Fitment, eine Variante geändert/eine unverändert) zusätzlich end-to-end
// gegen die echte DB, kann den Fehler aber je nach tatsächlicher
// Postgres-Zeilenreihenfolge nicht zuverlässig reproduzieren - das ist hier
// nur eine ergänzende Plausibilitätsprüfung, keine Regressionsgarantie.
//
// Reihenfolge wichtig (kein describe.concurrent): jeder it()-Block baut auf
// dem DB-Zustand des vorherigen auf.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { buildDiff } from "@/lib/pricelist/diff";
import { applyImport } from "@/lib/pricelist/apply";
import { getProductsForModel } from "@/lib/catalog/queries";
import { FLOW_CATEGORIES } from "@/lib/catalog/categories";
import type { ParsedFamily, ParsedProduct } from "@/lib/pricelist/types";
import { computeContentHash } from "./support";

const FAMILY_SLUG = "test-diff-apply";
const TEST_SHORT_TEXT = "Test-Kurzbeschrieb diff-apply.test.ts";
const ADDED_PRODUCT_NAME = "Test-Zusatzprodukt diff-apply.test.ts (neu im Klon)";

/** Baut ein ParsedProduct mit automatisch berechnetem content_hash. */
function product(p: Omit<ParsedProduct, "contentHash">): ParsedProduct {
  return { ...p, contentHash: computeContentHash(p) };
}

/**
 * Eigene, synthetische Familie für diesen Test - keine echten Katalogdaten.
 * Enthält bewusst ein "Schwester"-Paar (gleicher Name + gleiche
 * Artikelnummer, unterschiedliches Fitment, siehe Befund #2 und
 * docs/excel-import.md "Sonderfälle") als P1/P2.
 */
function makeSyntheticFamily(): ParsedFamily {
  const SISTER_NAME = "Sportfahrwerk höhenverstellbar (Test)";
  const SISTER_ARTICLE_NO = "TEST-SPORT-001";
  return {
    name: "Test Familie diff-apply.test.ts",
    slug: FAMILY_SLUG,
    brand: "BMW",
    codes: ["T00"],
    pricelistNo: "T-0000",
    sourceFile: "Test-diff-apply.xls",
    models: [
      { name: "Modell A", slug: "modell-a", fuel: "benzin", sort: 1, seriesPsSuggested: [400] },
      { name: "Modell B", slug: "modell-b", fuel: "benzin", sort: 2, seriesPsSuggested: [420] },
    ],
    products: [
      product({
        sourceRow: 10,
        sort: 10,
        sourceCategory: "Fahrwerk",
        category: "fahrwerk",
        groupLabel: null,
        name: SISTER_NAME,
        description: null,
        articleNo: SISTER_ARTICLE_NO,
        rc: "A",
        pricePartsChf: 900,
        priceInstallChf: 100,
        priceApprovalChf: null,
        priceTotalChf: 1000,
        priceStatus: "priced",
        priceNote: null,
        psBase: [],
        psTo: null,
        nmTo: null,
        variantGroup: "fahrwerk",
        gearbox: null,
        bodyStyles: [],
        drive: null,
        fits: ["Modell A"],
        fitsAll: false,
      }),
      product({
        sourceRow: 11,
        sort: 11,
        sourceCategory: "Fahrwerk",
        category: "fahrwerk",
        groupLabel: null,
        name: SISTER_NAME,
        description: null,
        articleNo: SISTER_ARTICLE_NO,
        rc: "A",
        pricePartsChf: 1100,
        priceInstallChf: 100,
        priceApprovalChf: null,
        priceTotalChf: 1200,
        priceStatus: "priced",
        priceNote: null,
        psBase: [],
        psTo: null,
        nmTo: null,
        variantGroup: "fahrwerk",
        gearbox: null,
        bodyStyles: [],
        drive: null,
        fits: ["Modell B"],
        fitsAll: false,
      }),
      product({
        sourceRow: 12,
        sort: 12,
        sourceCategory: "Motor",
        category: "motor",
        groupLabel: null,
        name: "Stufe 1: (Basis 400 PS) 450PS / 600Nm (Test)",
        description: null,
        articleNo: "TEST-MOTOR-001",
        rc: "B",
        pricePartsChf: 2800,
        priceInstallChf: 200,
        priceApprovalChf: null,
        priceTotalChf: 3000,
        priceStatus: "priced",
        priceNote: null,
        psBase: [400],
        psTo: 450,
        nmTo: 600,
        variantGroup: "leistung",
        gearbox: null,
        bodyStyles: [],
        drive: null,
        fits: ["Modell A"],
        fitsAll: false,
      }),
      product({
        sourceRow: 13,
        sort: 13,
        sourceCategory: "Karosserie",
        category: "exterieur",
        groupLabel: null,
        name: "Zubehör ohne Fitment (Test)",
        description: null,
        articleNo: null,
        rc: null,
        pricePartsChf: 200,
        priceInstallChf: null,
        priceApprovalChf: null,
        priceTotalChf: 200,
        priceStatus: "priced",
        priceNote: null,
        psBase: [],
        psTo: null,
        nmTo: null,
        variantGroup: null,
        gearbox: null,
        bodyStyles: [],
        drive: null,
        fits: [],
        fitsAll: true,
      }),
    ],
    notes: [{ sourceCategory: "Motor", text: "Testhinweis diff-apply.test.ts", sort: 1 }],
    warnings: [],
  };
}

function sumFitsRows(family: ParsedFamily): number {
  return family.products.filter((p) => !p.fitsAll).reduce((sum, p) => sum + p.fits.length, 0);
}

describe("diff.ts + apply.ts gegen den lokalen Postgres (synthetische Testfamilie)", () => {
  let family: ParsedFamily;
  let familyId: string;
  let modelAId: string;

  beforeAll(async () => {
    family = makeSyntheticFamily();

    // Sicherstellen, dass keine Leiche eines vorigen fehlgeschlagenen Laufs
    // (z. B. Testabbruch vor afterAll) die Zählungen unten verfälscht.
    await sql`delete from model_families where slug = ${FAMILY_SLUG}`;
  });

  afterAll(async () => {
    await sql`delete from model_families where slug = ${FAMILY_SLUG}`;
  });

  it("importiert die Testfamilie initial: 2 Modelle, 4 Produkte, Fitment-Zeilen = Summe fits, 1 Hinweis", async () => {
    const result = await applyImport([family], {});
    expect(result.errors).toEqual([]);
    expect(result.families.length).toBe(1);

    const fam = result.families[0];
    familyId = fam.familyId;
    expect(fam.familyCreated).toBe(true);
    expect(fam.modelsUpserted).toBe(2);
    expect(fam.productsInserted + fam.productsUpdated).toBe(family.products.length);
    expect(fam.fitmentRows).toBe(sumFitsRows(family));
    expect(fam.notes).toBe(family.notes.length);
    expect(fam.notes).toBeGreaterThan(0);

    const [modelA] = await sql<{ id: string }[]>`
      select id from models where family_id = ${familyId} and slug = 'modell-a'
    `;
    expect(modelA).toBeDefined();
    modelAId = modelA.id;

    // Admin-Feld setzen, um in den folgenden Schritten die Erhaltung zu prüfen.
    await sql`update model_families set short_text = ${TEST_SHORT_TEXT} where id = ${familyId}`;
  });

  it("zweiter Import derselben Daten: Diff komplett unverändert, apply ändert nichts an Zeilenzahl/-menge", async () => {
    const diff = await buildDiff([family]);
    const fd = diff.families[0];
    expect(fd.status).toBe("existing");
    expect(fd.familyId).toBe(familyId);
    expect(fd.models.added).toEqual([]);
    expect(fd.models.removed).toEqual([]);
    expect(fd.models.unchanged.length).toBe(2);
    expect(fd.products.added).toEqual([]);
    expect(fd.products.changed).toEqual([]);
    expect(fd.products.removed).toEqual([]);
    expect(fd.summary.productsUnchanged).toBe(family.products.length);

    const before = await sql<{ id: string }[]>`
      select id from products where family_id = ${familyId} and active = true order by id
    `;

    const result = await applyImport([family], {});
    expect(result.errors).toEqual([]);
    const fam = result.families[0];
    expect(fam.productsInserted).toBe(0);
    expect(fam.productsDeactivated).toBe(0);

    const after = await sql<{ id: string }[]>`
      select id from products where family_id = ${familyId} and active = true order by id
    `;
    expect(new Set(after.map((r) => r.id))).toEqual(new Set(before.map((r) => r.id)));

    const [famRow] = await sql<{ short_text: string | null }[]>`
      select short_text from model_families where id = ${familyId}
    `;
    expect(famRow.short_text).toBe(TEST_SHORT_TEXT);
  });

  it(
    "manipulierter Klon (eine Schwester-Variante geändert, eine unverändert, ein Produkt entfernt, eines neu): " +
      "Diff ordnet die geänderte Zeile korrekt der ihr entsprechenden DB-Zeile zu (Befund #2), apply setzt removed " +
      "auf active=false, Admin-Feld bleibt erhalten",
    async () => {
      const clone: ParsedFamily = JSON.parse(JSON.stringify(family));

      // P1 (fittet Modell A) ändert den Preis; P2 (gleicher Name + gleiche
      // Artikelnummer, fittet Modell B) bleibt exakt unverändert - das ist
      // der Sonderfall aus Befund #2.
      const sisterA = clone.products.find((p: ParsedProduct) => p.fits.includes("Modell A") && p.category === "fahrwerk")!;
      const sisterB = clone.products.find((p: ParsedProduct) => p.fits.includes("Modell B") && p.category === "fahrwerk")!;
      expect(sisterA).toBeDefined();
      expect(sisterB).toBeDefined();
      sisterA.priceTotalChf = 1100;
      sisterA.contentHash = computeContentHash(sisterA);

      const removedProduct = clone.products.find((p: ParsedProduct) => p.name === "Zubehör ohne Fitment (Test)")!;
      expect(removedProduct).toBeDefined();
      clone.products = clone.products.filter((p: ParsedProduct) => p.sourceRow !== removedProduct.sourceRow);

      const newProduct = product({
        sourceRow: 999,
        sort: 999,
        sourceCategory: "Motor",
        category: "motor",
        groupLabel: null,
        name: ADDED_PRODUCT_NAME,
        description: null,
        articleNo: null,
        rc: null,
        pricePartsChf: null,
        priceInstallChf: null,
        priceApprovalChf: null,
        priceTotalChf: null,
        priceStatus: "on_request",
        priceNote: "Testprodukt",
        psBase: [],
        psTo: null,
        nmTo: null,
        variantGroup: null,
        gearbox: null,
        bodyStyles: [],
        drive: null,
        fits: ["Modell A"],
        fitsAll: false,
      });
      clone.products.push(newProduct);

      const diff = await buildDiff([clone]);
      const fd = diff.families[0];
      expect(fd.status).toBe("existing");

      // Genau eine geänderte Zeile: die per article_no+name gematchte
      // Schwester-Variante A, nicht ihre unveränderte Schwester B.
      expect(fd.products.changed.length).toBe(1);
      const changedEntry = fd.products.changed[0];
      expect(changedEntry.matchedBy).toBe("article_no_name");
      // Nur price_total ändert sich. Wäre die Zuordnung vertauscht (Befund
      // #2: die geänderte Zeile hätte die DB-Zeile der unveränderten
      // Schwester B erwischt), würde hier zusätzlich "fits" auftauchen
      // (Modell A statt Modell B) - dieser Test bleibt bei richtiger
      // Zuordnung auf genau eine Feldänderung beschränkt.
      expect(changedEntry.changes.length).toBe(1);
      expect(changedEntry.changes[0].field).toBe("price_total");
      expect(Number(changedEntry.changes[0].old)).toBe(1000);
      expect(changedEntry.changes[0].new).toBe(1100);

      expect(fd.products.added.length).toBe(1);
      expect(fd.products.added[0].name).toBe(ADDED_PRODUCT_NAME);
      expect(fd.products.removed.length).toBe(1);
      expect(fd.products.removed[0].name).toBe("Zubehör ohne Fitment (Test)");
      // 4 Zeilen total - 1 geändert - 1 entfernt (zählt nicht als unchanged) = 2 unverändert.
      expect(fd.summary.productsUnchanged).toBe(2);

      const result = await applyImport([clone], {});
      expect(result.errors).toEqual([]);
      const fam = result.families[0];
      expect(fam.productsInserted).toBe(1);
      expect(fam.productsDeactivated).toBe(1);

      const [removedRow] = await sql<{ active: boolean }[]>`
        select active from products
        where family_id = ${familyId} and name = 'Zubehör ohne Fitment (Test)'
        order by updated_at desc
        limit 1
      `;
      expect(removedRow.active).toBe(false);

      const [newRow] = await sql<{ active: boolean; price_total: number | null }[]>`
        select active, price_total from products
        where family_id = ${familyId} and name = ${ADDED_PRODUCT_NAME} and active = true
      `;
      expect(newRow).toBeDefined();

      // Die beiden Schwester-Varianten per Fitment auseinanderhalten (Name
      // und Artikelnummer sind bei beiden identisch, siehe Befund #2).
      const [modelARow] = await sql<{ id: string }[]>`select id from models where family_id = ${familyId} and slug = 'modell-a'`;
      const [modelBRow] = await sql<{ id: string }[]>`select id from models where family_id = ${familyId} and slug = 'modell-b'`;
      const fitmentA = await sql<{ product_id: string }[]>`select product_id from product_fitment where model_id = ${modelARow.id}`;
      const fitmentB = await sql<{ product_id: string }[]>`select product_id from product_fitment where model_id = ${modelBRow.id}`;
      const productIdsForA = new Set(fitmentA.map((r) => r.product_id));
      const productIdsForB = new Set(fitmentB.map((r) => r.product_id));

      const sisters = await sql<{ id: string; price_total: number | null }[]>`
        select id, price_total from products
        where family_id = ${familyId} and article_no = ${sisterA.articleNo!} and active = true
      `;
      expect(sisters.length).toBe(2);
      const sisterARow = sisters.find((r) => productIdsForA.has(r.id));
      const sisterBRow = sisters.find((r) => productIdsForB.has(r.id));
      expect(Number(sisterARow?.price_total)).toBe(1100);
      expect(Number(sisterBRow?.price_total)).toBe(1200);

      const [famRow] = await sql<{ short_text: string | null }[]>`
        select short_text from model_families where id = ${familyId}
      `;
      expect(famRow.short_text).toBe(TEST_SHORT_TEXT);
    },
  );

  it("getProductsForModel liefert für Modell A nur dessen Fitments plus fits_all, Gruppen in Flow-Reihenfolge", async () => {
    const result = await getProductsForModel(modelAId);
    expect(result).not.toBeNull();
    expect(result!.model.slug).toBe("modell-a");
    expect(result!.family.slug).toBe(FAMILY_SLUG);

    let lastIdx = -1;
    for (const g of result!.groups) {
      const idx = FLOW_CATEGORIES.indexOf(g.category);
      expect(idx).toBeGreaterThanOrEqual(lastIdx);
      lastIdx = idx;
    }

    const fitmentRes = await sql<{ product_id: string }[]>`select product_id from product_fitment where model_id = ${modelAId}`;
    const fittingIds = new Set(fitmentRes.map((r) => r.product_id));
    const allProductIds = result!.groups.flatMap((g) => g.products.map((p) => p.id));
    const productsRes =
      allProductIds.length > 0
        ? await sql<{ id: string; fits_all: boolean }[]>`
            select id, fits_all from products where id = any(${allProductIds}::uuid[])
          `
        : [];
    const fitsAllById = new Map(productsRes.map((p) => [p.id, p.fits_all]));
    for (const id of allProductIds) {
      expect(fitsAllById.get(id) === true || fittingIds.has(id)).toBe(true);
    }

    // Der Schwester-Variante B (nur Modell B) darf hier nicht auftauchen.
    const names = result!.groups.flatMap((g) => g.products.map((p) => p.name));
    expect(names).toContain(ADDED_PRODUCT_NAME);
    expect(result!.notes.length).toBeGreaterThan(0);
  });
});
