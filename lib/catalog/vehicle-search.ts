// Suche im Fahrzeug-Schritt (Rückmeldung 06.11.2026: «M5 Touring» war nur
// über Scrollen durch alle Baureihen-Kacheln zu finden). Vorschläge erscheinen
// schon beim Tippen, jedes Suchwort muss nur ein Wortanfang sein: «1er» zeigt
// alle 1er-Baureihen, «F2» die Baureihen mit Code F20, F21, F22, F23,
// «M5 Touring» direkt die Version. Gross-/Kleinschreibung und Umlaute egal.
import type { CatalogFamily, CatalogModel } from "./queries";

export interface VehicleSearchHit {
  family: CatalogFamily;
  /** null = Treffer auf die ganze Baureihe, die Version wählt der Kunde danach. */
  model: CatalogModel | null;
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function words(text: string): string[] {
  return normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
}

function covers(haystack: string[], query: string[]): boolean {
  return query.every((q) => haystack.some((w) => w.startsWith(q)));
}

export function searchVehicles(families: CatalogFamily[], query: string, limit = 10): VehicleSearchHit[] {
  const q = words(query);
  if (q.length === 0) return [];

  const hits: VehicleSearchHit[] = [];
  for (const family of families) {
    const familyWords = words([family.brand, family.name, ...family.codes].join(" "));
    const modelWords = family.models.map((m) => words(m.name));

    // Passt die Suche schon ganz auf eine Version (z.B. «M5 Touring»),
    // werden die Versionen vorgeschlagen statt der Baureihe.
    const exactModels = family.models.filter((_, i) => covers(modelWords[i], q));
    if (covers(familyWords, q)) {
      if (exactModels.length > 0 && exactModels.length < family.models.length) {
        for (const model of exactModels) hits.push({ family, model });
      } else {
        hits.push({ family, model: null });
      }
      continue;
    }
    // Baureihe und Version zusammen, z.B. «3er 20d» oder «G20 M40i».
    family.models.forEach((model, i) => {
      if (covers([...familyWords, ...modelWords[i]], q)) hits.push({ family, model });
    });
  }
  return hits.slice(0, limit);
}
