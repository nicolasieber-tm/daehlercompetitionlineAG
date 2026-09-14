// lib/admin/followups.ts gegen die lokale DB: Regel-Validierung (unbekannte
// Platzhalter blockieren das Speichern, siehe Aufgabenstellung) und
// löschen/deaktivieren. Räumt die selbst angelegte Test-Regel am Ende auf.
try {
  process.loadEnvFile(".env");
} catch {
  // Datei fehlt oder Variablen sind bereits gesetzt (z. B. CI).
}

import { afterAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createRule,
  deleteOrDeactivateRule,
  updateRule,
  UnknownPlaceholderError,
  type FollowUpRuleInput,
} from "@/lib/admin/followups";

function hasSupabaseEnv(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

const admin = createAdminClient();
const RUN_ID = Date.now();

describe.skipIf(!hasSupabaseEnv())("Follow-up-Regeln, Validierung und Löschen", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    for (const id of createdIds) {
      await admin.from("follow_up_rules").delete().eq("id", id);
    }
  });

  const validInput: FollowUpRuleInput = {
    name: `Test-Regel ${RUN_ID}`,
    daysAfterReply: 14,
    subject: "Ihre Anfrage bei dÄHLer, Nr. {{nummer}}",
    body: "Guten Tag {{vorname}} {{name}}, betreffend {{fahrzeug}}.",
    maxCount: 1,
    active: false,
    sort: 999,
  };

  it("lehnt einen unbekannten Platzhalter im Text ab, ohne die Regel anzulegen", async () => {
    const input: FollowUpRuleInput = { ...validInput, body: "Hallo {{vorname}}, Ihr {{modell}} ist bereit." };
    await expect(createRule(input, admin)).rejects.toBeInstanceOf(UnknownPlaceholderError);

    const { data } = await admin.from("follow_up_rules").select("id").eq("name", input.name);
    expect(data ?? []).toHaveLength(0);
  });

  it("lehnt einen unbekannten Platzhalter im Betreff ab", async () => {
    const input: FollowUpRuleInput = { ...validInput, subject: "Nachfrage zu {{auto}}" };
    await expect(createRule(input, admin)).rejects.toThrow(/auto/);
  });

  it("legt eine Regel mit nur bekannten Platzhaltern an, aktualisiert sie und löscht sie wieder (keine offenen follow_ups)", async () => {
    const id = await createRule(validInput, admin);
    createdIds.push(id);

    const { data: created, error } = await admin
      .from("follow_up_rules")
      .select("name, days_after_reply, active")
      .eq("id", id)
      .single();
    expect(error).toBeNull();
    expect(created?.name).toBe(validInput.name);
    expect(created?.days_after_reply).toBe(14);
    expect(created?.active).toBe(false);

    await updateRule(id, { ...validInput, daysAfterReply: 21 }, admin);
    const { data: updated } = await admin.from("follow_up_rules").select("days_after_reply").eq("id", id).single();
    expect(updated?.days_after_reply).toBe(21);

    const result = await deleteOrDeactivateRule(id, admin);
    expect(result.deleted).toBe(true);
    createdIds.splice(createdIds.indexOf(id), 1);

    const { data: afterDelete } = await admin.from("follow_up_rules").select("id").eq("id", id);
    expect(afterDelete ?? []).toHaveLength(0);
  });
});
