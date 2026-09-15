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
  FollowUpRuleValidationError,
  updateRule,
  UnknownPlaceholderError,
  type FollowUpRuleInput,
} from "@/lib/admin/followups";

function hasSupabaseEnv(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

const admin = createAdminClient();
const RUN_ID = Date.now();

// Bereichsprüfung (Prüfbefund admin-followups, Punkt 4): days_after_reply
// 1..365, max_count 1..10, Betreff/Text nicht leer. assertValidRuleInput()
// wirft VOR jedem DB-Zugriff (siehe lib/admin/followups.ts), die Tests hier
// brauchen deshalb keine echte Verbindung - createAdminClient() oben baut
// nur ein Client-Objekt, ohne Netzwerkzugriff.
describe("Follow-up-Regel-Bereichsprüfung (createRule/updateRule)", () => {
  const base: FollowUpRuleInput = {
    name: "Bereichsprüfung-Test",
    daysAfterReply: 14,
    subject: "Betreff {{nummer}}",
    body: "Text {{vorname}}",
    maxCount: 1,
    active: true,
    sort: 0,
  };

  it.each([
    ["0 Tage (unterhalb 1)", { daysAfterReply: 0 }],
    ["366 Tage (oberhalb 365)", { daysAfterReply: 366 }],
    ["negative Tage", { daysAfterReply: -1 }],
    ["nicht ganzzahlige Tage", { daysAfterReply: 14.5 }],
  ])("lehnt days_after_reply ausserhalb 1..365 ab (%s)", async (_label, patch) => {
    const input: FollowUpRuleInput = { ...base, ...patch };
    await expect(createRule(input, admin)).rejects.toBeInstanceOf(FollowUpRuleValidationError);
    await expect(updateRule("irrelevant-id", input, admin)).rejects.toBeInstanceOf(FollowUpRuleValidationError);
  });

  it.each([
    ["0 (unterhalb 1)", { maxCount: 0 }],
    ["11 (oberhalb 10)", { maxCount: 11 }],
    ["negativ", { maxCount: -1 }],
    ["nicht ganzzahlig", { maxCount: 2.5 }],
  ])("lehnt max_count ausserhalb 1..10 ab (%s)", async (_label, patch) => {
    const input: FollowUpRuleInput = { ...base, ...patch };
    await expect(createRule(input, admin)).rejects.toBeInstanceOf(FollowUpRuleValidationError);
  });

  it("lehnt leeren Betreff ab", async () => {
    const input: FollowUpRuleInput = { ...base, subject: "   " };
    await expect(createRule(input, admin)).rejects.toBeInstanceOf(FollowUpRuleValidationError);
  });

  it("lehnt leeren Text ab", async () => {
    const input: FollowUpRuleInput = { ...base, body: "" };
    await expect(createRule(input, admin)).rejects.toBeInstanceOf(FollowUpRuleValidationError);
  });

  it("prüft den Bereich VOR den Platzhaltern (Fehlermeldung nennt den Bereich, nicht Platzhalter)", async () => {
    // maxCount ungültig UND ein unbekannter Platzhalter zugleich: die
    // Bereichsprüfung muss zuerst greifen (siehe assertValidRuleInput() vor
    // assertKnownPlaceholders() in createRule()/updateRule()).
    const input: FollowUpRuleInput = { ...base, maxCount: 99, body: "Hallo {{unbekannt}}" };
    await expect(createRule(input, admin)).rejects.toThrow(/1 und 10/);
  });
});

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

  it("legt eine Regel an den Grenzwerten an (days_after_reply=1/365, max_count=1/10) - Bereichsprüfung lehnt sie nicht ab", async () => {
    const lowerBound: FollowUpRuleInput = {
      ...validInput,
      name: `Test-Regel Grenzwert unten ${RUN_ID}`,
      daysAfterReply: 1,
      maxCount: 1,
    };
    const upperBound: FollowUpRuleInput = {
      ...validInput,
      name: `Test-Regel Grenzwert oben ${RUN_ID}`,
      daysAfterReply: 365,
      maxCount: 10,
    };

    const lowerId = await createRule(lowerBound, admin);
    createdIds.push(lowerId);
    const upperId = await createRule(upperBound, admin);
    createdIds.push(upperId);

    const { data } = await admin
      .from("follow_up_rules")
      .select("id, days_after_reply, max_count")
      .in("id", [lowerId, upperId]);
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: lowerId, days_after_reply: 1, max_count: 1 }),
        expect.objectContaining({ id: upperId, days_after_reply: 365, max_count: 10 }),
      ]),
    );
  });
});
