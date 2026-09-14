#!/usr/bin/env tsx
// Hilfsskript für lokale Tests von /api/cron/follow-ups: ruft den Endpoint
// mit dem Bearer-Token aus CRON_SECRET auf. In Produktion übernimmt das
// Railway Cron (siehe docs/architektur.md, Abschnitt "Follow-ups").

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

main();
