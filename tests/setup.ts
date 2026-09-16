// Globales Test-Setup (siehe vitest.config.ts, test.setupFiles). Lädt .env
// wie es bisher jede DB-Testdatei einzeln tat (siehe z.B.
// tests/followups/support.ts) und schaltet RESEND_API_KEY für alle Tests
// hart aus: kein Test darf je einen echten Mailversand auslösen, auch nicht
// versehentlich in einer Datei, die "resend" nicht selbst mockt (siehe
// AUFGABE, Umgebung: "eigene Dev-Server auf Port 3100..3199 mit
// RESEND_API_KEY='' (kein Mailversand)").
try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten.
}

process.env.RESEND_API_KEY = "";
