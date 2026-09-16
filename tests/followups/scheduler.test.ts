// Tests für lib/followups/scheduler.ts (Follow-up-Scheduler, Posten 6, siehe
// CLAUDE.md "Follow-ups (Posten 6)" und docs/umbau-railway.md, Ergänzung
// 16.09.2026: "kein eigener Cron-Service, Follow-ups laufen im App-Prozess").
//
// runDueFollowUps() wird gemockt (kein echter Mailversand, volle Kontrolle
// über Timing und Fehler). Der Postgres-Advisory-Lock selbst läuft ECHT
// gegen den lokalen Postgres (siehe docs/db.md): das ist der Teil, der bei
// mehreren gleichzeitigen Instanzen bzw. einem Neustart mitten im Lauf
// tatsächlich vor doppeltem Versand schützt, ein Mock würde das nicht
// abdecken.
try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten.
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runDueFollowUpsMock = vi.fn();

vi.mock("@/lib/followups/run", () => ({
  runDueFollowUps: (...args: unknown[]) => runDueFollowUpsMock(...args),
}));

import {
  __setNowForTesting,
  isWithinSendWindow,
  runFollowUpsWithLock,
  startFollowUpScheduler,
  stopFollowUpScheduler,
} from "@/lib/followups/scheduler";
import { withLockTestMutex } from "./support";

// Zeitpunkte innerhalb/ausserhalb des Sendefensters (siehe scheduler.ts,
// isWithinSendWindow()), fest statt von der echten Uhrzeit beim Testlauf
// abhängig (die Tests laufen zu jeder Tages- und Nachtzeit). Januar gewählt,
// damit Europe/Zurich zuverlässig UTC+1 ist (keine Sommerzeit-Mehrdeutigkeit).
const WITHIN_WINDOW = () => new Date("2026-01-15T09:00:00.000Z"); // 10:00 Europe/Zurich
const OUTSIDE_WINDOW = () => new Date("2026-01-15T01:00:00.000Z"); // 02:00 Europe/Zurich

const EMPTY_RESULT = { sent: 0, skipped: 0, failed: 0, details: [] };

beforeEach(() => {
  runDueFollowUpsMock.mockReset();
  runDueFollowUpsMock.mockResolvedValue(EMPTY_RESULT);
});

afterEach(() => {
  // stopFollowUpScheduler() räumt einen evtl. noch laufenden Timer weg
  // (auch bei einem fehlgeschlagenen Assert mittendrin) und löst den
  // globalThis-Guard, damit der nächste Test wieder bei null anfängt.
  stopFollowUpScheduler();
  __setNowForTesting(null);
  delete process.env.FOLLOWUP_SCHEDULER;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("startFollowUpScheduler: Timer-Guard (genau ein Timer pro Prozess)", () => {
  it("zwei Aufrufe registrieren nur einen einzigen Timer", () => {
    process.env.FOLLOWUP_SCHEDULER = "1";
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");

    // Grosse Verzögerung, damit der Timer während dieses (synchronen) Tests
    // sicher nicht feuert - stopFollowUpScheduler() räumt ihn in afterEach
    // trotzdem auf.
    startFollowUpScheduler({ intervalMs: 60_000, initialDelayMs: 60_000 });
    startFollowUpScheduler({ intervalMs: 60_000, initialDelayMs: 60_000 });

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it("FOLLOWUP_SCHEDULER=0 startet nichts, auch nicht in NODE_ENV=production", () => {
    process.env.FOLLOWUP_SCHEDULER = "0";
    vi.stubEnv("NODE_ENV", "production");
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");

    startFollowUpScheduler({ intervalMs: 60_000, initialDelayMs: 60_000 });

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(runDueFollowUpsMock).not.toHaveBeenCalled();
  });

  it("ohne FOLLOWUP_SCHEDULER ist der Scheduler ausserhalb von NODE_ENV=production inaktiv", () => {
    delete process.env.FOLLOWUP_SCHEDULER;
    vi.stubEnv("NODE_ENV", "test");
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");

    startFollowUpScheduler({ intervalMs: 60_000, initialDelayMs: 60_000 });

    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });
});

describe("startFollowUpScheduler: Fehlerresistenz", () => {
  it("ein Fehler in runDueFollowUps() beendet den Timer nicht (mehrere Läufe trotz dauerhaftem Fehler)", async () => {
    // withLockTestMutex(): dieser Test hält über ~250ms hinweg wiederholt den
    // ECHTEN Produktions-Lock (FOLLOW_UP_LOCK_KEY) - ohne Koordination könnte
    // das mit dem Lock-Test in cron-route.test.ts kollidieren, der (in einem
    // anderen Vitest-Worker, siehe support.ts) parallel denselben Schlüssel
    // anfragt (flackernder Fehlschlag, siehe support.ts, withLockTestMutex()).
    await withLockTestMutex(async () => {
      process.env.FOLLOWUP_SCHEDULER = "1";
      // Fest innerhalb des Sendefensters (siehe __setNowForTesting oben): sonst
      // würde dieser Test ausserhalb von 07:00-18:00 Europe/Zurich fehlschlagen,
      // weil runSchedulerTick() dann jeden Tick überspringt, bevor
      // runDueFollowUps() überhaupt aufgerufen wird.
      __setNowForTesting(WITHIN_WINDOW);
      runDueFollowUpsMock.mockRejectedValue(new Error("simulierter Fehler in runDueFollowUps"));

      startFollowUpScheduler({ intervalMs: 40, initialDelayMs: 10 });

      // Real-Zeit-Warten statt vi.useFakeTimers(): runFollowUpsWithLock()
      // führt eine echte Postgres-Abfrage aus (Advisory-Lock), gefakte Timer
      // würden diese asynchrone I/O nicht zuverlässig weiterlaufen lassen.
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(runDueFollowUpsMock.mock.calls.length).toBeGreaterThanOrEqual(3);
      // Timer noch INNERHALB des Mutex stoppen: sonst könnte der laufende
      // Interval-Timer nach dem Freigeben des Mutex (aber vor afterEach) noch
      // einen weiteren, dann ungeschützten Tick auslösen.
      stopFollowUpScheduler();
    });
  });
});

describe("runFollowUpsWithLock: Postgres-Advisory-Lock", () => {
  it("zwei gleichzeitige Läufe gegen die lokale DB: einer läuft, der andere überspringt (skipped: 'locked')", async () => {
    // withLockTestMutex(): siehe support.ts - dieser Test hält den ECHTEN
    // Produktions-Lock absichtlich 200ms, das muss mit dem Lock-Test in
    // cron-route.test.ts (anderer Vitest-Worker) koordiniert werden.
    await withLockTestMutex(async () => {
      // Der erste Aufruf hält den Lock künstlich für 200ms (echter Timer, kein
      // Mock von setTimeout): der zweite, praktisch gleichzeitig gestartete
      // Aufruf muss in diesem Fenster versuchen, denselben Lock zu holen, und
      // ihn als bereits gehalten vorfinden.
      runDueFollowUpsMock.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(EMPTY_RESULT), 200)),
      );

      const [first, second] = await Promise.all([runFollowUpsWithLock(), runFollowUpsWithLock()]);

      const ran = [first, second].filter((outcome) => outcome.ran);
      const skipped = [first, second].filter((outcome) => !outcome.ran);

      expect(ran).toHaveLength(1);
      expect(skipped).toHaveLength(1);
      expect(skipped[0]).toEqual({ ran: false, reason: "locked" });
      expect(ran[0]).toEqual({ ran: true, result: EMPTY_RESULT });
      // Nur der Lauf, der den Lock bekommen hat, ruft runDueFollowUps() auf.
      expect(runDueFollowUpsMock).toHaveBeenCalledTimes(1);
    });
  });

  it("nacheinander (nicht überlappend) laufen beide durch, kein Lock bleibt hängen", async () => {
    await withLockTestMutex(async () => {
      runDueFollowUpsMock.mockResolvedValue(EMPTY_RESULT);

      const first = await runFollowUpsWithLock();
      const second = await runFollowUpsWithLock();

      expect(first).toEqual({ ran: true, result: EMPTY_RESULT });
      expect(second).toEqual({ ran: true, result: EMPTY_RESULT });
    });
  });
});

// Prüfer-Befund: der stündliche Timer allein hätte Follow-ups zu jeder
// Tages- und Nachtzeit verschickt (z.B. kurz nach Mitternacht, oder 5
// Minuten nach einem Deploy zu beliebiger Uhrzeit). isWithinSendWindow()
// grenzt das auf 07:00-18:00 Europe/Zurich ein (siehe scheduler.ts). Januar
// gewählt, damit Europe/Zurich zuverlässig UTC+1 ist (keine Sommerzeit-
// Mehrdeutigkeit an den Testdaten).
describe("isWithinSendWindow: Sendefenster 07:00-18:00 Europe/Zurich", () => {
  it("06:59 Europe/Zurich liegt ausserhalb (vor Fensterbeginn)", () => {
    expect(isWithinSendWindow(new Date("2026-01-15T05:59:00.000Z"))).toBe(false);
  });

  it("07:00 Europe/Zurich liegt innerhalb (Fensterbeginn, inklusiv)", () => {
    expect(isWithinSendWindow(new Date("2026-01-15T06:00:00.000Z"))).toBe(true);
  });

  it("17:59 Europe/Zurich liegt innerhalb (kurz vor Fensterende)", () => {
    expect(isWithinSendWindow(new Date("2026-01-15T16:59:00.000Z"))).toBe(true);
  });

  it("18:00 Europe/Zurich liegt ausserhalb (Fensterende, exklusiv)", () => {
    expect(isWithinSendWindow(new Date("2026-01-15T17:00:00.000Z"))).toBe(false);
  });

  it("02:00 Europe/Zurich (Nacht) liegt ausserhalb", () => {
    expect(isWithinSendWindow(new Date("2026-01-15T01:00:00.000Z"))).toBe(false);
  });
});

describe("startFollowUpScheduler: Sendefenster wird pro Tick geprüft", () => {
  it("ausserhalb des Sendefensters bleibt runDueFollowUps() ungenutzt, ohne den Lock anzufragen", async () => {
    process.env.FOLLOWUP_SCHEDULER = "1";
    __setNowForTesting(OUTSIDE_WINDOW);

    startFollowUpScheduler({ intervalMs: 60_000, initialDelayMs: 10 });
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(runDueFollowUpsMock).not.toHaveBeenCalled();
  });

  it("innerhalb des Sendefensters läuft der Tick wie gewohnt", async () => {
    // withLockTestMutex(): dieser Tick fragt den ECHTEN Produktions-Lock an
    // (siehe support.ts), muss also mit cron-route.test.ts koordiniert werden.
    await withLockTestMutex(async () => {
      process.env.FOLLOWUP_SCHEDULER = "1";
      __setNowForTesting(WITHIN_WINDOW);

      startFollowUpScheduler({ intervalMs: 60_000, initialDelayMs: 10 });
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(runDueFollowUpsMock).toHaveBeenCalledTimes(1);
      // Timer noch innerhalb des Mutex stoppen (siehe Kommentar oben bei der
      // Fehlerresistenz-Test), bevor der Mutex wieder freigegeben wird.
      stopFollowUpScheduler();
    });
  });
});
