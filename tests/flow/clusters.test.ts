// Rückmeldung Klicktest 22.09.2026: Blöcke «Eine Variante wählen» /
// «Ergänzungen» im Kategorie-Schritt (components/flow/clusters.ts). Namen
// aus der DB (Räder-Gruppenzeile Distanzscheiben, Bremse M3/M4 G80).
import { describe, expect, it } from "vitest";
import { clusterProducts } from "@/components/flow/clusters";
import type { CatalogProduct } from "@/lib/catalog/queries";

function product(id: string, name: string, variantGroup: string | null): CatalogProduct {
  return {
    id,
    name,
    description: null,
    category: "raeder",
    sourceCategory: "Räder",
    groupLabel: null,
    articleNo: null,
    priceParts: null,
    priceInstall: null,
    priceApproval: null,
    priceTotal: 100,
    priceStatus: "priced",
    priceNote: null,
    psBase: [],
    psTo: null,
    nmTo: null,
    variantGroup,
    gearbox: null,
    bodyStyles: [],
    drive: null,
    sort: 0,
  };
}

describe("clusterProducts", () => {
  it("Distanzscheiben-Grössen werden ein Varianten-Block, Radschrauben und Gutachten ein Ergänzungs-Block", () => {
    const clusters = clusterProducts([
      product("d4", "Distanzscheibe 4mm", "distanzscheiben"),
      product("d11", "Distanzscheibe 11mm", "distanzscheiben"),
      product("d15", "Distanzscheibe 15mm", "distanzscheiben"),
      product("s", "Satz Radschrauben (schwarz)", null),
      product("g", "DTC Gutachten zu Distanzscheiben", null),
    ]);
    expect(clusters.map((c) => [c.kind, c.perAxle, c.products.map((p) => p.id)])).toEqual([
      ["single", false, ["d4", "d11", "d15"]],
      ["multi", false, ["s", "g"]],
    ]);
  });

  it("Bremsbeläge mit VA/HA bilden einen Varianten-Block «je Achse»", () => {
    const clusters = clusterProducts([
      product("both", "Sportbremsbeläge für Serienbremsanlage für M3, M4", "bremsbelaege"),
      product("va", "Sportbremsbeläge für Serienbremsanlage VA", "bremsbelaege"),
      product("ha", "Sportbremsbeläge für Serienbremsanlage HA", "bremsbelaege"),
      product("flex", "Stahlflexbremsleitungen", null),
    ]);
    expect(clusters[0]).toMatchObject({ kind: "single", perAxle: true });
    expect(clusters[0].products.map((p) => p.id)).toEqual(["both", "va", "ha"]);
    expect(clusters[1]).toMatchObject({ kind: "multi", perAxle: false });
  });

  it("«HA» in einer nicht achsbezogenen Gruppe (Federsätze) ergibt keinen «je Achse»-Block", () => {
    const clusters = clusterProducts([
      product("f1", "Sportfedernsatz für M3 xDrive / -28mm / HA 8mm", "fahrwerk"),
      product("f2", "Sportfedernsatz für M3 xDrive / -27mm / HA 16mm", "fahrwerk"),
    ]);
    expect(clusters).toEqual([{ kind: "single", perAxle: false, products: expect.any(Array) }]);
  });

  it("eine Exklusivgruppe mit nur einem sichtbaren Produkt zählt als Ergänzung (keine Alternative im Raster)", () => {
    const clusters = clusterProducts([
      product("m", "Motorhaube Carbon", "motorhaube"),
      product("s", "Spiegelkappen Carbon", null),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].kind).toBe("multi");
    expect(clusters[0].products.map((p) => p.id)).toEqual(["m", "s"]);
  });

  it("mehrere Exklusivgruppen ergeben mehrere Varianten-Blöcke in Reihenfolge des ersten Vorkommens", () => {
    const clusters = clusterProducts([
      product("g1", "Frontgrill Carbon", "frontgrill"),
      product("h1", "Heckspoiler Carbon", "heckspoiler"),
      product("g2", "Frontgrill CS Carbon", "frontgrill"),
      product("h2", "Heckflügel Carbon", "heckspoiler"),
    ]);
    expect(clusters.map((c) => c.products.map((p) => p.id))).toEqual([
      ["g1", "g2"],
      ["h1", "h2"],
    ]);
    expect(clusters.every((c) => c.kind === "single")).toBe(true);
  });

  it("leere Liste ergibt keine Blöcke", () => {
    expect(clusterProducts([])).toEqual([]);
  });
});
