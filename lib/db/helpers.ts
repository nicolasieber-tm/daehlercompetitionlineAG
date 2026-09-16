// Kleine Hilfsfunktionen für den Postgres-Datenzugriff (siehe
// docs/umbau-railway.md, Abschnitt "Datenzugriffsschicht").

/** Teilt ein Array in Häppchen der Grösse `size`. Für Batch-Inserts/-Updates
 * mit sql(rows), die sonst bei sehr grossen Preislisten-Importen eine
 * einzelne, zu lange Query ergäben. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error("chunk: size muss grösser als 0 sein.");
  }

  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

/** Serialisiert einen Wert für eine jsonb-Spalte. postgres.js erwartet für
 * jsonb-Parameter entweder sql.json(value) oder einen bereits als Text
 * serialisierten String; toJson() kapselt Letzteres für Stellen, die keinen
 * sql-Tag zur Hand haben (z.B. Objektaufbau vor der Query). */
export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}
