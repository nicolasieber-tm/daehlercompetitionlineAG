#!/usr/bin/env tsx
// Idempotentes Setup-Skript: legt die zwei Admin-User (dÄHLer, Trending
// Media) über better-auth an, siehe docs/db.md, Abschnitt "Admin-Konten".
// Nutzt auth.api.signUpEmail() direkt (serverseitig, ohne eingehenden
// Request) - lib/auth/server.ts blockiert Sign-up nur für Aufrufe MIT einem
// echten Request (also über die HTTP-Route), ein solcher interner Aufruf
// kommt dort ungehindert durch (siehe dortiger Kommentar).
//
// Aufruf: npm run db:admins
//
// Bereits vorhandene Konten (per E-Mail geprüft) werden übersprungen, das
// Skript kann also gefahrlos mehrfach laufen.
export {}; // macht die Datei zu einem Modul (isolierter Scope)

// Lokaler Dev-Fallback nur, damit das Skript ohne weiteres Setup gegen den
// lokalen Stack läuft (siehe docs/db.md). Für die Cloud-/Railway-Instanz
// zwingend per Umgebungsvariable überschreiben, siehe .env.example. Nur in
// NODE_ENV !== "production" aktiv, damit ein produktiver Lauf ohne gesetzte
// Passwort-Variable klar fehlschlägt, statt still ein bekanntes Passwort zu
// vergeben.
const LOCAL_DEV_PASSWORD_FALLBACK = "daehler-admin-2026!";

interface AdminAccount {
  email: string;
  name: string;
  passwordEnvVar: string;
  purpose: string;
}

const ACCOUNTS: AdminAccount[] = [
  {
    email: "admin@daehler.com",
    name: "dÄHLer Competition Line AG",
    passwordEnvVar: "ADMIN_DAEHLER_PASSWORD",
    purpose: "dÄHLer",
  },
  {
    email: "admin@trendingmedia.ch",
    name: "Trending Media",
    passwordEnvVar: "ADMIN_TRENDINGMEDIA_PASSWORD",
    purpose: "Trending Media",
  },
];

async function main() {
  // .env selbst laden (Node 24, kein dotenv-Paket in der freigegebenen
  // Paketliste): läuft sonst nur, wenn die Variablen schon im Prozess-Env
  // stehen. Kein Fehler, wenn .env fehlt (z. B. CI mit echten Env-Vars).
  try {
    process.loadEnvFile(".env");
  } catch {
    // .env nicht vorhanden oder nicht lesbar: process.env muss die
    // benötigten Variablen dann bereits enthalten.
  }

  // Dynamischer statt statischer Import: lib/auth/server.ts und
  // lib/db/client.ts bauen ihren Verbindungspool bereits beim Modul-Import
  // auf (DATABASE_URL/BETTER_AUTH_SECRET müssen dafür gesetzt sein). Ein
  // statischer `import` am Dateianfang würde von der JS-Modulauflösung VOR
  // dem obigen process.loadEnvFile() ausgewertet (ES-Module werden
  // instanziiert, bevor der Code des importierenden Moduls selbst läuft,
  // unabhängig von der Textreihenfolge) - das liesse DATABASE_URL/
  // BETTER_AUTH_SECRET hier immer als "nicht gesetzt" erscheinen, obwohl
  // .env sie enthält. Der dynamische import() lädt beide Module erst hier,
  // innerhalb von main(), nachdem .env bereits geladen ist.
  const { auth, closeAuthPool } = await import("../lib/auth/server");
  const { sql, closeDb } = await import("../lib/db/client");

  try {
    const existing = await sql<{ email: string }[]>`select email from "user"`;
    const existingEmails = new Set(existing.map((row) => row.email.toLowerCase()));

    let failed = false;

    for (const account of ACCOUNTS) {
      if (existingEmails.has(account.email.toLowerCase())) {
        console.log(`übersprungen (existiert bereits): ${account.email}`);
        continue;
      }

      const envPassword = process.env[account.passwordEnvVar];
      if (!envPassword && process.env.NODE_ENV === "production") {
        console.error(
          `Fehler: ${account.passwordEnvVar} ist nicht gesetzt (Fallback-Passwort ist in production nicht erlaubt).`,
        );
        failed = true;
        continue;
      }
      const password = envPassword || LOCAL_DEV_PASSWORD_FALLBACK;

      try {
        await auth.api.signUpEmail({
          body: { email: account.email, password, name: account.name },
        });
      } catch (err) {
        console.error(`Fehler beim Anlegen von ${account.email}:`, err instanceof Error ? err.message : err);
        failed = true;
        continue;
      }

      const source = envPassword
        ? account.passwordEnvVar
        : `Fallback-Passwort (${account.passwordEnvVar} nicht gesetzt)`;
      console.log(`angelegt: ${account.email} (${account.purpose}), Passwort aus ${source}`);
    }

    if (failed) {
      process.exitCode = 1;
    }
  } finally {
    await Promise.all([closeDb(), closeAuthPool()]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
