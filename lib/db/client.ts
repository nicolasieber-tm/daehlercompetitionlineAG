// Postgres-Client für den Railway-Umbau (siehe docs/umbau-railway.md,
// Abschnitt "Datenzugriffsschicht"): ein einziger, serverseitiger Pool über
// postgres.js, Zugriff ausschliesslich per DATABASE_URL, keine RLS mehr
// (jede Abfrage läuft serverseitig durch die App, siehe CLAUDE.md
// "Architektur").
//
// Spaltennamen bleiben snake_case (kein `transform.column`), damit die
// Row-Typen in lib/db/rows.ts unverändert bleiben.
import postgres from "postgres";

// numeric/decimal-Spalten (price_from, price_parts, estimated_total, ...)
// liefert postgres.js standardmässig als string (Präzisionsverlust bei
// Number wäre sonst still möglich). Für unsere Preisspalten ist das nicht
// relevant (Beträge in ganzen/halben Franken), Number ist hier gewollt, damit
// die Row-Typen (lib/db/rows.ts) mit `number` typisieren können.
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

// date (Kalenderdatum ohne Uhrzeit, z.B. follow_ups.scheduled_for): Rohtext
// "YYYY-MM-DD" bleibt unverändert. postgres.js parst date standardmässig zu
// einem JS-Date-Objekt (in Server-Lokalzeit um Mitternacht), das wäre für
// einen reinen Kalendertag falsch (Zeitzonen-Verschiebung könnte auf den
// Vor-/Folgetag rutschen) und bräche den String-Vergleich in
// lib/followups/run.ts (`scheduled_for <= today`, beides "YYYY-MM-DD"-Text).
const date: postgres.PostgresType<string> = {
  to: 1082,
  from: [1082],
  parse: (value: string) => value,
  serialize: (value: string | Date) =>
    value instanceof Date ? value.toISOString().slice(0, 10) : value,
};

// timestamp/timestamptz: postgres.js liefert hier standardmässig ein
// JS-Date-Objekt; die Row-Typen (lib/db/rows.ts) tippen jede Zeitspalte
// aber als `string` (ISO 8601, wie es der bisherige PostgREST/JSON-Output
// lieferte). Befund aus Phase E1 (Bericht): der frühere eigene Typ gab statt
// eines echten ISO-8601-Strings Postgres' rohes Textformat zurück ("YYYY-MM-DD
// HH:mm:ss.sss+ZZ", Leerzeichen statt "T", Offset ohne Doppelpunkt) - hier
// deshalb über `new Date(value).toISOString()` in einen echten, UTC-
// normalisierten ISO-8601-String ("...T...Z") umgewandelt. Für timestamptz
// ist das verlustfrei (derselbe Zeitpunkt, nur andere Schreibweise); für
// timestamp ohne Zeitzone (aktuell keine Spalte im Schema) interpretiert
// `new Date()` den Text mangels Offset in der Zeitzone des Node-Prozesses.
const timestamp: postgres.PostgresType<string> = {
  to: 1184,
  from: [1114, 1184],
  parse: (value: string) => new Date(value).toISOString(),
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
    types: { numeric, bigint, date, timestamp },
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
