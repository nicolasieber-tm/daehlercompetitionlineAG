// Reine Logik für den Live-Refresh der Anfragen-Übersicht (CLAUDE.md
// Abschnitt "AUFGABE", Punkt 1): getrennt von components/admin/LiveRefresh.tsx
// (React/Browser-APIs, next/navigation), damit sie ohne Rendering/DOM
// testbar ist (siehe tests/admin/live-refresh.test.ts).
export interface HeartbeatSnapshot {
  count: number;
  latestCreatedAt: string | null;
  newCount: number;
}

/**
 * Entscheidet, ob ein neuer Heartbeat-Stand gegenüber dem zuletzt bekannten
 * einen router.refresh() rechtfertigt. `prev === null` (noch kein Poll seit
 * dem Laden der Seite gelaufen) liefert bewusst `false`: der erste Poll legt
 * nur die Ausgangslage fest, ohne sofort eine Aktualisierung samt
 * Hervorhebung auszulösen (die Seite zeigt zu diesem Zeitpunkt ohnehin schon
 * den beim Laden aktuellen Stand).
 */
export function hasChanged(prev: HeartbeatSnapshot | null, next: HeartbeatSnapshot): boolean {
  if (!prev) return false;
  return prev.count !== next.count || prev.latestCreatedAt !== next.latestCreatedAt || prev.newCount !== next.newCount;
}

/**
 * Liefert die id der Zeilen aus `currentRows`, die in `previousIds` noch
 * nicht vorkamen - für die Hervorhebung neu hinzugekommener Anfragen nach
 * einem router.refresh(). Reihenfolge wie `currentRows` (neueste zuerst,
 * siehe lib/admin/inquiries.ts listInquiries()).
 */
export function newRowIds(previousIds: readonly string[], currentRows: readonly { id: string }[]): string[] {
  const seen = new Set(previousIds);
  return currentRows.filter((row) => !seen.has(row.id)).map((row) => row.id);
}

/** "09:41" in Europe/Zurich, für den Zeitstempel "zuletzt aktualisiert" in der Toolbar. */
export function formatZurichTime(date: Date): string {
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** Standard-Poll-Intervall (ms), per Env ADMIN_POLL_MS überschreibbar (Tests: 3000ms statt 30000ms). */
export const DEFAULT_ADMIN_POLL_MS = 30_000;

/** Liest ADMIN_POLL_MS serverseitig (app/admin/page.tsx), fällt auf DEFAULT_ADMIN_POLL_MS zurück. */
export function resolvePollMs(rawValue: string | undefined): number {
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ADMIN_POLL_MS;
}
