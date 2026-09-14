// Regressionstest für Befund #2 (Prüfbericht): matchFamilyProducts() muss
// "Schwester"-Produkte mit gleichem Namen/gleicher Artikelnummer, aber
// unterschiedlichem Fitment, auch dann korrekt zuordnen, wenn die DB-Zeilen
// in unbestimmter Reihenfolge geliefert werden (kein ORDER BY beim SELECT in
// diff.ts/apply.ts) - siehe docs/excel-import.md, Abschnitt "Sonderfälle".
//
// Reiner Unit-Test ohne DB-Zugriff (im Gegensatz zu diff-apply.test.ts):
// matchFamilyProducts ist eine pure Funktion über ParsedProduct[]/Product[],
// die simulierte DB-Reihenfolge macht den Fehler deterministisch reproduzier-
// bar statt von der tatsächlichen, nicht garantierten Postgres-Reihenfolge
// abhängig zu sein.
import { describe, expect, it } from "vitest";
import { matchFamilyProducts } from "@/lib/pricelist/diff";
import { makeDbProduct, makeParsedProduct } from "./support";

describe("matchFamilyProducts (Befund #2: Schwester-Produkte, DB-Reihenfolge unbestimmt)", () => {
  it("ordnet eine geänderte Zeile ihrer eigenen DB-Zeile zu, nicht der unveränderten Schwester (Bericht-Repro)", () => {
    const category = "fahrwerk" as const;
    const name = "Sportfahrwerk höhenverstellbar";
    const articleNo = "31 30 XXX";

    // DB-Zustand vor dem Import: D1 (20i/30i/18d/20d) zu 2000, D2 (M40i/30d/M40d) zu 2400.
    const d1Hash = "d1-old-hash-2000";
    const d2Hash = "d2-current-hash-2400";
    const d1 = makeDbProduct({
      name,
      category,
      article_no: articleNo,
      price_total: 2000,
      content_hash: d1Hash,
      source_row: 101,
    });
    const d2 = makeDbProduct({
      name,
      category,
      article_no: articleNo,
      price_total: 2400,
      content_hash: d2Hash,
      source_row: 102,
    });

    // Excel-Reihenfolge: P1 (20i/30i.., Preis geändert) vor P2 (M40i.., unverändert).
    const p1 = makeParsedProduct({
      name,
      category,
      articleNo,
      fits: ["20i", "30i", "18d", "20d"],
      priceTotalChf: 2100, // geändert gegenüber D1 (2000) -> anderer content_hash als d1Hash
      sourceRow: 201,
    });
    const p2 = makeParsedProduct({
      name,
      category,
      articleNo,
      fits: ["M40i", "30d", "M40d"],
      priceTotalChf: 2400, // unverändert -> gleicher content_hash wie d2Hash
      contentHash: d2Hash,
      sourceRow: 202,
    });

    // DB liefert die Zeilen absichtlich in umgekehrter Reihenfolge (D2 vor D1),
    // wie es ein SELECT ohne ORDER BY tun könnte.
    const { matches, removedProducts } = matchFamilyProducts([p1, p2], [d2, d1], new Map());

    expect(removedProducts).toEqual([]);
    expect(matches[0]?.product.id).toBe(d1.id);
    expect(matches[0]?.matchedBy).toBe("article_no_name");
    expect(matches[1]?.product.id).toBe(d2.id);
    expect(matches[1]?.matchedBy).toBe("content_hash");
  });

  it("bevorzugt bei mehreren offenen Kandidaten für denselben Schlüssel die Zeile mit gleichem source_row", () => {
    const category = "fahrwerk" as const;
    const name = "Sportfahrwerk X";
    const articleNo = "12 34 567";

    const d1 = makeDbProduct({ name, category, article_no: articleNo, price_total: 2000, content_hash: "d1-old", source_row: 501 });
    const d2 = makeDbProduct({ name, category, article_no: articleNo, price_total: 2400, content_hash: "d2-old", source_row: 502 });

    // Beide Zeilen ändern sich diesmal (kein content_hash-Treffer für keine
    // der beiden) - die Fallback-Zuordnung muss trotzdem stabil bleiben.
    const p1 = makeParsedProduct({ name, category, articleNo, fits: ["20i", "30i"], priceTotalChf: 2050, sourceRow: 501 });
    const p2 = makeParsedProduct({ name, category, articleNo, fits: ["M40i"], priceTotalChf: 2450, sourceRow: 502 });

    const { matches, removedProducts } = matchFamilyProducts([p1, p2], [d2, d1], new Map());

    expect(removedProducts).toEqual([]);
    expect(matches[0]?.product.id).toBe(d1.id);
    expect(matches[0]?.matchedBy).toBe("article_no_name");
    expect(matches[1]?.product.id).toBe(d2.id);
    expect(matches[1]?.matchedBy).toBe("article_no_name");
  });

  it("bevorzugt bei mehreren offenen Kandidaten ohne passenden source_row die Zeile mit identischem Fitment", () => {
    const category = "fahrwerk" as const;
    const name = "Sportfahrwerk Y";
    const articleNo = "98 76 543";

    const d1 = makeDbProduct({ name, category, article_no: articleNo, price_total: 2000, content_hash: "d1-old", source_row: 10 });
    const d2 = makeDbProduct({ name, category, article_no: articleNo, price_total: 2400, content_hash: "d2-old", source_row: 20 });
    // Altes Fitment aus product_fitment (vor diesem Import), source_row hat sich in der neuen Excel verschoben.
    const oldFits = new Map([
      [d1.id, ["20i", "30i"]],
      [d2.id, ["M40i"]],
    ]);

    const p1 = makeParsedProduct({ name, category, articleNo, fits: ["20i", "30i"], priceTotalChf: 2050, sourceRow: 999 });
    const p2 = makeParsedProduct({ name, category, articleNo, fits: ["M40i"], priceTotalChf: 2450, sourceRow: 998 });

    const { matches } = matchFamilyProducts([p1, p2], [d2, d1], oldFits);

    expect(matches[0]?.product.id).toBe(d1.id);
    expect(matches[1]?.product.id).toBe(d2.id);
  });

  it("Grundfall: neu (kein Match), entfernt (DB-Zeile ohne Excel-Treffer), per name+category geändert (ohne article_no)", () => {
    const category = "raeder" as const;
    const keep = makeDbProduct({ name: "Distanzscheiben Satz", category, content_hash: "keep-hash" });
    const gone = makeDbProduct({ name: "Altes Zubehör", category, content_hash: "gone-hash" });

    const pKeepChanged = makeParsedProduct({
      name: "Distanzscheiben Satz",
      category,
      priceTotalChf: 555, // anderer Preis -> anderer content_hash als "keep-hash"
    });
    const pNew = makeParsedProduct({ name: "Ganz neues Produkt", category, priceTotalChf: 111 });

    const { matches, removedProducts } = matchFamilyProducts([pKeepChanged, pNew], [keep, gone], new Map());

    expect(matches[0]?.product.id).toBe(keep.id);
    expect(matches[0]?.matchedBy).toBe("name_category");
    expect(matches[1]).toBeNull();
    expect(removedProducts.map((p) => p.id)).toEqual([gone.id]);
  });
});
