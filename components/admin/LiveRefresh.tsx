"use client";

// Live-Refresh der Anfragen-Übersicht (CLAUDE.md Abschnitt "AUFGABE",
// Punkt 1): pollt GET /api/admin/inquiries/heartbeat, solange der Tab
// sichtbar ist (document.visibilityState), sofort erneut bei Rückkehr in
// den Tab. Ändert sich count/latestCreatedAt/newCount gegenüber dem
// zuletzt bekannten Stand, ruft es router.refresh() (die Server Components
// - Übersicht UND app/admin/layout.tsx mit dem Sidebar-Zähler "neu" - laden
// dabei automatisch neu, keine eigene Zähler-Synchronisierung nötig) und
// hebt die seither neu hinzugekommenen Zeilen kurz hervor (siehe
// InquiriesTable.tsx highlightIds).
//
// Rendert Toolbar (mit dem "Aktualisieren"-Button samt Zeitstempel in den
// Actions) und InquiriesTable direkt selbst - beide brauchen denselben
// State (highlightIds, lastUpdated, refreshing), FilterBar/Pagination
// bleiben unverändert reine Server-Components und kommen als fertig
// gerenderte ReactNodes von app/admin/page.tsx herein. Einzige Poll-Quelle
// dieser Seite: kein anderer Admin-Bereich rendert diese Komponente.
import { useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { admin } from "@/lib/i18n/admin";
import { tf } from "@/lib/i18n/dictionaries";
import type { InquiryListRow } from "@/lib/admin/inquiries";
import { formatZurichTime, hasChanged, newRowIds } from "@/lib/admin/live-refresh";
import type { HeartbeatSnapshot } from "@/lib/admin/live-refresh";
import { Toolbar } from "./Toolbar";
import { InquiriesTable } from "./InquiriesTable";
import { rememberOverviewHref } from "./BackToOverviewLink";
import { useToast } from "./Toast";

const HIGHLIGHT_MS = 8_000;

interface HeartbeatResponse {
  ok: boolean;
  count?: number;
  latestCreatedAt?: string | null;
  newCount?: number;
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={spinning ? "animate-spin" : undefined}
    >
      <path d="M16.5 10a6.5 6.5 0 1 1-1.94-4.64" />
      <path d="M16.5 3.5v3.5H13" />
    </svg>
  );
}

export function LiveRefresh({
  title,
  subtitle,
  filterBar,
  pagination,
  rows,
  pollMs,
  initialHeartbeat,
}: {
  title: string;
  subtitle?: string;
  filterBar: ReactNode;
  pagination: ReactNode;
  rows: InquiryListRow[];
  pollMs: number;
  /** Stand beim Laden der Seite (app/admin/page.tsx getInquiriesHeartbeat()), Ausgangslage für den ersten Poll-Vergleich. */
  initialHeartbeat: HeartbeatSnapshot;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [highlightIds, setHighlightIds] = useState<ReadonlySet<string>>(() => new Set());
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());

  // Letzter bekannter Heartbeat-Stand (null = noch kein Poll gelaufen, siehe
  // hasChanged()) und die ids der zuletzt gerenderten Zeilen, für den
  // Vergleich nach dem nächsten Datenstand. Refs statt State: reine
  // Buchführung zwischen den Effekten unten, kein eigener Render nötig.
  const lastHeartbeatRef = useRef<HeartbeatSnapshot | null>(initialHeartbeat);
  const prevRowIdsRef = useRef<string[]>(rows.map((r) => r.id));
  const pendingHighlightRef = useRef(false);
  // Ort (Pfad + Filter) zum Zeitpunkt unseres Refreshs: nur wenn die neuen
  // Zeilen noch zur selben Ansicht gehören, werden sie als «neu» markiert.
  // Sonst würde eine Navigation (FilterBar/Pagination) im Zeitfenster bis zum
  // Eintreffen der Daten fremde Zeilen hervorheben (Prüfbefund G2).
  const pendingLocationRef = useRef<string | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locationKey = `${pathname}?${searchParams.toString()}`;
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Aktuelle Ansicht (Filter + Seite) für den Zurück-Link der Detailseite merken.
  const search = searchParams.toString();
  useEffect(() => {
    rememberOverviewHref(search);
  }, [search]);

  // Neue Daten sind eingetroffen (rows-Prop hat sich geändert: entweder
  // durch unseren eigenen router.refresh() unten, oder durch eine normale
  // Navigation, z.B. FilterBar/Pagination). Nur wenn WIR den Refresh
  // ausgelöst haben (pendingHighlightRef), werden neue Zeilen hervorgehoben
  // und der Zeitstempel aktualisiert - eine reine Filteränderung zeigt
  // dieselben (evtl. andere) Zeilen ohne "neu"-Hervorhebung.
  useEffect(() => {
    if (pendingHighlightRef.current && pendingLocationRef.current !== locationKey) {
      // Ansicht hat gewechselt: kein «neu», nur Buchführung zurücksetzen.
      pendingHighlightRef.current = false;
    } else if (pendingHighlightRef.current) {
      const ids = newRowIds(prevRowIdsRef.current, rows);
      if (ids.length > 0) {
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        setHighlightIds(new Set(ids));
        showToast(ids.length === 1 ? admin.list.live.toastOne : tf(admin.list.live.toastMany, { count: ids.length }));
        highlightTimeoutRef.current = setTimeout(() => setHighlightIds(new Set()), HIGHLIGHT_MS);
      }
      pendingHighlightRef.current = false;
      setLastUpdated(new Date());
    }
    prevRowIdsRef.current = rows.map((r) => r.id);
  }, [rows, showToast, locationKey]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  function refreshNow() {
    pendingHighlightRef.current = true;
    pendingLocationRef.current = locationKey;
    startTransition(() => {
      router.refresh();
    });
  }

  // Polling: nur solange der Tab sichtbar ist, sofort erneut bei Rückkehr.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (document.visibilityState !== "visible" || cancelled) return;
      let data: HeartbeatResponse;
      try {
        const res = await fetch("/api/admin/inquiries/heartbeat", { cache: "no-store" });
        if (!res.ok) return;
        data = (await res.json()) as HeartbeatResponse;
      } catch {
        // Netzwerkfehler: beim nächsten Tick erneut versuchen.
        return;
      }
      if (cancelled || !data.ok) return;

      const snapshot: HeartbeatSnapshot = {
        count: data.count ?? 0,
        latestCreatedAt: data.latestCreatedAt ?? null,
        newCount: data.newCount ?? 0,
      };
      if (hasChanged(lastHeartbeatRef.current, snapshot)) {
        pendingHighlightRef.current = true;
        startTransition(() => {
          router.refresh();
        });
      }
      lastHeartbeatRef.current = snapshot;
    }

    const intervalId = setInterval(poll, pollMs);
    function onVisibilityChange() {
      if (document.visibilityState === "visible") void poll();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pollMs, router]);

  return (
    <>
      <Toolbar
        title={title}
        subtitle={subtitle}
        actions={
          <button
            type="button"
            onClick={refreshNow}
            disabled={isPending}
            className="flex items-center gap-2.5 rounded-[2px] border border-line-alt px-3.5 py-2 font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted transition-colors hover:border-muted hover:text-text disabled:cursor-wait"
          >
            <RefreshIcon spinning={isPending} />
            <span>{isPending ? admin.list.live.refreshing : admin.list.live.refresh}</span>
            <span className="hidden font-normal normal-case tracking-normal text-dim sm:inline">
              · {tf(admin.list.live.lastUpdated, { time: formatZurichTime(lastUpdated) })}
            </span>
          </button>
        }
      />
      {filterBar}
      <InquiriesTable rows={rows} highlightIds={highlightIds} />
      {pagination}
    </>
  );
}
