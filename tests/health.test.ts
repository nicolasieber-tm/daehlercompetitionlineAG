// GET /api/health prüft seit der Railway-Vorbereitung (docs/umbau-railway.md,
// Phase E3) die DB-Verbindung selbst (`select 1`) statt nur "läuft die
// App" zu melden - Railway nutzt genau diese Route als healthcheckPath
// (railway.json) und startet den Service sonst neu, obwohl die App ohne
// DB-Zugriff ohnehin nichts Sinnvolles tun kann.
import { afterEach, describe, expect, it, vi } from "vitest";

describe("GET /api/health", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/db/client");
  });

  it("liefert { ok: true, db: true } bei erreichbarer DB (gegen die echte lokale DB)", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, db: true });
  });

  it("liefert 503 { ok: false, db: false }, wenn die DB nicht erreichbar ist", async () => {
    vi.doMock("@/lib/db/client", () => ({
      sql: () => {
        throw new Error("Verbindung fehlgeschlagen (simuliert)");
      },
    }));
    vi.resetModules();

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ ok: false, db: false });
  });
});
