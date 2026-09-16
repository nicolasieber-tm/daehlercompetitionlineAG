// Follow-up-Scheduler (Posten 6): löst fällige Follow-ups innerhalb des
// Next.js-Prozesses selbst aus, statt über einen separaten Railway-Cron-
// Dienst (siehe docs/umbau-railway.md, Zielarchitektur: "kein Cron-Dienst,
// Follow-ups in der App"). Gestartet aus instrumentation.ts (Next.js 15,
// register()) beim Hochfahren des Node-Runtime-Prozesses.
//
// app/api/cron/follow-ups/route.ts bleibt als manueller Auslöser bestehen
// (Admin "Fällige jetzt senden", scripts/cron-followups.ts) und teilt sich
// mit diesem Scheduler dieselbe Postgres-Advisory-Lock-Logik
// (runFollowUpsWithLock() unten), damit ein manueller Aufruf nie parallel zu
// einem automatischen Lauf sendet - und umgekehrt, falls (z. B. bei einem
// Rolling-Restart) kurzzeitig mehr als eine Instanz läuft.
//
// Der stündliche Timer läuft rund um die Uhr, sendet aber nur innerhalb des
// Sendefensters SEND_WINDOW_START_HOUR..SEND_WINDOW_END_HOUR (Europe/Zurich,
// siehe unten): ohne dieses Fenster wären automatische Follow-up-Mails an
// Kunden zu einer beliebigen Uhrzeit gegangen, u.a. nachts (Prüfer-Befund;
// der frühere Cron `0 5 * * *` = 07:00 Europe/Zurich hatte das vermieden).
import { sql } from "@/lib/db/client";
import { runDueFollowUps, type RunDueFollowUpsResult } from "./run";

/**
 * Fester Schlüssel für pg_try_advisory_lock()/pg_advisory_unlock(). Beliebig
 * gewählt, muss nur stabil und (im Rahmen dieser App) eindeutig sein:
 * schedule_follow_ups() (db/migrations/0001_init.sql) sperrt mit
 * pg_advisory_xact_lock() auf der jeweiligen inquiry_id, nicht mit einer
 * festen Konstante - keine Kollisionsgefahr mit diesem Schlüssel.
 */
export const FOLLOW_UP_LOCK_KEY = 72_193_004;

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 60 Minuten
const DEFAULT_INITIAL_DELAY_MS = 5 * 60 * 1000; // 5 Minuten

/**
 * Sendefenster (Prüfer-Befund: der stündliche Timer allein hätte Follow-ups
 * zu jeder Tages- und Nachtzeit verschickt, z.B. kurz nach Mitternacht oder
 * 5 Minuten nach einem Deploy zu beliebiger Uhrzeit - ein Regress gegenüber
 * dem früheren Cron `0 5 * * *`, 07:00 Europe/Zurich, siehe Git-Historie von
 * docs/deploy-railway.md). Ausserhalb dieses Fensters (Europe/Zurich)
 * überspringt runSchedulerTick() den Lauf, ohne den Advisory-Lock überhaupt
 * anzufragen: fällige Follow-ups bleiben liegen und werden beim nächsten
 * Tick innerhalb des Fensters gesendet, es geht nichts verloren.
 */
export const SEND_WINDOW_START_HOUR = 7; // 07:00 Europe/Zurich (inklusiv)
export const SEND_WINDOW_END_HOUR = 18; // 18:00 Europe/Zurich (exklusiv)

/**
 * Stunde (0-23) von `date` in Europe/Zurich. `hourCycle: "h23"` verhindert
 * einen bekannten Intl-Stolperstein: `hour12: false` liefert für Mitternacht
 * in manchen Node-/ICU-Versionen "24" statt "00".
 */
function zurichHour(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    hourCycle: "h23",
    hour: "2-digit",
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value;
  return hour !== undefined ? Number(hour) : date.getHours();
}

/** true zwischen SEND_WINDOW_START_HOUR (inklusiv) und SEND_WINDOW_END_HOUR
 * (exklusiv), Europe/Zurich. Exportiert für Tests. */
export function isWithinSendWindow(date: Date): boolean {
  const hour = zurichHour(date);
  return hour >= SEND_WINDOW_START_HOUR && hour < SEND_WINDOW_END_HOUR;
}

/**
 * "Jetzt"-Quelle für runSchedulerTick(), für Tests austauschbar (siehe
 * __setNowForTesting() unten), ohne dafür globale Timer/`Date` faken zu
 * müssen - die Tests in runFollowUpsWithLock() nutzen bewusst echte Timer,
 * weil eine echte Postgres-Abfrage beteiligt ist (siehe Testkommentar).
 */
let nowOverride: (() => Date) | null = null;

function currentTime(): Date {
  return nowOverride ? nowOverride() : new Date();
}

/** Nur für Tests: überschreibt currentTime() (z.B. um einen Tick deterministisch
 * innerhalb/ausserhalb des Sendefensters laufen zu lassen, unabhängig von der
 * tatsächlichen Uhrzeit beim Testlauf). `null` setzt auf die echte Systemzeit
 * zurück. */
export function __setNowForTesting(factory: (() => Date) | null): void {
  nowOverride = factory;
}

export interface StartFollowUpSchedulerOptions {
  /** Abstand zwischen zwei Läufen. Standard: 60 Minuten. */
  intervalMs?: number;
  /** Wartezeit bis zum ersten Lauf nach dem Start. Standard: 5 Minuten,
   * überschreibbar über FOLLOWUP_SCHEDULER_INITIAL_DELAY_MS (z. B. für
   * einen schnellen Smoke-Test nach `npm start`). */
  initialDelayMs?: number;
}

export type RunFollowUpsOutcome = { ran: true; result: RunDueFollowUpsResult } | { ran: false; reason: "locked" };

/**
 * Holt den Advisory-Lock über eine eigene, reservierte Verbindung (der Lock
 * ist an die Postgres-Session gebunden, siehe Postgres-Doku zu
 * pg_try_advisory_lock: Lock und Unlock müssen auf derselben Verbindung
 * laufen). Gelingt das nicht (ein anderer Prozess/Lauf hält den Lock schon),
 * wird der Aufruf übersprungen statt zu warten - mehrere Instanzen oder ein
 * Neustart mitten im Lauf dürfen nie gleichzeitig Follow-ups versenden.
 * Der Lock wird in jedem Fall (auch bei einem Fehler in runDueFollowUps())
 * wieder freigegeben.
 */
export async function runFollowUpsWithLock(): Promise<RunFollowUpsOutcome> {
  const reserved = await sql.reserve();
  try {
    const [row] = await reserved<{ locked: boolean }[]>`
      select pg_try_advisory_lock(${FOLLOW_UP_LOCK_KEY}) as locked
    `;
    if (!row?.locked) {
      return { ran: false, reason: "locked" };
    }
    try {
      const result = await runDueFollowUps();
      return { ran: true, result };
    } finally {
      await reserved`select pg_advisory_unlock(${FOLLOW_UP_LOCK_KEY})`;
    }
  } finally {
    reserved.release();
  }
}

/** Ein Lauf des Schedulers: fängt jeden Fehler ab und loggt kompakt, damit
 * weder ein Fehlschlag noch ein übersprungener Lauf den Prozess je beendet
 * oder den Timer stoppt. */
async function runSchedulerTick(): Promise<void> {
  try {
    if (!isWithinSendWindow(currentTime())) {
      console.info(
        `followUpScheduler: ausserhalb des Sendefensters (${SEND_WINDOW_START_HOUR}:00-${SEND_WINDOW_END_HOUR}:00 Europe/Zurich), Lauf übersprungen.`,
      );
      return;
    }
    const outcome = await runFollowUpsWithLock();
    if (!outcome.ran) {
      console.info("followUpScheduler: Lauf übersprungen (Lock bereits von einem anderen Prozess gehalten).");
      return;
    }
    const { sent, skipped, failed } = outcome.result;
    console.info(`followUpScheduler: Lauf abgeschlossen (sent=${sent}, skipped=${skipped}, failed=${failed}).`);
  } catch (error) {
    console.error("followUpScheduler: Lauf fehlgeschlagen.", error);
  }
}

/**
 * true, wenn der Scheduler in dieser Umgebung aktiv sein soll:
 * FOLLOWUP_SCHEDULER=0 schaltet ihn immer aus, FOLLOWUP_SCHEDULER=1 immer
 * ein, ohne die Variable ist er nur in NODE_ENV=production aktiv (Tests und
 * lokale Entwicklung bleiben damit standardmässig ohne Hintergrund-Timer).
 */
function isSchedulerEnabled(): boolean {
  const flag = process.env.FOLLOWUP_SCHEDULER;
  if (flag === "0") return false;
  if (flag === "1") return true;
  return process.env.NODE_ENV === "production";
}

function resolveInitialDelayMs(explicit: number | undefined): number {
  if (explicit !== undefined) return explicit;
  const fromEnv = process.env.FOLLOWUP_SCHEDULER_INITIAL_DELAY_MS;
  if (fromEnv === undefined || fromEnv === "") return DEFAULT_INITIAL_DELAY_MS;
  const parsed = Number(fromEnv);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_INITIAL_DELAY_MS;
}

interface SchedulerState {
  timeout: NodeJS.Timeout | null;
  interval: NodeJS.Timeout | null;
}

// globalThis-Guard (wie lib/db/client.ts, __daehlerSql): verhindert, dass
// zwei Aufrufe von startFollowUpScheduler() (z. B. Next.js' Dev-Server bei
// Hot Reload, oder ein versehentlicher zweiter Aufruf aus
// instrumentation.ts) je einen zweiten Timer im selben Prozess anlegen. Der
// Guard greift, BEVOR isSchedulerEnabled() geprüft wird: auch zwei Aufrufe
// bei deaktiviertem Scheduler dürfen nicht zu unterschiedlichem Verhalten
// führen.
declare global {
  var __daehlerFollowUpSchedulerState: SchedulerState | undefined;
}

/**
 * Startet den Scheduler für diesen Prozess (genau einmal, siehe Guard
 * oben). Ohne FOLLOWUP_SCHEDULER=1 bzw. ausserhalb von NODE_ENV=production
 * passiert nichts (siehe isSchedulerEnabled()). Der erste Lauf erfolgt nach
 * `initialDelayMs`, danach alle `intervalMs`. Beide Timer sind `unref()`t,
 * damit ein wartender Timer den Prozess nicht künstlich am Beenden hindert.
 * Jeder einzelne Tick sendet aber nur innerhalb des Sendefensters
 * (SEND_WINDOW_START_HOUR..SEND_WINDOW_END_HOUR, siehe runSchedulerTick()),
 * ausserhalb davon wird der Tick übersprungen und geloggt.
 */
export function startFollowUpScheduler(options: StartFollowUpSchedulerOptions = {}): void {
  if (globalThis.__daehlerFollowUpSchedulerState) {
    return;
  }
  const state: SchedulerState = { timeout: null, interval: null };
  globalThis.__daehlerFollowUpSchedulerState = state;

  if (!isSchedulerEnabled()) {
    console.info("followUpScheduler: deaktiviert (FOLLOWUP_SCHEDULER=0 oder nicht NODE_ENV=production).");
    return;
  }

  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const initialDelayMs = resolveInitialDelayMs(options.initialDelayMs);

  console.info(
    `followUpScheduler: gestartet (initialDelayMs=${initialDelayMs}, intervalMs=${intervalMs}, ` +
      `Sendefenster=${SEND_WINDOW_START_HOUR}:00-${SEND_WINDOW_END_HOUR}:00 Europe/Zurich).`,
  );

  state.timeout = setTimeout(() => {
    void runSchedulerTick();
    state.interval = setInterval(() => {
      void runSchedulerTick();
    }, intervalMs);
    state.interval.unref();
  }, initialDelayMs);
  state.timeout.unref();
}

/** Stoppt beide Timer und löst den Guard - für Tests, damit jeder Test mit
 * einem sauberen Ausgangszustand beginnt. In Produktion nicht benötigt. */
export function stopFollowUpScheduler(): void {
  const state = globalThis.__daehlerFollowUpSchedulerState;
  if (state) {
    if (state.timeout) clearTimeout(state.timeout);
    if (state.interval) clearInterval(state.interval);
  }
  globalThis.__daehlerFollowUpSchedulerState = undefined;
}
