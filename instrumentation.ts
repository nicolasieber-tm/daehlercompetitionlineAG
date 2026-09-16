// Next.js 15 Instrumentation Hook (in Next 15 standardmässig aktiv, keine
// next.config.ts-Option nötig): register() läuft einmal beim Start jedes
// Server-Prozesses, auch im Edge-Runtime-Bundle. Startet dort ausschliesslich
// den Follow-up-Scheduler (Posten 6, siehe docs/umbau-railway.md,
// Zielarchitektur: "kein Cron-Dienst, Follow-ups in der App") und nur für
// die Node-Runtime: der dynamische Import innerhalb der Bedingung stellt
// sicher, dass lib/followups/scheduler.ts (Postgres-Zugriff über
// lib/db/client.ts, "pg"/"postgres") nie ins Edge-Bundle gelangt.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startFollowUpScheduler } = await import("@/lib/followups/scheduler");
    startFollowUpScheduler();
  }
}
