// GET /api/admin/inquiries/heartbeat (CLAUDE.md Abschnitt "AUFGABE",
// Punkt 1/4): ohne Session 401, mit Session die erwartete JSON-Form. Wie
// tests/followups/admin-action-lock.test.ts mockt dies getAdminUser()
// (statt next/headers/better-auth in einem echten Request nachzubilden) -
// die eigentliche Session-Prüfung selbst ist bereits in
// tests/admin/auth.test.ts abgedeckt.
try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten.
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const getAdminUserMock = vi.fn();
vi.mock("@/lib/admin/auth", () => ({
  getAdminUser: (...args: unknown[]) => getAdminUserMock(...args),
}));

import { GET } from "@/app/api/admin/inquiries/heartbeat/route";
import { sql } from "../helpers/db";
import { deleteInquiriesByNumberPrefix } from "../helpers/db";

const RUN_ID = Date.now();
const NUMBER_PREFIX = `TEST-HB-${RUN_ID}`;

beforeEach(() => {
  getAdminUserMock.mockReset();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await deleteInquiriesByNumberPrefix(NUMBER_PREFIX);
});

describe("GET /api/admin/inquiries/heartbeat: Autorisierung", () => {
  it("ohne Session -> 401", async () => {
    getAdminUserMock.mockResolvedValue(null);
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
  });
});

describe("GET /api/admin/inquiries/heartbeat: mit Session", () => {
  it("liefert { ok: true, count, latestCreatedAt, newCount } und zählt eine frisch angelegte 'neu'-Anfrage mit", async () => {
    getAdminUserMock.mockResolvedValue({ id: "test-admin", email: "admin@example.com" });

    const before = await GET();
    const beforeBody = await before.json();
    expect(before.status).toBe(200);
    expect(beforeBody).toMatchObject({ ok: true });
    expect(typeof beforeBody.count).toBe("number");
    expect(typeof beforeBody.newCount).toBe("number");

    const createdAt = new Date().toISOString();
    await sql`
      insert into inquiries (
        number, share_token, status, first_name, last_name, city, email, phone, channel,
        character, timing, created_at
      ) values (
        ${`${NUMBER_PREFIX}-A`}, ${randomUUID()}, 'neu', 'Nadia', 'Muster', 'Belp',
        'nadia@example.com', '079 000 00 00', 'email', 'sportlich', 'flexible', ${createdAt}
      )
    `;

    const after = await GET();
    const afterBody = await after.json();
    expect(after.status).toBe(200);
    expect(afterBody.ok).toBe(true);
    expect(afterBody.count).toBe(beforeBody.count + 1);
    expect(afterBody.newCount).toBe(beforeBody.newCount + 1);
    expect(afterBody.latestCreatedAt).toBe(new Date(createdAt).toISOString());
  });
});
