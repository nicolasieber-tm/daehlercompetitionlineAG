// Rückmeldung Klicktest 22.09.2026 (Varianten und Zusätze visuell
// unterscheiden): die Produkte eines Rasters im Kategorie-Schritt werden in
// Blöcke geteilt, je Exklusivgruppe (variant_group) ein Block «Eine Variante
// wählen» mit Kreis-Indikator, danach alle kombinierbaren Produkte als Block
// «Ergänzungen» mit Quadrat-Indikator (components/flow/steps/CategoryStep.tsx
// renderClusters(), components/ui/Tile.tsx `indicator`). Reine Funktion ohne
// React, damit sie wie beforeAfter.ts/upsell.ts testbar bleibt.
import type { CatalogProduct } from "@/lib/catalog/queries";
import { axleOf, isPerAxleGroup } from "@/lib/catalog/variant-groups";

export interface ProductCluster {
  kind: "single" | "multi";
  /** true, wenn Produkte des Blocks eine Achse nennen (VA/HA): «Je Achse eine Variante wählen». */
  perAxle: boolean;
  products: CatalogProduct[];
}

/**
 * Exklusivgruppen mit mindestens zwei sichtbaren Produkten werden je ein
 * "single"-Block (Reihenfolge nach erstem Vorkommen), alles andere ein
 * abschliessender "multi"-Block in Originalreihenfolge. Eine Exklusivgruppe
 * mit nur EINEM sichtbaren Produkt hat hier keine Alternative und wird wie
 * eine Ergänzung gezeigt (die Exklusivität im Reducer bleibt unberührt).
 */
export function clusterProducts(products: CatalogProduct[]): ProductCluster[] {
  const byGroup = new Map<string, CatalogProduct[]>();
  for (const p of products) {
    if (!p.variantGroup) continue;
    const arr = byGroup.get(p.variantGroup);
    if (arr) arr.push(p);
    else byGroup.set(p.variantGroup, [p]);
  }
  const singleGroups = new Set([...byGroup.entries()].filter(([, arr]) => arr.length > 1).map(([g]) => g));
  const clusters: ProductCluster[] = [...byGroup.entries()]
    .filter(([g]) => singleGroups.has(g))
    .map(([g, arr]) => ({
      kind: "single",
      perAxle: isPerAxleGroup(g) && arr.some((p) => axleOf(p.name) !== null),
      products: arr,
    }));
  const multi = products.filter((p) => !p.variantGroup || !singleGroups.has(p.variantGroup));
  if (multi.length > 0) clusters.push({ kind: "multi", perAxle: false, products: multi });
  return clusters;
}
