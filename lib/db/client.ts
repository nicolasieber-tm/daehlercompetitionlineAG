// Postgres-Client für den Railway-Umbau (siehe docs/umbau-railway.md,
// Abschnitt "Datenzugriffsschicht"). Ersetzt lib/supabase/{client,server,
// admin}.ts: ein einziger, serverseitiger Pool über postgres.js, Zugriff
// ausschliesslich per DATABASE_URL, keine RLS mehr (jede Abfrage läuft
// serverseitig durch die App, siehe CLAUDE.md "Architektur").
//
// Spaltennamen bleiben snake_case wie bisher (kein `transform.column`),
// damit die Row-Typen in lib/db/rows.ts unverändert zu den bestehenden
// Supabase-Row-Typen bleiben.
import postgres from "postgres";

// numeric/decimal-Spalten (price_from, price_parts, estimated_total, ...)
// liefert postgres.js standardmässig als string (Präzisionsverlust bei
// Number wäre sonst still möglich). Für unsere Preisspalten ist das nicht
// relevant (Beträge in ganzen/halben Franken), Number ist hier gewollt statt
// string, damit die Row-Typen mit den bisherigen (aus Supabase generierten)
// Typen kompatibel bleiben.
const numeric: postgres.PostgresType<number> = {
  to: 1700,
  from: [1700],
  // parse() wird nur für nicht-null-Werte aufgerufen (postgres.js reicht sql
  // NULL unabhängig vom Typ direkt als null durch), daher hier ohne
  // eigene null-Prüfung.
  parse: (value: string) => Number(value),
  serialize: (value: number) => String(value),
};

// bigint (z.B. count(*)) ebenfalls als number statt BigInt/string: unsere
// Zähler bleiben weit unter Number.MAX_SAFE_INTEGER.
const bigint: postgres.PostgresType<number> = {
  to: 20,
  from: [20],
  parse: (value: string) => Number(value),
  serialize: (value: number) => String(value),
};

// date/timestamp/timestamptz: postgres.js parst diese standardmässig zu
// JS-Date-Objekten. Die bestehenden Row-Typen (lib/db/rows.ts, vormals aus
// Supabase generiert) tippen jede Zeitspalte als `string` (ISO 8601), weil
// PostgREST/Supabase JSON über HTTP liefert. Damit die Rückgabetypen der
// Query-Module beim Umstieg auf sql-Tagged-Templates unverändert bleiben
// (siehe docs/umbau-railway.md "Datenzugriffsschicht"), wird hier bewusst
// beim rohen Text-Wert geblieben statt ihn in ein Date zu parsen.
const timestamp: postgres.PostgresType<string> = {
  to: 1184,
  from: [1082, 1114, 1184],
  parse: (value: string) => value,
  serialize: (value: string | Date) =>
    value instanceof Date ? value.toISOString() : value,
};

function createSqlClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "lib/db/client.ts: DATABASE_URL ist nicht gesetzt. Siehe docs/db.md.",
    );
  }

  return postgres(connectionString, {
    max: 5,
    ssl: process.env.PGSSLMODE === "require" ? "require" : undefined,
    types: { numeric, bigint, timestamp },
  });
}

// globalThis-Guard: verhindert, dass Next.js' Dev-Server (Hot Reload lädt
// Module wiederholt neu) bei jedem Reload einen weiteren Verbindungspool
// aufbaut. In Produktion (ein Prozess pro Server-Instanz) unschädlich.
declare global {
  var __daehlerSql: ReturnType<typeof createSqlClient> | undefined;
}

export const sql = globalThis.__daehlerSql ?? createSqlClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__daehlerSql = sql;
}

/** Schliesst den Verbindungspool. Für Skripte (scripts/*.ts), die nach
 * getaner Arbeit beenden sollen, statt auf den Idle-Timeout zu warten. */
export async function closeDb() {
  await sql.end({ timeout: 5 });
}
