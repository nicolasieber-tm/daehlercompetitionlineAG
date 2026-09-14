// lib/admin/models.ts gegen die lokale DB: Modell-Update (short_text der
// Baureihe) und Rücksetzen (Aufgabenstellung). Verwendet die Platzhalter-
// Baureihe "wiesmann" (supabase/seed.sql, has_pricelist = false), damit kein
// echter, per Excel-Import gepflegter Katalogeintrag angefasst wird. Liest
// den ursprünglichen short_text zuerst und setzt ihn am Ende exakt zurück -
// kein bleibender Unterschied zum Ausgangszustand.
try {
  process.loadEnvFile(".env");
} catch {
  // Datei fehlt oder Variablen sind bereits gesetzt (z. B. CI).
}

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFamilyDetailForAdmin, updateFamilyMeta } from "@/lib/admin/models";

function hasSupabaseEnv(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

const admin = createAdminClient();
const FAMILY_SLUG = "wiesmann";
const TEST_SHORT_TEXT = `Test-Kurzbeschrieb models.test.ts ${Date.now()}`;

describe.skipIf(!hasSupabaseEnv())("updateFamilyMeta() gegen die lokale DB", () => {
  let familyId: string;
  let originalShortText: string | null;

  beforeAll(async () => {
    const { data, error } = await admin.from("model_families").select("id, short_text").eq("slug", FAMILY_SLUG).single();
    if (error) throw error;
    familyId = data.id;
    originalShortText = data.short_text;
  });

  afterAll(async () => {
    if (!familyId) return;
    await admin.from("model_families").update({ short_text: originalShortText }).eq("id", familyId);
  });

  it("aktualisiert short_text und liest ihn über getFamilyDetailForAdmin() wieder aus", async () => {
    await updateFamilyMeta(familyId, { shortText: TEST_SHORT_TEXT }, admin);

    const detail = await getFamilyDetailForAdmin(FAMILY_SLUG, admin);
    expect(detail?.shortText).toBe(TEST_SHORT_TEXT);
  });

  it("setzt short_text wieder auf den Ausgangswert zurück", async () => {
    await updateFamilyMeta(familyId, { shortText: originalShortText }, admin);

    const detail = await getFamilyDetailForAdmin(FAMILY_SLUG, admin);
    expect(detail?.shortText).toBe(originalShortText);
  });

  it("übernimmt name NICHT bei Familien mit Preisliste (hier: Platzhalter ohne Preisliste, name wird übernommen)", async () => {
    // Gegenprobe zur has_pricelist-Guard in updateFamilyMeta(): die
    // Platzhalter-Familie hat has_pricelist=false, ein Name-Update muss hier
    // also greifen (anders als bei einer echten, per Excel gepflegten
    // Familie) - und wird sofort wieder zurückgesetzt.
    const { data: before } = await admin.from("model_families").select("name, has_pricelist").eq("id", familyId).single();
    expect(before?.has_pricelist).toBe(false);
    const originalName = before!.name;

    await updateFamilyMeta(familyId, { name: `${originalName} (Test)` }, admin);
    const { data: renamed } = await admin.from("model_families").select("name").eq("id", familyId).single();
    expect(renamed?.name).toBe(`${originalName} (Test)`);

    await updateFamilyMeta(familyId, { name: originalName }, admin);
    const { data: restored } = await admin.from("model_families").select("name").eq("id", familyId).single();
    expect(restored?.name).toBe(originalName);
  });
});
