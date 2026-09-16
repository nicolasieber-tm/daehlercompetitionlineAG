#!/usr/bin/env tsx
// Hilfsskript für lokale Tests von /api/cron/follow-ups: ruft den Endpoint
// mit dem Bearer-Token aus CRON_SECRET auf. In Produktion übernimmt das
// Railway Cron (siehe docs/architektur.md, Abschnitt "Follow-ups").
//
// Aufruf: npm run cron:followups (gegen den laufenden Dev-Server, npm run dev).

// .env selbst laden (Node 24, kein dotenv-Paket in der freigegebenen
// Paketliste), wie scripts/mail-test.ts/create-admin-users.ts: ein
// eigenständiges tsx-Skript bekommt .env sonst nicht automatisch geladen
// (anders als `next dev`/`next build`).
try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten.
}

async function main() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET ist nicht gesetzt (siehe .env.example).");
    process.exitCode = 1;
    return;
  }

  const url = `${baseUrl}/api/cron/follow-ups`;

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cronSecret}` },
  });

  console.log(`${response.status} ${response.statusText}`);
  console.log(await response.text());

  if (!response.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  // Netzwerkfehler (App nicht erreichbar, DNS, ...) sollen denselben
  // Exit-Code auslösen wie eine Fehlerantwort (siehe oben), statt sich auf
  // Node's Default-Verhalten bei unhandled rejections zu verlassen -
  // Railway Cron wertet den Exit-Code aus, um einen fehlgeschlagenen Lauf
  // zu erkennen (siehe docs/deploy-railway.md).
  console.error("cron-followups: Aufruf fehlgeschlagen.", error);
  process.exitCode = 1;
});
