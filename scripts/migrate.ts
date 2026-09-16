#!/usr/bin/env tsx
// Migrationsrunner für den lokalen/Railway-Postgres (siehe
// docs/umbau-railway.md, Abschnitt "Zielarchitektur", Phase E1). Ersetzt
// `npx supabase db reset`: wendet db/migrations/*.sql in Namensreihenfolge
// an (je Datei eine Transaktion), merkt sich den Stand in
// schema_migrations, --seed spielt danach db/seed.sql erneut ein
// (idempotent, siehe dortige on-conflict-Klauseln), --status zeigt nur an,
// welche Migrationen bereits angewendet sind.
//
// Aufruf: npm run db:migrate | npm run db:seed | tsx scripts/migrate.ts --status
//
// .env selbst laden (Node 24, kein dotenv-Paket in der freigegebenen
// Paketliste), wie scripts/cron-followups.ts/mail-test.ts: ein
// eigenständiges tsx-Skript bekommt .env sonst nicht automatisch geladen.
try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten
  // (z.B. auf Railway, wo sie als Service-Variablen gesetzt sind).
}

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");
const SEED_FILE = path.join(process.cwd(), "db", "seed.sql");

function migrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

async function main() {
  const args = process.argv.slice(2);
  const doSeed = args.includes("--seed");
  const statusOnly = args.includes("--status");

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("DATABASE_URL ist nicht gesetzt (siehe .env.example).");
    process.exitCode = 1;
    return;
  }

  // max: 1 reicht für ein sequenzielles Skript und vermeidet, dass mehrere
  // Migrationen versehentlich parallel auf unterschiedlichen Verbindungen
  // laufen (jede läuft ohnehin in ihrer eigenen sql.begin()-Transaktion,
  // aber nacheinander auf derselben Verbindung ist hier einfacher zu
  // verfolgen und reicht für ein CLI-Skript völlig aus).
  const sql = postgres(connectionString, {
    max: 1,
    // "relation already exists, skipping"-Hinweise (create table if not
    // exists / create extension if not exists) sind hier erwartetes
    // Verhalten bei einem erneuten Lauf, keine Fehlermeldung wert.
    onnotice: () => {},
  });

  try {
    await sql`
      create table if not exists schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `;

    const files = migrationFiles();
    const appliedRows = await sql<{ name: string }[]>`
      select name from schema_migrations
    `;
    const applied = new Set(appliedRows.map((row) => row.name));

    if (statusOnly) {
      if (files.length === 0) {
        console.log(`Keine Migrationsdateien in ${MIGRATIONS_DIR}.`);
        return;
      }
      for (const file of files) {
        console.log(`${applied.has(file) ? "[x]" : "[ ]"} ${file}`);
      }
      return;
    }

    const pending = files.filter((file) => !applied.has(file));

    if (pending.length === 0) {
      console.log("Keine offenen Migrationen.");
    }

    for (const file of pending) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      console.log(`Wende an: ${file}`);

      // Eine Transaktion je Migrationsdatei: schlägt eine Datei fehl, bleibt
      // schema_migrations unverändert und der nächste Lauf versucht sie
      // erneut, statt eine halb angewendete Migration als erledigt zu
      // markieren.
      await sql.begin(async (tx) => {
        await tx.file(filePath);
        await tx`insert into schema_migrations (name) values (${file})`;
      });
    }

    if (doSeed) {
      console.log(`Seed: ${path.relative(process.cwd(), SEED_FILE)}`);
      await sql.file(SEED_FILE);
    }

    console.log("Fertig.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
