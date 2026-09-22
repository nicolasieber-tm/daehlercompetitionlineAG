// Railway-Projekt als Code (Infrastructure as Code, ersetzt seit 22.09.2026
// die frühere railway.json, die Railway ab 01.12.2026 nicht mehr liest).
// Grundlage: `railway config pull` (Projektzustand vom 22.09.2026) plus die
// Deploy-Einstellungen aus der alten railway.json. Anwenden mit
// `railway config plan` (Vorschau) und `railway config apply`; Railway liest
// diese Datei NICHT beim Deploy, nur die CLI. Siehe docs/deploy-railway.md.
//
// Variablenwerte (Secrets) bleiben mit preserve() auf Railway und stehen
// nicht im Repo. Neue Variablen im Dashboard anlegen und hier mit preserve()
// nachtragen, sonst würde `railway config apply` sie als «nicht deklariert»
// löschen wollen (der Plan zeigt das als destruktive Änderung an).
import { bucket, defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "europe-west4-drams3a" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const postgresVolume = volume("postgres-volume", {
    alerts: { usage: { "100": {}, "80": {}, "95": {} } },
    allowOnlineResize: true,
    region: "europe-west4-drams3a",
    sizeMB: 50000,
  });
  // Point-in-Time-Recovery-Bucket des Postgres-Service (Railway Pro).
  const PostgresPITR = bucket("Postgres-PITR", { region: "ams" });

  const app = service("daehlercompetitionlineAG", {
    source: github("nicolasieber-tm/daehlercompetitionlineAG", { checkSuites: false }),
    build: { builder: "RAILPACK" },
    deploy: {
      // scripts/start.sh: Migrationen, Seed, Admin-Konten, optional
      // Preislisten-Import (IMPORT_ON_START=1), dann Next.js.
      startCommand: "bash scripts/start.sh",
      // app/api/health/route.ts prüft auch die DB; 600 s Toleranz, weil der
      // Start Migrationen und Seed ausführt.
      healthcheckPath: "/api/health",
      healthcheckTimeout: 600,
      // Neustart-Regel bewusst nicht gesetzt: die alte railway.json hatte
      // ON_FAILURE mit 10 Versuchen, das ist exakt der Railway-Standard
      // («The default is On Failure with a maximum of 10 restarts»). Über
      // IaC gesetzt liest Railway den Wert nach dem Apply als null zurück
      // (Stand CLI 5.57.2 / SDK 3.11.0), der Plan meldete dann dauerhaft
      // eine offene Änderung.
    },
    replicas: { "europe-west4-drams3a": 1 },
    networking: { privateNetworkEndpoint: "daehlercompetitionlineag" },
    env: {
      ADMIN_DAEHLER_PASSWORD: preserve(),
      ADMIN_TRENDINGMEDIA_PASSWORD: preserve(),
      ANTHROPIC_API_KEY: preserve(),
      BETTER_AUTH_SECRET: preserve(),
      BETTER_AUTH_URL: preserve(),
      CRON_SECRET: preserve(),
      DATABASE_URL: preserve(),
      IMPORT_ON_START: preserve(),
      NEXT_PUBLIC_APP_URL: preserve(),
      RESEND_API_KEY: preserve(),
      RESEND_FROM_OVERRIDE: preserve(),
    },
  });

  return project("Dähler Competition Line AG", {
    resources: [app, Postgres, postgresVolume, PostgresPITR],
  });
});
