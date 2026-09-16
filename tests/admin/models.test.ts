// lib/admin/models.ts gegen die lokale DB: Modell-Update (short_text der
// Baureihe) und Rücksetzen. Verwendet die Platzhalter-Baureihe "wiesmann"
// (db/seed.sql, has_pricelist = false), damit kein echter, per Excel-Import
// gepflegter Katalogeintrag angefasst wird. Liest den ursprünglichen
// short_text zuerst und setzt ihn am Ende exakt zurück - kein bleibender
// Unterschied zum Ausgangszustand.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers/db";
import { getFamilyDetailForAdmin, updateFamilyMeta } from "@/lib/admin/models";

const FAMILY_SLUG = "wiesmann";
const TEST_SHORT_TEXT = `Test-Kurzbeschrieb models.test.ts ${Date.now()}`;

describe("updateFamilyMeta() gegen die lokale DB", () => {
  let familyId: string;
  let originalShortText: string | null;

  beforeAll(async () => {
    const [row] = await sql<{ id: string; short_text: string | null }[]>`
      select id, short_text from model_families where slug = ${FAMILY_SLUG}
    `;
    if (!row) throw new Error(`Platzhalter-Baureihe "${FAMILY_SLUG}" fehlt (db/seed.sql, npm run db:seed).`);
    familyId = row.id;
    originalShortText = row.short_text;
  });

  afterAll(async () => {
    if (!familyId) return;
    await sql`update model_families set short_text = ${originalShortText} where id = ${familyId}`;
  });

  it("aktualisiert short_text und liest ihn über getFamilyDetailForAdmin() wieder aus", async () => {
    await updateFamilyMeta(familyId, { shortText: TEST_SHORT_TEXT });

    const detail = await getFamilyDetailForAdmin(FAMILY_SLUG);
    expect(detail?.shortText).toBe(TEST_SHORT_TEXT);
  });

  it("setzt short_text wieder auf den Ausgangswert zurück", async () => {
    await updateFamilyMeta(familyId, { shortText: originalShortText });

    const detail = await getFamilyDetailForAdmin(FAMILY_SLUG);
    expect(detail?.shortText).toBe(originalShortText);
  });

  it("übernimmt name NICHT bei Familien mit Preisliste (hier: Platzhalter ohne Preisliste, name wird übernommen)", async () => {
    // Gegenprobe zur has_pricelist-Guard in updateFamilyMeta(): die
    // Platzhalter-Familie hat has_pricelist=false, ein Name-Update muss hier
    // also greifen (anders als bei einer echten, per Excel gepflegten
    // Familie) - und wird sofort wieder zurückgesetzt.
    const [before] = await sql<{ name: string; has_pricelist: boolean }[]>`
      select name, has_pricelist from model_families where id = ${familyId}
    `;
    expect(before?.has_pricelist).toBe(false);
    const originalName = before!.name;

    await updateFamilyMeta(familyId, { name: `${originalName} (Test)` });
    const [renamed] = await sql<{ name: string }[]>`select name from model_families where id = ${familyId}`;
    expect(renamed?.name).toBe(`${originalName} (Test)`);

    await updateFamilyMeta(familyId, { name: originalName });
    const [restored] = await sql<{ name: string }[]>`select name from model_families where id = ${familyId}`;
    expect(restored?.name).toBe(originalName);
  });
});
