// Grundprüfung der neuen Postgres-Datenzugriffsschicht (siehe
// docs/umbau-railway.md, Phase E1): eine einfache Query läuft durch,
// next_inquiry_number() liefert das dokumentierte Format JJJJ-NNNN (siehe
// db/migrations/0001_init.sql), und timestamp/timestamptz/date werden wie
// in lib/db/client.ts dokumentiert geparst (Befund aus Phase E3: vorher kam
// Postgres' Rohtext statt eines echten ISO-8601-Strings zurück).
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";

describe("lib/db/client", () => {
  it("führt eine einfache Query aus", async () => {
    const rows = await sql<{ value: number }[]>`select 1 as value`;

    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(1);
  });

  describe("next_inquiry_number()", () => {
    // next_inquiry_number() erhöht `inquiry_counters.last` für das laufende
    // Jahr (Europe/Zurich) atomar, siehe db/migrations/0001_init.sql. Damit
    // dieser Test keine bleibende Lücke in der Nummernfolge hinterlässt,
    // wird der Vorzustand der betroffenen Zeile gesichert (`beforeLast`,
    // `undefined` wenn die Zeile noch nicht existierte) und danach exakt
    // wiederhergestellt.
    let beforeYear: number | null = null;
    let beforeLast: number | undefined;

    afterEach(async () => {
      if (beforeYear === null) return;
      if (beforeLast === undefined) {
        await sql`delete from inquiry_counters where year = ${beforeYear}`;
      } else {
        await sql`update inquiry_counters set last = ${beforeLast} where year = ${beforeYear}`;
      }
      beforeYear = null;
      beforeLast = undefined;
    });

    it("liefert das Format JJJJ-NNNN", async () => {
      const [{ year }] = await sql<{ year: number }[]>`
        select extract(year from now() at time zone 'Europe/Zurich')::int as year
      `;
      const [existing] = await sql<{ last: number }[]>`
        select last from inquiry_counters where year = ${year}
      `;
      beforeYear = year;
      beforeLast = existing?.last;

      const [row] = await sql<{ next_inquiry_number: string }[]>`
        select next_inquiry_number()
      `;

      expect(row.next_inquiry_number).toMatch(/^\d{4}-\d{4,}$/);
    });
  });

  describe("Zeitspalten", () => {
    it("timestamptz kommt als echter ISO-8601-String (UTC, 'Z'-Suffix) zurück", async () => {
      const [row] = await sql<{ ts: string }[]>`
        select '2026-09-16 12:34:56.789+02'::timestamptz as ts
      `;

      expect(typeof row.ts).toBe("string");
      expect(row.ts).toBe("2026-09-16T10:34:56.789Z");
      expect(new Date(row.ts).toISOString()).toBe(row.ts);
    });

    // Kein Test für `timestamp` ohne Zeitzone mit einem festen erwarteten
    // String: ohne Offset interpretiert `new Date(...)` (lib/db/client.ts)
    // den Text zwangsläufig in der Zeitzone des Node-Prozesses, das Ergebnis
    // wäre also von der TZ der Testmaschine abhängig (siehe Kommentar dort).
    // Aktuell keine Spalte im Schema mit reinem `timestamp` (nur `date` und
    // `timestamptz`, siehe db/migrations/0001_init.sql).

    it("date bleibt reiner 'YYYY-MM-DD'-Text ohne Zeitanteil", async () => {
      const [row] = await sql<{ d: string }[]>`
        select '2026-09-16'::date as d
      `;

      expect(row.d).toBe("2026-09-16");
    });
  });
});
