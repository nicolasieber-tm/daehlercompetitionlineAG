// URL-Parameter-Validierung der Anfragen-Übersicht (app/admin/page.tsx,
// Prüfbefund admin-page, Punkt 2): reine Funktionen aus
// lib/admin/inquiries.ts, keine DB/kein Next.js-Server nötig. Ein ungültiger
// Parameter (falsches Datumsformat, kein Datum, keine UUID, Seite < 1, nicht
// numerisch, unbekannter Status) wird ignoriert (undefined/Standardwert)
// statt einen Fehler zu werfen - damit app/admin/page.tsx bei einer von Hand
// verstümmelten URL nie mit 500 abstürzt.
import { describe, expect, it } from "vitest";
import {
  parseDateParam,
  parseFamilyIdParam,
  parsePageParam,
  parseStatusParam,
} from "@/lib/admin/inquiries";

describe("parseStatusParam()", () => {
  it("lässt bekannte Statuswerte durch", () => {
    expect(parseStatusParam("neu")).toBe("neu");
    expect(parseStatusParam("in_bearbeitung")).toBe("in_bearbeitung");
    expect(parseStatusParam("beantwortet")).toBe("beantwortet");
    expect(parseStatusParam("abgeschlossen")).toBe("abgeschlossen");
  });

  it("fällt bei unbekanntem/fehlendem Wert auf 'alle' zurück, statt zu werfen", () => {
    expect(parseStatusParam("erledigt")).toBe("alle");
    expect(parseStatusParam("")).toBe("alle");
    expect(parseStatusParam(undefined)).toBe("alle");
    expect(parseStatusParam("<script>")).toBe("alle");
  });
});

describe("parsePageParam()", () => {
  it("lässt positive Ganzzahlen durch", () => {
    expect(parsePageParam("1")).toBe(1);
    expect(parsePageParam("42")).toBe(42);
  });

  it("fällt bei ungültigen Werten auf Seite 1 zurück (page ≥ 1)", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-5")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam("")).toBe(1);
    expect(parsePageParam("1.5")).toBe(1);
    expect(parsePageParam("NaN")).toBe(1);
  });

  it("sehr grosse, aber syntaktisch gültige Seitenzahlen (page ≤ Seitenzahl wird erst per DB-Abfrage geprüft) kommen unverändert durch", () => {
    expect(parsePageParam("99")).toBe(99);
  });
});

describe("parseDateParam()", () => {
  it("lässt gültige YYYY-MM-DD-Daten durch", () => {
    expect(parseDateParam("2026-09-15")).toBe("2026-09-15");
    expect(parseDateParam("2024-02-29")).toBe("2024-02-29"); // Schaltjahr
  });

  it("ignoriert falsches Format, statt zu werfen", () => {
    expect(parseDateParam("abc")).toBeUndefined();
    expect(parseDateParam("15.09.2026")).toBeUndefined();
    expect(parseDateParam("2026-9-15")).toBeUndefined(); // fehlende führende Nullen
    expect(parseDateParam("2026/09/15")).toBeUndefined();
    expect(parseDateParam("")).toBeUndefined();
    expect(parseDateParam(undefined)).toBeUndefined();
    expect(parseDateParam("2026-09-15T00:00:00Z")).toBeUndefined();
  });

  it("ignoriert syntaktisch passende, aber nicht existierende Kalendertage", () => {
    expect(parseDateParam("2026-02-30")).toBeUndefined();
    expect(parseDateParam("2026-13-01")).toBeUndefined();
    expect(parseDateParam("2025-02-29")).toBeUndefined(); // kein Schaltjahr
  });
});

describe("parseFamilyIdParam()", () => {
  it("lässt eine gültige UUID durch", () => {
    const uuid = "f3b1b8b0-6c3a-4e2a-9f0a-1234567890ab";
    expect(parseFamilyIdParam(uuid)).toBe(uuid);
  });

  it("akzeptiert Grossbuchstaben-UUIDs", () => {
    const uuid = "F3B1B8B0-6C3A-4E2A-9F0A-1234567890AB";
    expect(parseFamilyIdParam(uuid)).toBe(uuid);
  });

  it("ignoriert Nicht-UUIDs, statt sie ungeprüft an die DB-Abfrage weiterzureichen", () => {
    expect(parseFamilyIdParam("abc")).toBeUndefined();
    expect(parseFamilyIdParam("1")).toBeUndefined();
    expect(parseFamilyIdParam("../../etc/passwd")).toBeUndefined();
    expect(parseFamilyIdParam("f3b1b8b0-6c3a-4e2a-9f0a")).toBeUndefined(); // zu kurz
    expect(parseFamilyIdParam("")).toBeUndefined();
    expect(parseFamilyIdParam(undefined)).toBeUndefined();
  });
});
