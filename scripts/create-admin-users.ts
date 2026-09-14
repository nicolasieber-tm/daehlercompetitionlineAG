#!/usr/bin/env tsx
// Idempotentes Setup-Skript: legt die zwei Admin-User (dÄHLer, Trending
// Media) im lokalen Supabase-Auth an, siehe docs/db.md, Abschnitt "Zwei
// Admin-User anlegen". `npx supabase db reset` leert auth.users mit,
// darum nach jedem Reset erneut ausführen:
//
//   npx tsx scripts/create-admin-users.ts
//
// (kein npm-Script vorhanden, package.json ist gesperrt, siehe Bericht).
// Bereits vorhandene Konten (per E-Mail geprüft) werden übersprungen, das
// Skript kann also gefahrlos mehrfach laufen.
export {}; // macht die Datei zu einem Modul (isolierter Scope)

// .env selbst laden (Node 24, kein dotenv-Paket in der freigegebenen
// Paketliste): läuft sonst nur, wenn die Variablen schon im Prozess-Env
// stehen. Kein Fehler, wenn .env fehlt (z. B. CI mit echten Env-Vars).
try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden oder nicht lesbar: process.env muss die
  // benötigten Variablen dann bereits enthalten.
}

import { createAdminClient } from "../lib/supabase/admin";

// Lokaler Dev-Fallback nur, damit das Skript ohne weiteres Setup gegen den
// lokalen Stack läuft (siehe docs/db.md). Für die Cloud-Instanz zwingend
// per Umgebungsvariable überschreiben, siehe .env.example.
const LOCAL_DEV_PASSWORD_FALLBACK = "daehler-admin-2026!";

interface AdminAccount {
  email: string;
  passwordEnvVar: string;
  purpose: string;
}

const ACCOUNTS: AdminAccount[] = [
  {
    email: "admin@daehler.com",
    passwordEnvVar: "ADMIN_DAEHLER_PASSWORD",
    purpose: "dÄHLer",
  },
  {
    email: "admin@trendingmedia.ch",
    passwordEnvVar: "ADMIN_TRENDINGMEDIA_PASSWORD",
    purpose: "Trending Media",
  },
];

async function main() {
  const client = createAdminClient();

  // Bestehende User einmal laden (kleine, feste Anzahl an Admin-Konten,
  // darum reicht eine Seite ohne weitere Pagination).
  const { data: existing, error: listError } = await client.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    console.error("Konnte bestehende Auth-User nicht laden:", listError.message);
    process.exitCode = 1;
    return;
  }

  const existingEmails = new Set(
    existing.users.map((user) => user.email?.toLowerCase()).filter(Boolean),
  );

  let failed = false;

  for (const account of ACCOUNTS) {
    if (existingEmails.has(account.email.toLowerCase())) {
      console.log(`übersprungen (existiert bereits): ${account.email}`);
      continue;
    }

    const password = process.env[account.passwordEnvVar] || LOCAL_DEV_PASSWORD_FALLBACK;

    const { error: createError } = await client.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
    });

    if (createError) {
      console.error(`Fehler beim Anlegen von ${account.email}:`, createError.message);
      failed = true;
      continue;
    }

    const source = process.env[account.passwordEnvVar]
      ? account.passwordEnvVar
      : `Fallback-Passwort (${account.passwordEnvVar} nicht gesetzt)`;
    console.log(`angelegt: ${account.email} (${account.purpose}), Passwort aus ${source}`);
  }

  if (failed) {
    process.exitCode = 1;
  }
}

main();
