// Grundprüfung der neuen Postgres-Datenzugriffsschicht (siehe
// docs/umbau-railway.md, Phase E1): eine einfache Query läuft durch, und
// next_inquiry_number() liefert das dokumentierte Format JJJJ-NNNN (siehe
// db/migrations/0001_init.sql).
import { describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";

describe("lib/db/client", () => {
  it("führt eine einfache Query aus", async () => {
    const rows = await sql<{ value: number }[]>`select 1 as value`;

    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(1);
  });

  it("next_inquiry_number() liefert das Format JJJJ-NNNN", async () => {
    const [row] = await sql<{ next_inquiry_number: string }[]>`
      select next_inquiry_number()
    `;

    expect(row.next_inquiry_number).toMatch(/^\d{4}-\d{4,}$/);
  });
});
