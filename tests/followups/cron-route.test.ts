// Route-Handler direkt aufrufen (kein echter HTTP-Server), siehe
// tests/health.test.ts fürs Muster. Deckt nur die Auth-Prüfung ab (kein
// DB-Zugriff nötig: die Route antwortet vor runDueFollowUps() mit 401).
try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten.
}

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/cron/follow-ups/route";
import { sql } from "@/lib/db/client";
import { FOLLOW_UP_LOCK_KEY } from "@/lib/followups/scheduler";
import { withLockTestMutex } from "./support";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "test-cron-secret";
});

afterEach(() => {
  if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
});

function request(headers?: Record<string, string>) {
  return new NextRequest("http://localhost/api/cron/follow-ups", { headers });
}

describe("GET/POST /api/cron/follow-ups: Autorisierung", () => {
  it("GET ohne Authorization-Header -> 401", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it("POST ohne Authorization-Header -> 401", async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it("falsches Secret -> 401", async () => {
    const response = await POST(request({ Authorization: "Bearer falsches-secret" }));
    expect(response.status).toBe(401);
  });

  it("falsches Schema (kein 'Bearer ') -> 401", async () => {
    const response = await POST(request({ Authorization: "test-cron-secret" }));
    expect(response.status).toBe(401);
  });

  it("ohne gesetztes CRON_SECRET: auch das korrekte Bearer-Format ist nicht autorisiert", async () => {
    delete process.env.CRON_SECRET;
    const response = await POST(request({ Authorization: "Bearer irgendwas" }));
    expect(response.status).toBe(401);
  });
});

describe("POST /api/cron/follow-ups: Postgres-Advisory-Lock (lib/followups/scheduler.ts)", () => {
  it("Lock bereits gehalten (z.B. der interne Scheduler läuft gerade) -> 200 { ok: true, skipped: 'locked' }, kein Versand, kein Fehler", async () => {
    // withLockTestMutex(): dieser Test hält den ECHTEN Produktions-Lock
    // (FOLLOW_UP_LOCK_KEY) - muss mit den entsprechenden Tests in
    // scheduler.test.ts (anderer Vitest-Worker) koordiniert werden, siehe
    // tests/followups/support.ts.
    await withLockTestMutex(async () => {
      // Lock auf einer eigenen, reservierten Verbindung halten (session-
      // gebunden, siehe lib/followups/scheduler.ts): simuliert einen parallel
      // laufenden Scheduler-Tick bzw. eine zweite Instanz.
      const reserved = await sql.reserve();
      try {
        const [row] = await reserved<{ locked: boolean }[]>`
          select pg_try_advisory_lock(${FOLLOW_UP_LOCK_KEY}) as locked
        `;
        expect(row?.locked).toBe(true);

        const response = await POST(request({ Authorization: "Bearer test-cron-secret" }));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({ ok: true, skipped: "locked" });
      } finally {
        await reserved`select pg_advisory_unlock(${FOLLOW_UP_LOCK_KEY})`;
        reserved.release();
      }
    });
  });
});
