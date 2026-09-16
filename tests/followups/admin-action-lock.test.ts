// Prüfer-Befund (Punkt 1, Follow-up-Scheduler-Review): der Admin-Button
// «Fällige jetzt senden» (app/admin/actions/followups.ts,
// runDueFollowUpsAction()) rief runDueFollowUps() früher DIREKT auf und
// umging damit den Postgres-Advisory-Lock aus lib/followups/scheduler.ts -
// obwohl app/api/cron/follow-ups/route.ts und docs/deploy-railway.md /
// docs/umbau-railway.md ausdrücklich behaupten, Admin-Button und
// automatischer Lauf teilten sich dieselbe Lock-Logik. Dieser Test hält den
// Lock (wie tests/followups/cron-route.test.ts) und prüft, dass die Action
// dann NICHT sendet, sondern eine klare Meldung zurückgibt.
try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten.
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// requireAdmin() braucht ausserhalb eines laufenden Next.js-Requests
// next/headers (siehe lib/admin/auth.ts) - für diesen Action-Test irrelevant,
// es geht nur um die Lock-Logik danach, daher fest auf einen Admin-User
// gemockt.
vi.mock("@/lib/admin/auth", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "test-admin", email: "admin@example.com" }),
}));

// revalidatePath() braucht ebenfalls einen laufenden Next.js-Request-Kontext.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// runDueFollowUps() selbst wird nicht gebraucht: wenn die Action den Lock
// korrekt verwendet, kommt sie beim gehaltenen Lock gar nicht bis dahin.
// Ein Aufruf hier wäre also bereits ein Fehlschlag des Tests unten.
const runDueFollowUpsMock = vi.fn();
vi.mock("@/lib/followups/run", () => ({
  runDueFollowUps: (...args: unknown[]) => runDueFollowUpsMock(...args),
}));

import { sql } from "../helpers/db";
import { FOLLOW_UP_LOCK_KEY } from "@/lib/followups/scheduler";
import { runDueFollowUpsAction } from "@/app/admin/actions/followups";

beforeEach(() => {
  runDueFollowUpsMock.mockReset();
  runDueFollowUpsMock.mockResolvedValue({ sent: 0, skipped: 0, failed: 0, details: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runDueFollowUpsAction: teilt sich den Postgres-Advisory-Lock mit Scheduler/Cron-Route", () => {
  it("Lock bereits gehalten (z.B. der interne Scheduler läuft gerade) -> ok:false mit klarer Meldung, kein Versand", async () => {
    const reserved = await sql.reserve();
    try {
      const [row] = await reserved<{ locked: boolean }[]>`
        select pg_try_advisory_lock(${FOLLOW_UP_LOCK_KEY}) as locked
      `;
      expect(row?.locked).toBe(true);

      const result = await runDueFollowUpsAction();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/automatischer Lauf/);
      }
      expect(runDueFollowUpsMock).not.toHaveBeenCalled();
    } finally {
      await reserved`select pg_advisory_unlock(${FOLLOW_UP_LOCK_KEY})`;
      reserved.release();
    }
  });

  it("Lock frei -> läuft durch und sendet fällige Follow-ups", async () => {
    const result = await runDueFollowUpsAction();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toEqual({ sent: 0, skipped: 0, failed: 0, details: [] });
    }
    expect(runDueFollowUpsMock).toHaveBeenCalledTimes(1);
  });
});
