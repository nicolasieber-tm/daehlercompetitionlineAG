// Reine Logik des Live-Refresh der Übersicht (CLAUDE.md Abschnitt
// "AUFGABE", Punkt 1/4): hasChanged()/newRowIds() ohne Rendering/DOM
// testbar, siehe lib/admin/live-refresh.ts.
import { describe, expect, it } from "vitest";
import { formatZurichTime, hasChanged, newRowIds, resolvePollMs } from "@/lib/admin/live-refresh";
import type { HeartbeatSnapshot } from "@/lib/admin/live-refresh";

function snapshot(overrides: Partial<HeartbeatSnapshot> = {}): HeartbeatSnapshot {
  return { count: 10, latestCreatedAt: "2026-09-17T09:00:00.000Z", newCount: 2, ...overrides };
}

describe("hasChanged", () => {
  it("liefert false, wenn prev null ist (erster Poll legt nur die Ausgangslage fest)", () => {
    expect(hasChanged(null, snapshot())).toBe(false);
  });

  it("liefert false bei identischem Stand", () => {
    expect(hasChanged(snapshot(), snapshot())).toBe(false);
  });

  it("liefert true bei geänderter Gesamtzahl (count)", () => {
    expect(hasChanged(snapshot(), snapshot({ count: 11 }))).toBe(true);
  });

  it("liefert true bei geänderter jüngster created_at", () => {
    expect(hasChanged(snapshot(), snapshot({ latestCreatedAt: "2026-09-17T09:05:00.000Z" }))).toBe(true);
  });

  it("liefert true bei geänderter Anzahl Status 'neu' (z.B. eine Anfrage wurde in einem anderen Fenster bearbeitet)", () => {
    expect(hasChanged(snapshot(), snapshot({ newCount: 1 }))).toBe(true);
  });

  it("latestCreatedAt null -> null bleibt unverändert (keine leere Anfragenliste als Änderung)", () => {
    const empty = snapshot({ count: 0, latestCreatedAt: null, newCount: 0 });
    expect(hasChanged(empty, { ...empty })).toBe(false);
  });
});

describe("newRowIds", () => {
  it("liefert nur die ids, die vorher noch nicht bekannt waren, in Reihenfolge von currentRows", () => {
    const ids = newRowIds(["a", "b"], [{ id: "c" }, { id: "a" }, { id: "d" }, { id: "b" }]);
    expect(ids).toEqual(["c", "d"]);
  });

  it("keine neuen Zeilen -> leeres Array", () => {
    expect(newRowIds(["a", "b"], [{ id: "b" }, { id: "a" }])).toEqual([]);
  });

  it("leere Vorgeschichte -> alle aktuellen Zeilen gelten als neu", () => {
    expect(newRowIds([], [{ id: "a" }, { id: "b" }])).toEqual(["a", "b"]);
  });

  it("leere aktuelle Liste -> leeres Array", () => {
    expect(newRowIds(["a"], [])).toEqual([]);
  });
});

describe("resolvePollMs", () => {
  it("fällt ohne ADMIN_POLL_MS auf den Standardwert (30000) zurück", () => {
    expect(resolvePollMs(undefined)).toBe(30_000);
  });

  it("übernimmt einen gültigen, positiven Wert (Test-Override, z.B. 3000)", () => {
    expect(resolvePollMs("3000")).toBe(3000);
  });

  it("ignoriert einen ungültigen Wert (0, negativ, kein Zahl-Text) und fällt zurück", () => {
    expect(resolvePollMs("0")).toBe(30_000);
    expect(resolvePollMs("-5")).toBe(30_000);
    expect(resolvePollMs("abc")).toBe(30_000);
    expect(resolvePollMs("")).toBe(30_000);
  });
});

describe("formatZurichTime", () => {
  it("formatiert als HH:mm in Europe/Zurich (Sommerzeit, +2)", () => {
    // 2026-07-01 07:41:00 UTC -> 09:41 CEST
    expect(formatZurichTime(new Date("2026-07-01T07:41:00.000Z"))).toBe("09:41");
  });

  it("formatiert als HH:mm in Europe/Zurich (Winterzeit, +1)", () => {
    // 2026-01-15 08:05:00 UTC -> 09:05 CET
    expect(formatZurichTime(new Date("2026-01-15T08:05:00.000Z"))).toBe("09:05");
  });
});
